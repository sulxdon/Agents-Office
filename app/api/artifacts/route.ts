import { NextRequest, NextResponse } from "next/server";
import { readArtifact } from "@/lib/artifacts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!projectId || !file) {
    return NextResponse.json({ error: "projectId and file are required" }, { status: 400 });
  }
  try {
    // readArtifact enforces traversal protection (sanitized name + project dir).
    const content = await readArtifact(projectId, file);
    return NextResponse.json({ projectId, file, content: content.slice(0, 200_000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "read failed";
    const status = /no such file|ENOENT/i.test(msg) ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
