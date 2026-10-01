import { NextRequest, NextResponse } from "next/server";
import { readWhiteboard, writeWhiteboard } from "@/lib/whiteboard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const officeId = req.nextUrl.searchParams.get("officeId") ?? "";
  if (!officeId) return NextResponse.json({ error: "officeId is required" }, { status: 400 });
  const content = await readWhiteboard(officeId);
  return NextResponse.json({ officeId, content });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const officeId = typeof body.officeId === "string" ? body.officeId : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!officeId) return NextResponse.json({ error: "officeId is required" }, { status: 400 });
  await writeWhiteboard(officeId, content.slice(0, 20_000));
  return NextResponse.json({ officeId, content: content.slice(0, 20_000) });
}
