import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { llmCalls } from "@/lib/db/schema";
import { aggregateUsage, USAGE_ROW_CAP, type LlmCallRecord } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const db = await getDb();
  const dbRows = await db
    .select()
    .from(llmCalls)
    .where(eq(llmCalls.projectId, projectId))
    .orderBy(desc(llmCalls.timestamp))
    .limit(USAGE_ROW_CAP);
  const rows: LlmCallRecord[] = dbRows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    provider: r.provider ?? "",
    model: r.model ?? "",
    agentName: r.agentName,
    taskId: r.taskId,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    cost: r.cost ?? 0,
    latencyMs: r.latencyMs ?? 0,
    ok: (r.ok ?? 1) === 1,
    error: r.error,
    timestamp: r.timestamp,
  }));
  const { totals, perAgent, perModel } = aggregateUsage(rows);
  return NextResponse.json({ rows, totals, perAgent, perModel });
}
