"use client";

import { useEffect, useMemo, useRef } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { timeStr } from "@/lib/utils";

const DOT: Record<string, string> = {
  manager: "bg-amber-400",
  delegate: "bg-sky-400",
  work: "bg-emerald-400",
  done: "bg-lime-400",
  system: "bg-stone-500",
  cost: "bg-stone-700",
  toast: "bg-orange-400",
};

export default function ActivityFeed({ horizontal }: { horizontal?: boolean }) {
  const allActivities = useOfficeStore((s) => s.activities);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const activities = useMemo(
    () => allActivities.filter((a) => a.projectId === activeProjectId).slice(-40),
    [allActivities, activeProjectId]
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activities.length]);

  if (horizontal) {
    const last = activities.slice(-3);
    return (
      <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap px-3 text-[11px] text-stone-400">
        {last.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[a.type] ?? "bg-stone-500"}`} />
            <span className="text-stone-600">[{timeStr(a.timestamp)}]</span> {a.description}
          </span>
        ))}
        {last.length === 0 && <span className="text-stone-600">Quiet in the office…</span>}
      </div>
    );
  }

  return (
    <div ref={ref} className="max-h-56 space-y-1 overflow-y-auto">
      {activities.length === 0 && (
        <div className="py-3 text-center text-[11px] text-stone-600">No activity yet — the team is standing by.</div>
      )}
      {activities.map((a) => (
        <div key={a.id} className="flex items-start gap-1.5 text-[11px] leading-snug text-stone-400">
          <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[a.type] ?? "bg-stone-500"}`} />
          <span>
            <span className="text-stone-600">[{timeStr(a.timestamp)}] </span>
            {a.description}
          </span>
        </div>
      ))}
    </div>
  );
}
