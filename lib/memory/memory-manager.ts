import { eq, and } from "drizzle-orm";
import { getDb, persistDb } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { vectorStore } from "./vector-store";
import { uid } from "@/lib/utils";

export type MemoryType = "decision" | "fact" | "artifact" | "learning";

let hydrated = false;

/** Load persisted memories into the vector index once per server boot. */
export async function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  try {
    const db = await getDb();
    const rows = await db.select().from(memories);
    vectorStore.seed(
      rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        agentId: r.agentId,
        type: r.type,
        content: r.content,
        embedding: r.embedding ? (JSON.parse(r.embedding) as number[]) : [],
        createdAt: r.createdAt,
      }))
    );
  } catch {
    // DB unavailable — memory still works in-process via the vector store.
  }
}

export async function saveMemory(opts: {
  projectId: string;
  agentId?: string | null;
  type: MemoryType;
  content: string;
  embedding?: number[];
}) {
  await ensureHydrated();
  const rec = {
    id: uid("mem"),
    projectId: opts.projectId,
    agentId: opts.agentId ?? null,
    type: opts.type,
    content: opts.content,
    embedding: opts.embedding ?? [],
    createdAt: Date.now(),
  };
  await vectorStore.add(rec);
  try {
    const db = await getDb();
    await db.insert(memories).values({
      ...rec,
      embedding: rec.embedding.length ? JSON.stringify(rec.embedding) : "",
    });
    persistDb();
  } catch {
    /* in-memory only */
  }
  return rec;
}

export async function searchMemories(projectId: string, query: string, limit = 5) {
  await ensureHydrated();
  return vectorStore.search(projectId, query, undefined, limit);
}

export async function listMemories(projectId: string, agentId?: string) {
  await ensureHydrated();
  try {
    const db = await getDb();
    const rows = agentId
      ? await db.select().from(memories).where(and(eq(memories.projectId, projectId), eq(memories.agentId, agentId)))
      : await db.select().from(memories).where(eq(memories.projectId, projectId));
    return rows;
  } catch {
    const all = await vectorStore.list(projectId);
    return all.filter((r) => !agentId || r.agentId === agentId);
  }
}
