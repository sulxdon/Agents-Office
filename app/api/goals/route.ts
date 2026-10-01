import { NextRequest, NextResponse } from "next/server";
import { getDb, persistDb } from "@/lib/db/client";
import { goals, tasks, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { uid } from "@/lib/utils";
import { publish } from "@/lib/sse-bus";
import { headerPayloadFromHeader, FALLBACK_DEFAULT_MODEL } from "@/lib/llm-provider";
import { runManagerForGoal, type RosterEntry } from "@/lib/agents/manager";
import { runWorkerOnTask } from "@/lib/agents/worker";
import { reviewTask, MAX_REVIEW_ROUNDS } from "@/lib/agents/review";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, projectName, title, description, priority, model, demoMode, roster } = body as {
    projectId?: string;
    projectName?: string;
    title?: string;
    description?: string;
    priority?: string;
    model?: string;
    demoMode?: boolean;
    roster?: RosterEntry[];
  };
  if (!projectId || !title?.trim()) {
    return NextResponse.json({ error: "projectId and title are required" }, { status: 400 });
  }
  const { keys, webhooks } = headerPayloadFromHeader(req.headers.get("x-llm-keys"));
  const useDemo = demoMode ?? true;

  const db = await getDb();
  // Mirror the project row so memories/activities can reference its name.
  const existing = await db.select().from(projects).where(eq(projects.id, projectId));
  if (existing.length === 0) {
    await db.insert(projects).values({ id: projectId, name: projectName || "Untitled project", createdAt: Date.now() }).catch(() => undefined);
  }
  const goal = {
    id: uid("goal"),
    projectId,
    title: title.trim(),
    description: description ?? "",
    status: "active",
    priority: priority ?? "medium",
    createdBy: "ceo",
    createdAt: Date.now(),
  };
  await db.insert(goals).values(goal);
  persistDb();
  publish({ projectId, kind: "goal-update", payload: { goalId: goal.id, status: goal.status } });

  // Run the manager + workers + review loop in the background; results stream over SSE.
  const pipeline = (async () => {
    await runManagerForGoal({
      projectId,
      goalId: goal.id,
      model: model || FALLBACK_DEFAULT_MODEL,
      keys,
      demoMode: useDemo,
      roster: roster ?? [],
    });
    const db2 = await getDb();
    const created = await db2.select().from(tasks).where(and(eq(tasks.goalId, goal.id), eq(tasks.status, "todo")));
    const officeByAgent = new Map((roster ?? []).map((r) => [r.id, r.officeId ?? "main"]));
    const managerId = roster?.find((r) => r.role.toLowerCase() === "manager")?.id ?? null;
    const modelRef = model || FALLBACK_DEFAULT_MODEL;
    for (const t of created) {
      const officeId = officeByAgent.get(t.assigneeAgentId ?? "") ?? "main";
      // stagger worker pickups so the office comes alive one agent at a time
      await new Promise((r) => setTimeout(r, 1200));
      await runWorkerOnTask({ projectId, taskId: t.id, model: modelRef, keys, demoMode: useDemo, officeId, webhooks }).catch((e) =>
        console.error("worker failed", e)
      );
      // manager review loop: approve -> done, else revise (capped, then auto-approve)
      for (let round = 0; round <= MAX_REVIEW_ROUNDS + 1; round++) {
        const verdict = await reviewTask({ projectId, taskId: t.id, model: modelRef, keys, demoMode: useDemo, managerId }).catch(
          (e) => {
            console.error("review failed", e);
            return "approved" as const;
          }
        );
        if (verdict === "approved") break;
        await runWorkerOnTask({ projectId, taskId: t.id, model: modelRef, keys, demoMode: useDemo, officeId, webhooks, revisionAttempt: round + 1 }).catch(
          (e) => console.error("worker revision failed", e)
        );
      }
    }
  })();
  // Don't block the response on the pipeline — but keep Next from GC'ing it.
  (pipeline as Promise<void>).catch((e) => console.error("manager pipeline failed", e));

  return NextResponse.json({ goal });
}
