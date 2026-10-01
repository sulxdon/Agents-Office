"use client";

import { useEffect, useMemo, useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

/** Office card shown when a room is selected on the canvas: team task summary + whiteboard. */
export default function OfficePanel() {
  const selectedOfficeId = useOfficeStore((s) => s.selectedOfficeId);
  const offices = useOfficeStore((s) => s.offices);
  const teams = useOfficeStore((s) => s.teams);
  const agents = useOfficeStore((s) => s.agents);
  const allTasks = useOfficeStore((s) => s.tasks);

  const office = useMemo(() => offices.find((o) => o.id === selectedOfficeId) ?? null, [offices, selectedOfficeId]);
  const team = useMemo(() => (office?.teamId ? teams.find((t) => t.id === office.teamId) ?? null : null), [teams, office]);
  const members = useMemo(() => (team ? agents.filter((a) => a.teamId === team.id) : []), [agents, team]);
  const summary = useMemo(() => {
    const ids = new Set(members.map((m) => m.id));
    const mine = allTasks.filter((t) => t.assigneeAgentId && ids.has(t.assigneeAgentId));
    const by: Record<string, number> = { todo: 0, doing: 0, review: 0, blocked: 0, done: 0 };
    for (const t of mine) by[t.status] = (by[t.status] ?? 0) + 1;
    return { total: mine.length, by };
  }, [allTasks, members]);

  const [board, setBoard] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBoard(null);
    setDraft("");
    if (!selectedOfficeId) return;
    let live = true;
    fetch(`/api/whiteboard?officeId=${encodeURIComponent(selectedOfficeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setBoard(typeof d.content === "string" ? d.content : "");
        setDraft(typeof d.content === "string" ? d.content : "");
      })
      .catch(() => {
        if (live) setBoard("");
      });
    return () => {
      live = false;
    };
  }, [selectedOfficeId]);

  if (!office) return null;

  const save = async () => {
    if (!selectedOfficeId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: selectedOfficeId, content: draft }),
      });
      const d = await res.json();
      setBoard(typeof d.content === "string" ? d.content : draft);
    } finally {
      setSaving(false);
    }
  };

  const dirty = board !== null && draft !== board;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <CardTitle>
          🏠 {office.name}
          {team && <span className="ml-1.5 font-normal text-stone-500">· {team.name}</span>}
        </CardTitle>
        <button
          className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          onClick={() => useOfficeStore.getState().setSelectedOffice(null)}
          title="Close office panel"
        >
          <X size={14} />
        </button>
      </CardHeader>
      <CardContent className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          {members.length === 0 && <span className="text-xs text-stone-500">No team assigned to this room yet.</span>}
          {members.map((m) => (
            <button
              key={m.id}
              title={`${m.name} (${m.role}) — click to select`}
              onClick={() => useOfficeStore.getState().setSelectedAgent(m.id)}
              className="rounded-full border border-stone-700 px-2 py-0.5 text-xs text-stone-300 hover:border-amber-600"
            >
              {m.avatar} {m.name}
            </button>
          ))}
        </div>
        {team && (
          <div className="flex flex-wrap gap-1">
            {(["todo", "doing", "review", "blocked", "done"] as const).map((st) => (
              <Badge key={st}>{st}: {summary.by[st] ?? 0}</Badge>
            ))}
            <span className="ml-auto text-[11px] text-stone-500">{summary.total} assigned</span>
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Whiteboard</div>
          {board === null ? (
            <div className="ao-skeleton h-24 w-full" aria-label="Loading whiteboard" />
          ) : (
            <div className="space-y-1.5">
              <Textarea
                rows={4}
                placeholder="Team notes, decisions, links…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="text-xs"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={save}>
                  {saving ? "Saving…" : "Save whiteboard"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
