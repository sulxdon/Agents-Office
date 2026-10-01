import { NextRequest, NextResponse } from "next/server";
import { listMemories, searchMemories } from "@/lib/memory/memory-manager";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!projectId) return NextResponse.json({ memories: [] });
  const memories = q.trim() ? await searchMemories(projectId, q.trim(), 20) : await listMemories(projectId);
  return NextResponse.json({ memories: [...memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) });
}
