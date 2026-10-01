import { NextRequest, NextResponse } from "next/server";
import { recentEvents } from "@/lib/sse-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll reconciliation endpoint: returns durable events newer than `since`.
 * The client polls this alongside its SSE stream so missed frames (drops,
 * restarts, reconnects) are backfilled automatically.
 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  if (!projectId) return NextResponse.json({ events: [] });
  const events = await recentEvents(projectId, since);
  return NextResponse.json({ events });
}
