// Live per-agent thinking feed (G3): shared types + pure helpers.
// The store keeps a ring buffer of the last LIVE_FEED_CAP entries per agent
// (live-only, never persisted); the server publishes agent-thought /
// agent-tool SSE events that the client appends via pushLiveEntry.

export interface LiveEntry {
  id: string;
  kind: "thought" | "tool";
  text: string;
  /** Tool name for kind === "tool". */
  toolName?: string;
  /** "start" = call issued, "done" = result summary. */
  phase?: "start" | "done";
  timestamp: number;
  taskId?: string | null;
}

/** Ring-buffer capacity per agent. */
export const LIVE_FEED_CAP = 30;

/**
 * Append an entry, trimming to the newest `cap` entries.
 * Pure + tested. Never mutates the input array.
 */
export function pushLiveEntry(entries: LiveEntry[], entry: LiveEntry, cap: number = LIVE_FEED_CAP): LiveEntry[] {
  const next = [...entries, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * Whether an agent counts as "live" for the pulsing working indicator.
 * Pure + tested.
 */
export function isAgentLive(status: string): boolean {
  return status === "thinking" || status === "working" || status === "talking" || status === "walking";
}
