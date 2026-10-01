"use client";

import { useEffect, useMemo, useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { collectArtifactRows, mergeServerFiles } from "@/lib/brief";
import { timeStr } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import ArtifactViewer from "./ArtifactViewer";

/** G4 project-level Artifacts view: file browser across the project's tasks. */
export default function ArtifactsPanel() {
  const allTasks = useOfficeStore((s) => s.tasks);
  const agents = useOfficeStore((s) => s.agents);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const [serverFiles, setServerFiles] = useState<string[] | null>(null);
  const [open, setOpen] = useState<{ file: string; taskTitle: string | null } | null>(null);

  useEffect(() => {
    setServerFiles(null);
    if (!activeProjectId) return;
    let live = true;
    fetch(`/api/artifacts/list?projectId=${encodeURIComponent(activeProjectId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setServerFiles(Array.isArray(d.files) ? d.files.map(String) : []);
      })
      .catch(() => {
        if (live) setServerFiles([]);
      });
    return () => {
      live = false;
    };
  }, [activeProjectId]);

  const rows = useMemo(() => {
    const mine = allTasks.filter((t) => t.projectId === activeProjectId);
    const names = new Map(agents.map((a) => [a.id, a.name] as const));
    const base = collectArtifactRows(mine, (id) => (id ? names.get(id) ?? null : null));
    return mergeServerFiles(base, serverFiles ?? []);
  }, [allTasks, agents, activeProjectId, serverFiles]);

  if (!activeProjectId) return <div className="text-xs text-stone-500">No project selected.</div>;

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stone-800 px-3 py-5 text-center">
        <div className="text-xs font-medium text-stone-300">No deliverables yet</div>
        <div className="mx-auto mt-1 max-w-52 text-[11px] leading-snug text-stone-500">
          Finished work lands here — specs, code, notes, and reports from every task.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <button
          key={`${r.taskId ?? "orphan"}:${r.file}`}
          onClick={() => setOpen({ file: r.file, taskTitle: r.taskTitle })}
          title={r.taskTitle ? `Open ${r.file} (from ${r.taskTitle})` : `Open ${r.file}`}
          className="w-full rounded-md border border-stone-800 bg-stone-900/70 p-2 text-left transition-colors hover:border-stone-700"
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-100">
            <FileText size={13} className="shrink-0 text-stone-500" />
            <span className="flex-1 truncate">{r.file}</span>
            {r.taskId === null && <Badge>unlinked</Badge>}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-stone-500">
            {r.taskTitle ?? "Not linked to a task"} · {r.agentName ?? "—"}
            {r.updatedAt != null && ` · updated ${timeStr(r.updatedAt)}`}
          </div>
        </button>
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
