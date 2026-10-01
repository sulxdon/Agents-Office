import { getDb, persistDb } from "@/lib/db/client";
import { goals, tasks, agents, activities, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { uid } from "@/lib/utils";
import { publish } from "@/lib/sse-bus";
import { assignTask, type Candidate } from "./delegation";
import { resolveAgentModel, type ApiKeys } from "@/lib/llm-provider";
import { callLLMMetered } from "@/lib/usage-meter";
import { emitThought } from "./live";
import { saveMemory } from "@/lib/memory/memory-manager";
import { writeWhiteboard } from "@/lib/whiteboard";

export interface DecomposedTask {
  title: string;
  description: string;
}

// Deterministic fallback when no LLM key is configured (demo mode).
export function mockDecompose(goalTitle: string, goalDesc: string): DecomposedTask[] {
  const g = `${goalTitle} ${goalDesc}`.toLowerCase();
  const pick = (t: string) => g.includes(t);
  void pick;
  return [
    {
      title: `Design plan for: ${goalTitle}`,
      description: `Create the design spec, layout and copy outline needed for "${goalTitle}".`,
    },
    {
      title: `Build: ${goalTitle}`,
      description: `Implement the core deliverable for "${goalTitle}". Produce files/specs as artifacts.`,
    },
    {
      title: `Review & polish: ${goalTitle}`,
      description: `QA-check the work for "${goalTitle}", fix issues, and write a short summary.`,
    },
  ];
}

async function llmDecompose(
  projectId: string,
  goalTitle: string,
  goalDesc: string,
  model: string,
  keys: ApiKeys,
  agentName: string
): Promise<DecomposedTask[]> {
  const { text, usage } = await callLLMMetered(
    {
      model,
      apiKeys: keys,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a project manager breaking a goal into exactly 3 concrete tasks. Reply ONLY with JSON: [{\"title\": string, \"description\": string}]. No markdown fences, no commentary.",
        },
        { role: "user", content: `Goal: ${goalTitle}\nDetails: ${goalDesc || "(none)"}` },
      ],
    },
    { projectId, agentName }
  );
  if (usage) {
    const { estimateCost } = await import("@/lib/llm-provider");
    await logActivity(projectId, "cost", `Planning cost accounted`, estimateCost(model, usage.promptTokens ?? 0, usage.completionTokens ?? 0));
  }
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as DecomposedTask[];
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("bad decomposition");
  return parsed.slice(0, 5).map((t) => ({
    title: String(t.title).slice(0, 160),
    description: String(t.description ?? "").slice(0, 1000),
  }));
}

export async function logActivity(projectId: string, type: string, description: string, cost?: number) {
  const row = { id: uid("act"), projectId, type, description, timestamp: Date.now() };
  try {
    const db = await getDb();
    await db.insert(activities).values(row);
    persistDb();
  } catch {
    /* ignore */
  }
  publish({ projectId, kind: "activity", payload: { activity: row, cost } });
}

export interface RosterEntry {
  id: string;
  name: string;
  role: string;
  skills: string[];
  status: string;
  /** Raw per-agent model ref ("" = inherit the system default). */
  model?: string;
  /** Office room id backing this agent's team (client-owned world state). */
  officeId?: string | null;
  /** Live canvas position (client-owned world state). */
  x?: number;
  y?: number;
}

export interface RunManagerOptions {
  projectId: string;
  goalId: string;
  model: string;
  keys: ApiKeys;
  /** When true, text comes from mockDecompose instead of the LLM (demo mode). */
  demoMode: boolean;
  /** Agent snapshot from the client (the browser owns world state). */
  roster: RosterEntry[];
}

/** Manager flow: decompose goal -> create tasks -> assign -> notify workers. */
export async function runManagerForGoal(opts: RunManagerOptions) {
  const db = await getDb();
  const [goal] = await db.select().from(goals).where(eq(goals.id, opts.goalId));
  if (!goal) throw new Error("goal not found");
  const [project] = await db.select().from(projects).where(eq(projects.id, opts.projectId));

  await logActivity(opts.projectId, "manager", `Manager is breaking down "${goal.title}"…`);
  publish({ projectId: opts.projectId, kind: "goal-update", payload: { goalId: goal.id, status: "active" } });

  let plan: DecomposedTask[];
  // Mirror the client roster into the DB so workers can resolve agents.
  // Full upsert (not just positions): names, roles, skills, and per-agent
  // models change through hire/edit, and the server must see fresh values.
  for (const r of opts.roster) {
    const existing = await db.select().from(agents).where(eq(agents.id, r.id));
    const row = {
      teamId: "team_client",
      name: r.name,
      role: r.role,
      skills: JSON.stringify(r.skills),
      model: r.model ?? "",
      status: "idle",
      x: r.x ?? 0,
      y: r.y ?? 0,
    };
    if (existing.length === 0) {
      await db.insert(agents).values({ id: r.id, ...row }).catch(() => undefined);
    } else {
      await db.update(agents).set(row).where(eq(agents.id, r.id)).catch(() => undefined);
    }
  }
  persistDb();

  // Planning runs on the manager agent's own model (falling back to the default).
  const managerEntry = opts.roster.find((r) => r.role.toLowerCase() === "manager");
  const planModel = resolveAgentModel(managerEntry?.model, opts.model);
  if (managerEntry) emitThought(opts.projectId, managerEntry.id, `Breaking down "${goal.title.slice(0, 80)}" into tasks…`);
  if (opts.demoMode) {
    plan = mockDecompose(goal.title, goal.description ?? "");
    await sleep(900);
  } else {
    try {
      plan = await llmDecompose(opts.projectId, goal.title, goal.description ?? "", planModel, opts.keys, managerEntry?.name ?? "Manager");
    } catch {
      plan = mockDecompose(goal.title, goal.description ?? "");
      await logActivity(opts.projectId, "system", "LLM unavailable — used fallback plan. Check Settings for API keys.");
    }
  }
  const allTasks = await db.select().from(tasks);
  const candidates: Candidate[] = opts.roster.map((a) => ({
    id: a.id,
    role: a.role,
    skills: a.skills,
    status: a.status,
    openTasks: allTasks.filter((t) => t.assigneeAgentId === a.id && t.status !== "done").length,
  }));

  // @mention override: "@Name ..." in the goal description forces assignment.
  const mention = /@([\p{L}\d_]+)/u.exec(`${goal.title} ${goal.description ?? ""}`)?.[1]?.toLowerCase();

  for (const item of plan) {
    let assignee = assignTask(`${item.title} ${item.description}`, candidates);
    if (mention) {
      const forced = opts.roster.find((a) => a.name.toLowerCase() === mention);
      if (forced) assignee = candidates.find((c) => c.id === forced.id) ?? assignee;
    }
    const now = Date.now();
    const row = {
      id: uid("task"),
      goalId: goal.id,
      projectId: opts.projectId,
      title: item.title,
      description: item.description,
      assigneeAgentId: assignee?.id ?? null,
      status: "todo",
      dependencies: "[]",
      artifacts: "[]",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(tasks).values(row);
    persistDb();
    publish({ projectId: opts.projectId, kind: "task-update", payload: { task: row } });
    const who = assignee ? opts.roster.find((a) => a.id === assignee!.id)?.name ?? "Unassigned" : "Unassigned";
    await logActivity(opts.projectId, "delegate", `Manager assigned "${item.title}" to ${who}`);
    const c = candidates.find((x) => x.id === assignee?.id);
    if (c) c.openTasks++;
    if (opts.demoMode) await sleep(700);
  }

  // Post the plan summary to each team office whiteboard.
  const officeIds = [...new Set(opts.roster.map((r) => r.officeId).filter((o): o is string => !!o))];
  if (officeIds.length > 0) {
    const summary = [`🎯 ${goal.title}`, ...plan.map((p, i) => `${i + 1}. ${p.title}`)].join("\n");
    for (const officeId of officeIds) {
      await writeWhiteboard(officeId, summary).catch(() => undefined);
    }
    await logActivity(opts.projectId, "manager", `Manager posted the plan to ${officeIds.length} team whiteboard${officeIds.length > 1 ? "s" : ""}`);
  }

  await saveMemory({
    projectId: opts.projectId,
    type: "decision",
    content: `Project "${project?.name ?? ""}": goal "${goal.title}" decomposed into ${plan.length} tasks: ${plan.map((p) => p.title).join("; ")}.`,
  }).catch(() => undefined);

  await logActivity(opts.projectId, "manager", `Plan ready: ${plan.length} tasks created for "${goal.title}"`);
  return plan;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
