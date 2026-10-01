import { getDb } from "@/lib/db/client";
import { agents, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publish } from "@/lib/sse-bus";
import { type ApiKeys } from "@/lib/llm-provider";
import { callLLMMetered } from "@/lib/usage-meter";
import { emitThought } from "./live";
import { uid } from "@/lib/utils";

/** Scripted teammate replies used in demo mode (or when the LLM is unavailable). */
export const TEAMMATE_REPLIES = [
  "Good question — I'd go with the simplest approach that covers the main case.",
  "Hmm, let me think… I'd double-check the edge cases, then commit to it.",
  "From my side that looks solid. Keep going!",
  "I'd break that into two smaller steps — easier to verify each one.",
  "Nice framing! My take: prototype it fast, then polish what works.",
  "I'd check the whiteboard — we sketched something related earlier.",
];

export function hasLlmKeys(keys: ApiKeys): boolean {
  return Object.values(keys ?? {}).some((v) => typeof v === "string" && v.trim().length > 0);
}

export interface AskTeammateOptions {
  projectId: string;
  requesterId: string;
  teammateName: string;
  question: string;
  taskId?: string | null;
  model: string;
  keys: ApiKeys;
  demoMode: boolean;
}

/** Find a teammate of the requester by (case-insensitive) name. Null when nobody matches. */
export async function findTeammate(projectId: string, requesterId: string, teammateName: string) {
  void projectId; // agents are mirrored client-side without a project link; match by name
  const db = await getDb();
  const all = await db.select().from(agents);
  const want = teammateName.trim().toLowerCase();
  return (
    all.find((a) => a.id !== requesterId && a.name.toLowerCase() === want) ??
    all.find((a) => a.id !== requesterId && a.name.toLowerCase().includes(want)) ??
    null
  );
}

/**
 * Visible collaboration: the requester walks to the teammate, they exchange
 * speech bubbles, and the teammate answers (LLM when keys exist, else scripted).
 * Fully functional in demoMode. Returns the teammate's reply text.
 */
export async function orchestrateAskTeammate(opts: AskTeammateOptions): Promise<string> {
  const db = await getDb();
  const [requester] = await db.select().from(agents).where(eq(agents.id, opts.requesterId));
  const mate = await findTeammate(opts.projectId, opts.requesterId, opts.teammateName);
  if (!requester || !mate) {
    return `Couldn't find a teammate named "${opts.teammateName}" — carrying on solo.`;
  }

  const question = opts.question.trim().slice(0, 220) || "Got a minute for a quick question?";
  emitThought(opts.projectId, requester.id, `Walking over to ask ${mate.name} for input…`, opts.taskId ?? null);
  publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: requester.id, status: "walking", currentTaskId: opts.taskId ?? null } });
  publish({ projectId: opts.projectId, kind: "agent-move", payload: { agentId: requester.id, x: (mate.x ?? 0) + 44, y: (mate.y ?? 0) + 18 } });
  await sleep(1600);

  publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: requester.id, status: "talking", currentTaskId: opts.taskId ?? null } });
  publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: mate.id, status: "talking", currentTaskId: null } });
  publish({ projectId: opts.projectId, kind: "agent-say", payload: { agentId: requester.id, text: `Hey ${mate.name} — ${question}`.slice(0, 240) } });
  await addMessage(opts.taskId ?? null, requester.id, opts.projectId, `Asked ${mate.name}: ${question}`, "chat");
  await sleep(1400);

  let reply: string | null = null;
  emitThought(opts.projectId, mate.id, `Thinking about ${requester.name}'s question…`, opts.taskId ?? null);
  if (!opts.demoMode && hasLlmKeys(opts.keys)) {
    try {
      // The teammate answers on their own agent model, falling back to the default.
      const { resolveAgentModel } = await import("@/lib/llm-provider");
      const { text } = await callLLMMetered(
        {
          model: resolveAgentModel(mate.model, opts.model),
          apiKeys: opts.keys,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: `You are ${mate.name}, a ${mate.role} in a simulated AI office. Personality: ${mate.personalityPrompt || "helpful professional"}. Your teammate ${requester.name} walked over and asked you a question. Answer in character in 1-2 short sentences (under 60 words). Be concrete and helpful.`,
            },
            { role: "user", content: question },
          ],
        },
        { projectId: opts.projectId, agentName: mate.name, taskId: opts.taskId ?? null }
      );
      reply = text?.trim() || null;
    } catch {
      reply = null;
    }
  }
  if (!reply) reply = TEAMMATE_REPLIES[Math.floor(Math.random() * TEAMMATE_REPLIES.length)];

  publish({ projectId: opts.projectId, kind: "agent-say", payload: { agentId: mate.id, text: reply.slice(0, 240) } });
  await addMessage(opts.taskId ?? null, mate.id, opts.projectId, `${mate.name} replied: ${reply}`, "chat");
  emitThought(opts.projectId, requester.id, `Got input from ${mate.name} — resuming work.`, opts.taskId ?? null);
  await sleep(1400);

  publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: requester.id, status: "working", currentTaskId: opts.taskId ?? null } });
  publish({ projectId: opts.projectId, kind: "agent-status", payload: { agentId: mate.id, status: "idle", currentTaskId: null } });
  return reply;
}

async function addMessage(taskId: string | null, agentId: string | null, projectId: string, content: string, type: string) {
  try {
    const db = await getDb();
    await db.insert(messages).values({ id: uid("msg"), taskId, agentId, projectId, content, type, createdAt: Date.now() });
  } catch {
    /* ignore */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
