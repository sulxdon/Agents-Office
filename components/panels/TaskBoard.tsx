"use client";

import { useMemo } from "react";
import { nextTaskStatus, useOfficeStore, type Task } from "@/lib/store/useOfficeStore";
import { Badge } from "@/components/ui/badge";
import { LocateFixed } from "lucide-react";

const COLS: { id: Task["status"]; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "doing", label: "Doing" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

export default function TaskBoard({ compact }: { compact?: boolean }) {
  const allTasks = useOfficeStore((s) => s.tasks);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const agents = useOfficeStore((s) => s.agents);
  const selectedTaskId = useOfficeStore((s) => s.selectedTaskId);
  // Stable selector + useMemo: an inline .filter() in the selector above
  // would allocate per snapshot and loop renders forever.
  const tasks = useMemo(() => allTasks.filter((t) => t.projectId === activeProjectId), [allTasks, activeProjectId]);

  const name = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "Unassigned";
  const avatar = (id: string | null) => agents.find((a) => a.id === id)?.avatar ?? "·";

  const advance = async (t: Task) => {
    const next = nextTaskStatus(t.status);
    useOfficeStore.getState().moveTask(t.id, next);
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => undefined);
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-800 px-3 py-5 text-center">
        <div className="text-xs font-medium text-stone-300">No tasks yet</div>
        <div className="mx-auto mt-1 max-w-52 text-[11px] leading-snug text-stone-500">
          Send a goal from the top bar and the Manager will break it into tasks here.
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-4"}`}>
      {COLS.map((col) => (
        <div key={col.id} className="rounded-md bg-stone-950/60 p-1.5">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{col.label}</span>
            <span className="text-[11px] text-stone-600">{tasks.filter((t) => t.status === col.id).length}</span>
          </div>
          <div className="space-y-1.5">
            {tasks
              .filter((t) => t.status === col.id)
              .map((t) => (
                <div
                  key={t.id}
                  onClick={() => useOfficeStore.getState().setSelectedTask(t.id)}
                  title="Open task details"
                  className={`cursor-pointer rounded-md border p-2 text-xs transition-colors ${
                    selectedTaskId === t.id
                      ? "border-amber-500/70 bg-stone-900"
                      : "border-stone-800 bg-stone-900/70 hover:border-stone-700"
                  }`}
                >
                  <div className="font-medium leading-snug text-stone-100">{t.title}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-stone-400">
                      {avatar(t.assigneeAgentId)} {name(t.assigneeAgentId)}
                    </span>
                    <div className="flex items-center gap-1">
                      {t.assigneeAgentId && (
                        <button
                          title="Fly camera to agent"
                          className="rounded p-0.5 text-stone-500 hover:bg-stone-800 hover:text-amber-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            useOfficeStore.getState().flyToAgent(t.assigneeAgentId!);
                          }}
                        >
                          <LocateFixed size={13} />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); advance(t); }} title="Advance status">
                        <Badge className="cursor-pointer hover:border-amber-600">{t.status}</Badge>
                      </button>
                    </div>
                  </div>
                  {selectedTaskId === t.id && t.description && (
                    <div className="mt-1.5 border-t border-stone-800 pt-1.5 text-[11px] leading-snug text-stone-400">{t.description}</div>
                  )}
                </div>
              ))}
            {tasks.filter((t) => t.status === col.id).length === 0 && (
              <div className="rounded border border-dashed border-stone-800/70 px-1 py-2 text-center text-[11px] text-stone-700">Empty</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
