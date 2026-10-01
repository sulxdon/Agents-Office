import { NextRequest, NextResponse } from "next/server";
import { getDb, persistDb } from "@/lib/db/client";
import { projects, goals, tasks, messages, memories, activities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/** Delete a project and its server-side rows (goals, tasks, messages, memories, activities). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const id = params.id;
  await db.delete(messages).where(eq(messages.projectId, id)).catch(() => undefined);
  await db.delete(memories).where(eq(memories.projectId, id)).catch(() => undefined);
  await db.delete(activities).where(eq(activities.projectId, id)).catch(() => undefined);
  await db.delete(tasks).where(eq(tasks.projectId, id)).catch(() => undefined);
  await db.delete(goals).where(eq(goals.projectId, id)).catch(() => undefined);
  await db.delete(projects).where(eq(projects.id, id)).catch(() => undefined);
  persistDb();
  return NextResponse.json({ deleted: id });
}
