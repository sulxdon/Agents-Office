"use client";

import { useEffect, useMemo, useState } from "react";
import { nextTaskStatus, useOfficeStore } from "@/lib/store/useOfficeStore";
import { timeStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FileText } from "lucide-react";

interface ThreadMsg {
  id: string;
  agentId?: string | null;
  content: string;
  type: string;
  createdAt: number;
}

/** Task detail modal: description, message thread, artifacts, reassign, advance. */
export default function TaskModal() {
  const selectedTaskId = useOfficeStore((s) => s.selectedTaskId);
  const tasks = useOfficeStore((s) => s.tasks);
  const agents = useOfficeStore((s) => s.agents);
  const teams = useOfficeStore((s) => s.teams);

  const task = useMemo(() => tasks.find((t) => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const roster = useMemo(() => {
    if (!task) return [];
    const teamIds = new Set(teams.filter((t) => t.projectId === task.projectId).map((t) => t.id));
    return agents.filter((a) => teamIds.has(a.teamId));
  }, [agents, teams, task]);

  const [thread, setThread] = useState<ThreadMsg[] | null>(null);
  const [artifact, setArtifact] = useState<{ file: string; content: string } | null>(null);
  const [artifactBusy, setArtifactBusy] = useState<string | null>(null);

  useEffect(() => {
    setThread(null);
    setArtifact(null);
    if (!selectedTaskId) return;
    let live = true;
    fetch(`/api/tasks/${encodeURIComponent(selectedTaskId)}/messages`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setThread(Array.isArray(d.messages) ? d.messages : []);
      })
      .catch(() => {
        if (live) setThread([]);
      });
    return () => {
      live = false;
    };
  }, [selectedTaskId]);

  if (!task) return null;
  const assignee = agents.find((a) => a.id === task.assigneeAgentId) ?? null;
  const close = () => useOfficeStore.getState().setSelectedTask(null);

  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  };

  const reassign = (agentId: string) => {
    const next = agentId === "" ? null : agentId;
    useOfficeStore.getState().reassignTask(task.id, next);
    void patch({ assigneeAgentId: next });
  };

  const advance = () => {
    const next = nextTaskStatus(task.status);
    useOfficeStore.getState().moveTask(task.id, next);
    void patch({ status: next });
  };

  const openArtifact = async (file: string) => {
    setArtifactBusy(file);
    try {
      const res = await fetch(
        `/api/artifacts?projectId=${encodeURIComponent(task.projectId)}&file=${encodeURIComponent(file)}`
      );
      const d = await res.json();
      if (res.ok) setArtifact({ file, content: d.content ?? "" });
      else setArtifact({ file, content: `(could not load: ${d.error ?? res.status})` });
    } catch {
      setArtifact({ file, content: "(could not load artifact)" });
    } finally {
      setArtifactBusy(null);
    }
  };

  const agentName = (id: string | null | undefined) => agents.find((a) => a.id === id)?.name ?? "system";

  return (
    <>
      <Dialog open onClose={close}>
        <div className="mb-1 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-snug text-stone-100">{task.title}</h2>
          <Badge>{task.status}</Badge>
        </div>
        <div className="mb-3 text-[11px] text-stone-500">
          {assignee ? `${assignee.avatar} ${assignee.name}` : "Unassigned"} · updated {timeStr(task.updatedAt)}
        </div>
        {task.description && (
          <p className="mb-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-stone-950/70 p-2 text-[13px] leading-snug text-stone-300">
            {task.description}
          </p>
        )}
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Thread</div>
        <div className="mb-3 max-h-44 space-y-1.5 overflow-y-auto rounded-md bg-stone-950/70 p-2">
          {thread === null && (
            <div className="space-y-1.5" aria-label="Loading thread">
              <div className="ao-skeleton h-4 w-11/12" />
              <div className="ao-skeleton h-4 w-3/4" />
              <div className="ao-skeleton h-4 w-5/6" />
            </div>
          )}
          {thread !== null && thread.length === 0 && <div className="text-[11px] text-stone-600">No messages yet.</div>}
          {thread?.map((m) => (
            <div key={m.id} className="text-xs leading-snug text-stone-300">
              <span className="text-[10px] text-stone-600">{timeStr(m.createdAt)} · {agentName(m.agentId)} · {m.type} — </span>
              {m.content}
            </div>
          ))}
        </div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Artifacts{task.artifacts.length > 0 && ` (${task.artifacts.length})`}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {task.artifacts.length === 0 && <span className="text-[11px] text-stone-600">No artifacts yet.</span>}
          {task.artifacts.map((f) => (
            <button
              key={f}
              onClick={() => openArtifact(f)}
              disabled={artifactBusy === f}
              className="flex items-center gap-1 rounded-md border border-stone-700 px-2 py-1 text-xs text-stone-200 hover:border-amber-600 disabled:opacity-50"
            >
              <FileText size={12} /> {artifactBusy === f ? "Loading…" : f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Reassign task"
            value={task.assigneeAgentId ?? ""}
            onChange={(e) => reassign(e.target.value)}
            className="h-8 flex-1 rounded-md border border-stone-700 bg-stone-950 px-2 text-xs text-stone-100"
          >
            <option value="">Unassigned</option>
            {roster.map((a) => (
              <option key={a.id} value={a.id}>{a.avatar} {a.name} ({a.role})</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={advance}>
            → {nextTaskStatus(task.status)}
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>Close</Button>
        </div>
      </Dialog>
      <Dialog open={artifact !== null} onClose={() => setArtifact(null)}>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-100">
          <FileText size={14} /> {artifact?.file}
        </h2>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-stone-950 p-3 font-mono text-xs leading-relaxed text-stone-200">
          {artifact?.content}
        </pre>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setArtifact(null)}>Close</Button>
        </div>
      </Dialog>
    </>
  );
}
