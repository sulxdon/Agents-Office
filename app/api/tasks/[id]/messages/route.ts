import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const rows = await db.select().from(messages).where(eq(messages.taskId, params.id));
  const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt).slice(0, 100);
  return NextResponse.json({ messages: sorted });
}
