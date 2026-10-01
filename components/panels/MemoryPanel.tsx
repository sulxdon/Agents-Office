"use client";

import { useEffect, useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { timeStr } from "@/lib/utils";

interface Mem {
  id: string;
  projectId: string;
  agentId?: string | null;
  type: string;
  content: string;
  createdAt: number;
}

export default function MemoryPanel() {
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const [memos, setMemos] = useState<Mem[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!activeProjectId) return;
    setMemos(null);
    const url = q.trim()
      ? `/api/memory?projectId=${activeProjectId}&q=${encodeURIComponent(q.trim())}`
      : `/api/memory?projectId=${activeProjectId}`;
    const t = setTimeout(() => {
      fetch(url)
        .then((r) => r.json())
        .then((d) => setMemos(d.memories ?? []))
        .catch(() => setMemos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [activeProjectId, q]);

  return (
    <div className="space-y-2">
      <Input placeholder="Search project memory…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs" />
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {memos === null && (
          <div className="space-y-1.5" aria-label="Loading memories">
            <div className="ao-skeleton h-12 w-full" />
            <div className="ao-skeleton h-12 w-full" />
          </div>
        )}
        {(memos ?? []).map((m) => (
          <div key={m.id} className="rounded-md border border-stone-800 bg-stone-950/60 p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <Badge>{m.type}</Badge>
              <span className="text-[10px] text-stone-600">{timeStr(m.createdAt)}</span>
            </div>
            <div className="text-xs leading-snug text-stone-300">{m.content}</div>
          </div>
        ))}
        {memos !== null && memos.length === 0 && (
          <div className="py-3 text-center text-[11px] leading-snug text-stone-600">
            {q.trim() ? `No memories match “${q.trim()}”.` : "No memories yet — finish a task to create some."}
          </div>
        )}
      </div>
    </div>
  );
}
