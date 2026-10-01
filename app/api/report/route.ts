import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { projects, goals, tasks, memories, activities, agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProjectReport } from "@/lib/report";

export const runtime = "nodejs";

/** GET /api/report?projectId=...&spend=0 — Markdown project report download. */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const spend = Number(req.nextUrl.searchParams.get("spend") ?? "0");
  if (!projectId) return new NextResponse("projectId is required", { status: 400 });
  const db = await getDb();
  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
  const g = await db.select().from(goals).where(eq(goals.projectId, projectId));
  const t = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  const mem = await db.select().from(memories).where(eq(memories.projectId, projectId));
  const act = await db.select().from(activities).where(eq(activities.projectId, projectId));
  const agentRows = await db.select().from(agents);
  const names = new Map(agentRows.map((a) => [a.id, a.name]));
  const md = buildProjectReport({
    project: { id: projectId, name: proj?.name ?? projectId, description: proj?.description ?? "" },
    goals: g.map((x) => ({ title: x.title, status: x.status, priority: x.priority })),
    tasks: t.map((x) => ({
      title: x.title,
      status: x.status,
      assigneeAgentId: x.assigneeAgentId,
      assigneeName: x.assigneeAgentId ? names.get(x.assigneeAgentId) ?? null : null,
    })),
    memories: mem.map((x) => ({ type: x.type, content: x.content, createdAt: x.createdAt })),
    activities: act.map((x) => ({ type: x.type, description: x.description, timestamp: x.timestamp })),
    spend: Number.isFinite(spend) ? spend : 0,
  });
  const slug = (proj?.name ?? projectId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-report.md"`,
    },
  });
}
