import { NextRequest, NextResponse } from "next/server";
import { getDb, persistDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publish } from "@/lib/sse-bus";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: Date.now() };
  if (typeof body.status === "string") patch.status = body.status;
  if ("assigneeAgentId" in body) patch.assigneeAgentId = body.assigneeAgentId ?? null;
  await db.update(tasks).set(patch).where(eq(tasks.id, params.id));
  persistDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, params.id));
  if (row) publish({ projectId: row.projectId, kind: "task-update", payload: { task: row } });
  return NextResponse.json({ task: row ?? null });
}
