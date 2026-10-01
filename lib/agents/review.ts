import { getDb, persistDb } from "@/lib/db/client";
import { tasks, agents, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { uid } from "@/lib/utils";
import { publish } from "@/lib/sse-bus";
import { logActivity } from "./manager";
import { type ApiKeys } from "@/lib/llm-provider";
import { callLLMMetered } from "@/lib/usage-meter";
import { emitThought } from "./live";
import { saveMemory } from "@/lib/memory/memory-manager";

/** Revision rounds before the manager auto-approves. */
export const MAX_REVIEW_ROUNDS = 2;

/** Pure cap check: round N means N revision feedbacks have been issued already. */
export function shouldAutoApprove(round: number): boolean {
  return round >= MAX_REVIEW_ROUNDS;
}

export interface ReviewVerdict {
  approved: boolean;
  feedback: string;
}

/** Parse a manager verdict line: "APPROVE" or "REVISE: <feedback>". */
export function parseReviewVerdict(text: string): ReviewVerdict {
  const t = (text ?? "").trim();
  if (/^approve\b/i.test(t)) return { approved: true, feedback: "" };
  const m = /^(revise|reject|request[- ]changes)\s*:?\s*([\s\S]*)/i.exec(t);
  if (m) return { approved: false, feedback: (m[2] ?? "").trim().slice(0, 500) || "Please revise and resubmit." };
  if (/approv/i.test(t)) return { approved: true, feedback: "" };
  return { approved: false, feedback: t.slice(0, 500) || "Please revise and resubmit." };
}

/** Demo heuristic: approve solid deliverables, auto-approve past the cap. */
export function demoReviewDecide(deliverable: string, round: number): ReviewVerdict {
  if (shouldAutoApprove(round)) return { approved: true, feedback: "" };
  if ((deliverable ?? "").trim().length >= 40) return { approved: true, feedback: "" };
  return { approved: false, feedback: "Deliverable looks thin — add concrete details, then resubmit." };
}

export interface ReviewTaskOptions {
  projectId: string;
  taskId: string;
  model: string;
  keys: ApiKeys;
  demoMode: boolean;
  managerId?: string | null;
}

export type ReviewOutcome = "approved" | "revised";

/**
 * Manager review step for the goal pipeline. The task must be in "review".
 * Approve -> "done" with celebration + learning memory.
 * Request revision -> "doing" with feedback message (cap: 2 rounds, then auto-approve).
 */
export async function reviewTask(opts: ReviewTaskOptions): Promise<ReviewOutcome> {
  const db = await getDb();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, opts.taskId));
  if (!task) return "approved";
  if (task.status !== "review") return "approved";

  const [assignee] = task.assigneeAgentId
    ? await db.select().from(agents).where(eq(agents.id, task.assigneeAgentId))
    : [];
  let manager = null as { id: string; name: string; model?: string | null } | null;
  if (opts.managerId) {
    const [m] = await db.select().from(agents).where(eq(agents.id, opts.managerId));
    if (m) manager = m;
  }
  if (!manager) {
    const all = await db.select().from(agents);
    manager = all.find((a) => a.role.toLowerCase() === "manager") ?? assignee ?? null;
  }
  // Reviews run on the manager agent's own model, falling back to the default.
  const { resolveAgentModel } = await import("@/lib/llm-provider");
  const modelRef = resolveAgentModel(manager?.model, opts.model);

  const priorFeedback = await db
    .select()
    .from(messages)
    .where(and(eq(messages.taskId, task.id), eq(messages.type, "review")));
  const round = priorFeedback.length;

  const chat = await db
    .select()
    .from(messages)
    .where(and(eq(messages.taskId, task.id), eq(messages.type, "chat")));
  const deliverable = chat.length > 0 ? chat[chat.length - 1].content : "";

  if (manager) emitThought(opts.projectId, manager.id, `Reviewing "${task.title.slice(0, 80)}"${round > 0 ? ` (round ${round + 1})` : ""}…`, task.id);
  let verdict: ReviewVerdict;
  if (shouldAutoApprove(round)) {
    verdict = { approved: true, feedback: "" };
    if (manager) emitThought(opts.projectId, manager.id, "Revision cap reached — auto-approving.", task.id);
  } else if (opts.demoMode) {
    verdict = demoReviewDecide(deliverable, round);
    await sleep(800);
  } else {
    try {
      const { text } = await callLLMMetered(
        {
          model: modelRef,
          apiKeys: opts.keys,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You are the team manager reviewing a deliverable. Reply with exactly one line: either 'APPROVE' when the work is acceptable, or 'REVISE: <one or two sentences of specific, actionable feedback>'.",
            },
            { role: "user", content: `Task: ${task.title}\nDetails: ${task.description ?? ""}\nDeliverable:\n${deliverable || "(no deliverable text)"}` },
          ],
        },
        { projectId: opts.projectId, agentName: manager?.name ?? "Manager", taskId: task.id }
      );
      verdict = parseReviewVerdict(text ?? "");
    } catch {
      verdict = demoReviewDecide(deliverable, round);
    }
  }
  if (manager) {
    emitThought(
      opts.projectId,
      manager.id,
      verdict.approved ? `Approved "${task.title.slice(0, 80)}".` : `Requesting revisions: ${verdict.feedback.slice(0, 140)}`,
      task.id
    );
  }

  if (verdict.approved) {
    // G4 fallback: a worker that finished without saving an artifact gets its
    // final chat message auto-saved as notes.md, so every done task opens something.
    try {
      const { writeArtifact, artifactExists } = await import("@/lib/artifacts");
      let linked: string[] = [];
      try {
        const parsed = JSON.parse((task.artifacts as unknown as string) ?? "[]");
        if (Array.isArray(parsed)) linked = parsed.map(String);
      } catch {
        linked = [];
      }
      if (linked.length === 0 && deliverable.trim()) {
        let name = "notes.md";
        for (let n = 2; n < 50 && artifactExists(opts.projectId, name); n++) name = `notes-${n}.md`;
        await writeArtifact(opts.projectId, task.id, name, `# ${task.title}\n\n${deliverable.trim()}\n`);
      }
    } catch {
      /* fallback is best-effort; approval still stands */
    }
    await setTaskStatus(opts.projectId, task.id, "done");
    publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: task.assigneeAgentId, status: "idle", currentTaskId: null } });
    if (manager) {
      publish({ projectId: opts.projectId, kind: "agent-say", payload: { agentId: manager.id, text: `Approved — nice work on "${task.title.slice(0, 60)}"! ✅` } });
    }
    const who = assignee?.name ?? "Agent";
    await saveMemory({
      projectId: opts.projectId,
      agentId: task.assigneeAgentId,
      type: "learning",
      content: `${who} completed "${task.title}" (manager approved${round > 0 ? ` after ${round} revision${round > 1 ? "s" : ""}` : ""}).`,
    }).catch(() => undefined);
    await logActivity(opts.projectId, "done", `${who} finished "${task.title}" 🎉`);
    publish({ projectId: opts.projectId, kind: "toast", payload: { title: "Task done", message: `${who} finished "${task.title}"` } });
    return "approved";
  }

  await db.insert(messages).values({
    id: uid("msg"),
    taskId: task.id,
    agentId: manager?.id ?? null,
    projectId: opts.projectId,
    content: `Revision requested: ${verdict.feedback}`,
    type: "review",
    createdAt: Date.now(),
  });
  persistDb();
  await setTaskStatus(opts.projectId, task.id, "doing");
  if (manager) {
    publish({ projectId: opts.projectId, kind: "agent-say", payload: { agentId: manager.id, text: `Needs changes: ${verdict.feedback.slice(0, 120)}` } });
  }
  await logActivity(opts.projectId, "manager", `Manager requested revisions on "${task.title}" (round ${round + 1}/${MAX_REVIEW_ROUNDS})`);
  return "revised";
}

async function setTaskStatus(projectId: string, taskId: string, status: string) {
  const db = await getDb();
  await db.update(tasks).set({ status, updatedAt: Date.now() }).where(eq(tasks.id, taskId));
  persistDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (row) publish({ projectId, kind: "task-update", payload: { task: row } });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
