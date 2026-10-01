// Server-side emitters for the live thinking feed (G3).
// Worker / review / collaboration milestones publish short agent-thought
// lines; agentTools execute fns publish agent-tool start/done events.

import { publish } from "@/lib/sse-bus";

export function emitThought(projectId: string, agentId: string, text: string, taskId?: string | null) {
  publish({ projectId, kind: "agent-thought", payload: { agentId, text: text.slice(0, 220), taskId: taskId ?? null } });
}

export function emitTool(
  projectId: string,
  agentId: string,
  toolName: string,
  phase: "start" | "done",
  summary: string,
  taskId?: string | null
) {
  publish({
    projectId,
    kind: "agent-tool",
    payload: { agentId, tool: toolName, phase, summary: summary.slice(0, 220), taskId: taskId ?? null },
  });
}

/** One-line summary of tool args or a tool result for the live feed. */
export function summarizeForFeed(value: unknown, max = 120): string {
  if (value == null) return "(no args)";
  if (typeof value === "string") {
    const s = value.trim().replace(/\s+/g, " ");
    return s.length > max ? `${s.slice(0, max)}…` : s || "(empty)";
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "(no args)";
    const parts = keys.slice(0, 4).map((k) => {
      const v = (value as Record<string, unknown>)[k];
      const s = typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, 40) : JSON.stringify(v)?.slice(0, 40) ?? "";
      return `${k}: ${s}`;
    });
    const joined = parts.join(", ");
    return joined.length > max ? `${joined.slice(0, max)}…` : joined;
  }
  try {
    const s = JSON.stringify(value) ?? "";
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "(unavailable)";
  }
}
