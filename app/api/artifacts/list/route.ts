import { NextRequest, NextResponse } from "next/server";
import { listArtifacts } from "@/lib/artifacts";

export const runtime = "nodejs";

/** GET /api/artifacts/list?projectId=... — enumerate saved artifact files. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ projectId, files: listArtifacts(projectId) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "list failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
