import { getDb, persistDb } from "@/lib/db/client";
import { tasks, agents, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { uid } from "@/lib/utils";
import { publish } from "@/lib/sse-bus";
import { logActivity } from "./manager";
import { resolveAgentModel, type ApiKeys } from "@/lib/llm-provider";
import { callLLMMetered } from "@/lib/usage-meter";
import { agentTools } from "./tools";
import { orchestrateAskTeammate } from "./collaboration";
import { emitThought } from "./live";
import type { WebhookConfig } from "@/lib/integrations";

export interface RunTaskOptions {
  projectId: string;
  taskId: string;
  model: string;
  keys: ApiKeys;
  demoMode: boolean;
  officeId: string;
  webhooks?: WebhookConfig[];
  /** Set when re-running after a manager revision request (bypasses the pickup guard). */
  revisionAttempt?: number;
}

function say(projectId: string, agentId: string, text: string) {
  publish({ projectId, kind: "agent-say", payload: { agentId, text } });
}

function setStatus(projectId: string, agentId: string, status: string, taskId?: string | null) {
  publish({ projectId, kind: "agent-status", payload: { agentId, status, currentTaskId: taskId ?? null } });
}

async function setTaskStatus(projectId: string, taskId: string, status: string) {
  const db = await getDb();
  await db.update(tasks).set({ status, updatedAt: Date.now() }).where(eq(tasks.id, taskId));
  persistDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (row) publish({ projectId, kind: "task-update", payload: { task: row } });
}

async function addMessage(taskId: string | null, agentId: string | null, projectId: string, content: string, type: string) {
  try {
    const db = await getDb();
    await db.insert(messages).values({ id: uid("msg"), taskId, agentId, projectId, content, type, createdAt: Date.now() });
    persistDb();
  } catch {
    /* ignore */
  }
}

async function latestReviewFeedback(taskId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select().from(messages).where(and(eq(messages.taskId, taskId), eq(messages.type, "review")));
    return rows.length > 0 ? rows[rows.length - 1].content : null;
  } catch {
    return null;
  }
}

/** Worker flow: pick up task -> think -> work (LLM+tools or demo script) -> review. */
export async function runWorkerOnTask(opts: RunTaskOptions) {
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, opts.taskId));
  if (!task || !task.assigneeAgentId) return;
  const [agent] = await db.select().from(agents).where(eq(agents.id, task.assigneeAgentId));
  if (!agent) return;
  if (task.status === "done") return;
  if ((task.status === "doing" || task.status === "review") && !opts.revisionAttempt) return;

  const revision = opts.revisionAttempt ?? 0;
  await setTaskStatus(opts.projectId, task.id, "doing");
  setStatus(opts.projectId, agent.id, "thinking", task.id);
  const feedback = revision > 0 ? await latestReviewFeedback(task.id) : null;
  await addMessage(task.id, agent.id, opts.projectId, revision > 0 ? `Reworking "${task.title}" (attempt ${revision + 1})` : `Picked up "${task.title}"`, "action");
  await logActivity(opts.projectId, "work", revision > 0 ? `${agent.name} is revising "${task.title}"` : `${agent.name} started "${task.title}"`);
  say(opts.projectId, agent.id, revision > 0 ? "Reworking based on feedback…" : `On it — ${task.title}`);
  emitThought(opts.projectId, agent.id, revision > 0 ? `Reworking "${task.title}" (attempt ${revision + 1})…` : `Picked up "${task.title}" — planning the approach…`, task.id);

  if (opts.demoMode) {
    await demoWork(opts.projectId, agent.id, task.id, task.title, agent.role, { revisionAttempt: revision });
  } else {
    try {
      await llmWork(opts, agent.id, agent.name, agent.role, agent.personalityPrompt ?? "", task.title, task.description ?? "", feedback);
    } catch {
      await logActivity(opts.projectId, "system", `${agent.name}: LLM call failed, used fallback notes.`);
      emitThought(opts.projectId, agent.id, "LLM call failed — falling back to quick notes.", task.id);
      await demoWork(opts.projectId, agent.id, task.id, task.title, agent.role, { quiet: true, revisionAttempt: revision });
    }
  }

  // Workers hand off to the manager review step instead of finishing directly.
  await setTaskStatus(opts.projectId, task.id, "review");
  setStatus(opts.projectId, agent.id, "idle", task.id);
  say(opts.projectId, agent.id, "Ready for review 👀");
  await logActivity(opts.projectId, "work", `${agent.name} submitted "${task.title}" for review`);
}

const DEMO_QUESTIONS: Record<string, string> = {
  developer: "does this approach handle the edge cases?",
  designer: "does this feel clean and readable to you?",
  researcher: "am I missing any good sources here?",
  qa: "anything you'd test that I haven't covered?",
  writer: "does this read clearly?",
};

async function demoWork(
  projectId: string,
  agentId: string,
  taskId: string,
  title: string,
  role: string,
  opts: { quiet?: boolean; revisionAttempt?: number } = {}
) {
  const lines: Record<string, string[]> = {
    developer: ["Sketching the implementation…", "Writing the code…", "Running a quick self-check…"],
    designer: ["Exploring layout ideas…", "Refining the visual spec…", "Polishing the details…"],
    researcher: ["Gathering sources…", "Comparing options…", "Summarizing findings…"],
    qa: ["Writing test cases…", "Verifying edge cases…", "Confirming quality…"],
    writer: ["Drafting an outline…", "Writing the copy…", "Tightening the prose…"],
    manager: ["Coordinating…", "Reviewing progress…", "Wrapping up…"],
  };
  const steps = lines[role.toLowerCase()] ?? lines.manager;
  setStatus(projectId, agentId, "working", taskId);
  for (let i = 0; i < steps.length; i++) {
    const line = steps[i];
    if (!opts.quiet) say(projectId, agentId, line);
    await addMessage(taskId, agentId, projectId, line, "thought");
    emitThought(projectId, agentId, line, taskId);
    await sleep(1400);
    // Mid-task collaboration: walk over to a teammate and ask for input.
    if (i === 0 && !opts.quiet) {
      await demoCollaborate(projectId, agentId, taskId, title, role).catch(() => undefined);
    }
  }
  const attemptNote = (opts.revisionAttempt ?? 0) > 0 ? ` Revision ${opts.revisionAttempt} addresses the manager's feedback.` : "";
  await addMessage(taskId, agentId, projectId, `Demo deliverable notes for "${title}" (connect an API key in Settings for real LLM output).${attemptNote}`, "chat");
  emitThought(projectId, agentId, "Draft done — submitting for manager review.", taskId);
}

async function demoCollaborate(projectId: string, agentId: string, taskId: string, title: string, role: string) {
  const db = await getDb();
  const all = await db.select().from(agents);
  const mate = all.find((a) => a.id !== agentId);
  if (!mate) return;
  const flavor = DEMO_QUESTIONS[role.toLowerCase()] ?? "got a quick second?";
  await orchestrateAskTeammate({
    projectId,
    requesterId: agentId,
    teammateName: mate.name,
    question: `Quick check on "${title}" — ${flavor}`,
    taskId,
    model: "openai:gpt-4o-mini",
    keys: {},
    demoMode: true,
  });
}

async function llmWork(
  opts: RunTaskOptions,
  agentId: string,
  name: string,
  role: string,
  personality: string,
  title: string,
  desc: string,
  feedback: string | null
) {
  setStatus(opts.projectId, agentId, "working", opts.taskId);
  // Each worker runs on its own agent model, falling back to the system default.
  const db = await getDb();
  const [row] = await db.select().from(agents).where(eq(agents.id, agentId));
  const modelRef = resolveAgentModel(row?.model, opts.model);
  const { searchMemories } = await import("@/lib/memory/memory-manager");
  const mems = await searchMemories(opts.projectId, `${title} ${desc}`, 3).catch(() => []);
  const memBlock = mems.length ? `\nRelevant project memory:\n${mems.map((m) => `- [${m.type}] ${m.content}`).join("\n")}` : "";
  say(opts.projectId, agentId, "Thinking it through…");
  emitThought(opts.projectId, agentId, mems.length ? `Found ${mems.length} relevant memor${mems.length > 1 ? "ies" : "y"} — drafting with ${modelRef}…` : `No relevant memories — drafting with ${modelRef}…`, opts.taskId);
  const { text, usage } = await callLLMMetered(
    {
      model: modelRef,
      apiKeys: opts.keys,
      tools: agentTools(opts.projectId, opts.officeId, {
        agentId,
        agentName: name,
        taskId: opts.taskId,
        model: modelRef,
        keys: opts.keys,
        demoMode: opts.demoMode,
        webhooks: opts.webhooks,
      }),
      messages: [
        {
          role: "system",
          content: `You are ${name}, a ${role} in a simulated AI office. Personality: ${personality || "helpful professional"}. Do the task below and reply with the concrete deliverable (spec, code, copy, test report — whatever fits). Keep it focused and under 600 words. Save your main deliverable with the write_artifact tool (e.g. 'spec.md', 'report.md'). If you need a teammate's input, use ask_teammate with their name.${memBlock}`,
        },
        {
          role: "user",
          content: `Task: ${title}\nDetails: ${desc}${feedback ? `\nManager feedback from the last review — address every point:\n${feedback}` : ""}`,
        },
      ],
    },
    { projectId: opts.projectId, agentName: name, taskId: opts.taskId }
  );
  emitThought(opts.projectId, agentId, "Deliverable drafted — submitting for manager review.", opts.taskId);
  await addMessage(opts.taskId, agentId, opts.projectId, text || "(empty response)", "chat");
  if (usage) {
    const { estimateCost } = await import("@/lib/llm-provider");
    await logActivity(opts.projectId, "cost", `${name} run cost accounted`, estimateCost(modelRef, usage.promptTokens ?? 0, usage.completionTokens ?? 0));
  }
  say(opts.projectId, agentId, "Done — deliverable is attached to the task.");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
