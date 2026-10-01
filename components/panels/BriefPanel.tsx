"use client";

import { useEffect, useMemo, useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { groupTasksByGoal, summarizeBrief } from "@/lib/brief";
import { timeStr } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import ArtifactViewer from "./ArtifactViewer";

/** G5 Manager Brief: per-goal sections with tasks, assignees, and deliverables. */
export default function BriefPanel() {
  const allGoals = useOfficeStore((s) => s.goals);
  const allTasks = useOfficeStore((s) => s.tasks);
  const agents = useOfficeStore((s) => s.agents);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const [revByTask, setRevByTask] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<{ file: string; taskTitle: string | null } | null>(null);

  const goals = useMemo(
    () => allGoals.filter((g) => g.projectId === activeProjectId),
    [allGoals, activeProjectId]
  );
  const tasks = useMemo(() => {
    const names = new Map(agents.map((a) => [a.id, a.name] as const));
    return allTasks
      .filter((t) => t.projectId === activeProjectId)
      .map((t) => ({
        id: t.id,
        goalId: t.goalId,
        title: t.title,
        status: t.status,
        assigneeAgentId: t.assigneeAgentId,
        assigneeName: t.assigneeAgentId ? names.get(t.assigneeAgentId) ?? null : null,
        updatedAt: t.updatedAt,
        artifacts: t.artifacts,
      }));
  }, [allTasks, agents, activeProjectId]);

  const taskIdsKey = useMemo(() => tasks.map((t) => t.id).join(","), [tasks]);

  // Revision counts come from manager feedback messages in each task thread.
  useEffect(() => {
    setRevByTask({});
    if (taskIdsKey === "") return;
    let live = true;
    const ids = taskIdsKey.split(",");
    Promise.all(
      ids.map((id) =>
        fetch(`/api/tasks/${encodeURIComponent(id)}/messages`)
          .then((r) => r.json())
          .then((d) => ({ id, n: Array.isArray(d.messages) ? d.messages.filter((m: { type: string }) => m.type === "review").length : 0 }))
          .catch(() => ({ id, n: 0 }))
      )
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, number> = {};
      for (const p of pairs) if (p.n > 0) next[p.id] = p.n;
      setRevByTask(next);
    });
    return () => {
      live = false;
    };
  }, [taskIdsKey]);

  const sections = useMemo(() => groupTasksByGoal(goals, tasks), [goals, tasks]);
  const revisions = useMemo(() => Object.values(revByTask).reduce((a, b) => a + b, 0), [revByTask]);
  const counts = useMemo(() => summarizeBrief(tasks, revisions), [tasks, revisions]);

  if (!activeProjectId) return <div className="text-xs text-stone-500">No project selected.</div>;

  return (
    <div className="space-y-2">
      <div className="rounded-md bg-stone-950/60 p-2 text-[11px] leading-snug text-stone-400">
        <span className="font-medium text-stone-200">Plan summary:</span> {counts.total} task{counts.total === 1 ? "" : "s"} —{" "}
        {counts.done} done · {counts.review} in review · {counts.doing} doing · {counts.todo} todo
        {counts.blocked > 0 && ` · ${counts.blocked} blocked`} · {counts.approvals} approval{counts.approvals === 1 ? "" : "s"} ·{" "}
        {counts.revisions} revision{counts.revisions === 1 ? "" : "s"} requested
      </div>
      {sections.length === 0 && <div className="text-xs text-stone-500">No goals yet — the brief appears once work is planned.</div>}
      {sections.map((s) => (
        <div key={s.goal.id} className="rounded-md border border-stone-800 bg-stone-900/50 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-stone-100">{s.goal.title}</span>
            {s.goal.status && <Badge>{s.goal.status}</Badge>}
          </div>
          {s.tasks.length === 0 && <div className="text-[11px] text-stone-600">No tasks yet.</div>}
          <div className="space-y-1.5">
            {s.tasks.map((t) => (
              <div key={t.id} className="rounded bg-stone-950/60 p-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-stone-200">{t.title}</span>
                  <Badge>{t.status}</Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-stone-500">
                  {t.assigneeName ?? "Unassigned"} · updated {timeStr(t.updatedAt)}
                  {(revByTask[t.id] ?? 0) > 0 && ` · ${revByTask[t.id]} revision${revByTask[t.id] === 1 ? "" : "s"}`}
                </div>
                {t.artifacts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.artifacts.map((f) => (
                      <button
                        key={f}
                        onClick={() => setOpen({ file: f, taskTitle: t.title })}
                        title={`Open ${f}`}
                        className="flex items-center gap-1 rounded border border-stone-700 px-1.5 py-0.5 text-[11px] text-stone-300 hover:border-amber-600"
                      >
                        <FileText size={11} /> {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {open && activeProjectId && (
        <ArtifactViewer
          projectId={activeProjectId}
          file={open.file}
          taskTitle={open.taskTitle}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
