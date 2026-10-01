"use client";

import { useEffect, useMemo, useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { timeStr } from "@/lib/utils";
import type { AggregatedUsage, LlmCallRecord, UsageBreakdown } from "@/lib/usage";

interface UsageResponse extends AggregatedUsage {
  rows: LlmCallRecord[];
}

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function BreakdownTable({ title, data }: { title: string; data: Record<string, UsageBreakdown> }) {
  const rows = useMemo(
    () => Object.entries(data).sort((a, b) => b[1].cost - a[1].cost),
    [data]
  );
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase text-stone-600">
            <th className="py-0.5 pr-2 font-medium">Name</th>
            <th className="py-0.5 pr-2 text-right font-medium">Calls</th>
            <th className="py-0.5 pr-2 text-right font-medium">Tokens</th>
            <th className="py-0.5 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, b]) => (
            <tr key={name} className="border-t border-stone-800/60 text-stone-300">
              <td className="max-w-32 truncate py-0.5 pr-2" title={name}>{name}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{b.calls}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">{(b.inputTokens + b.outputTokens).toLocaleString()}</td>
              <td className="py-0.5 text-right tabular-nums">{fmtCost(b.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** API usage dashboard (G6): session totals, per-agent/model breakdowns, recent requests. */
export default function UsagePanel() {
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const usageVersion = useOfficeStore((s) => s.usageVersion);
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/usage?projectId=${encodeURIComponent(activeProjectId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`usage fetch failed (${res.status})`))))
      .then((json: UsageResponse) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, usageVersion]);

  const recent = useMemo(() => (data?.rows ?? []).slice(0, 20), [data]);

  if (!activeProjectId) return <div className="text-xs text-stone-500">No project selected.</div>;
  if (error) return <div className="text-xs text-red-400">Couldn&apos;t load usage: {error}</div>;
  if (!data) return <div className="text-xs text-stone-500">Loading usage…</div>;

  const t = data.totals;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md bg-stone-950/70 px-2 py-1.5">
          <div className="text-[10px] uppercase text-stone-600">Session cost</div>
          <div className="text-base font-semibold tabular-nums text-stone-100">{fmtCost(t.cost)}</div>
        </div>
        <div className="rounded-md bg-stone-950/70 px-2 py-1.5">
          <div className="text-[10px] uppercase text-stone-600">LLM calls</div>
          <div className="text-base font-semibold tabular-nums text-stone-100">
            {t.calls}
            {t.failed > 0 && <span className="ml-1 text-xs font-normal text-red-400">({t.failed} failed)</span>}
          </div>
        </div>
        <div className="rounded-md bg-stone-950/70 px-2 py-1.5">
          <div className="text-[10px] uppercase text-stone-600">Tokens in / out</div>
          <div className="text-sm font-medium tabular-nums text-stone-200">
            {t.inputTokens.toLocaleString()} / {t.outputTokens.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md bg-stone-950/70 px-2 py-1.5">
          <div className="text-[10px] uppercase text-stone-600">Avg latency</div>
          <div className="text-sm font-medium tabular-nums text-stone-200">
            {t.calls > 0 ? `${t.avgLatencyMs.toLocaleString()} ms` : "—"}
          </div>
        </div>
      </div>

      {t.calls === 0 && (
        <div className="text-xs leading-snug text-stone-500">
          No API calls yet — demo-mode runs don&apos;t touch the API. Add a key in Settings and turn off demo mode to see usage here.
        </div>
      )}

      <BreakdownTable title="By agent" data={data.perAgent} />
      <BreakdownTable title="By model" data={data.perModel} />

      {recent.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Recent requests</div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 rounded bg-stone-950/60 px-1.5 py-0.5 text-[11px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.ok ? "bg-emerald-400" : "bg-red-400"}`} title={r.ok ? "ok" : r.error ?? "failed"} />
                <span className="shrink-0 text-stone-600">{timeStr(r.timestamp)}</span>
                <span className="min-w-0 flex-1 truncate text-stone-300" title={`${r.agentName ?? "—"} · ${r.provider}:${r.model}${r.ok ? "" : ` · ${r.error ?? "failed"}`}`}>
                  {r.agentName ?? "—"} · {r.provider}:{r.model}
                </span>
                <span className="shrink-0 tabular-nums text-stone-500">{(r.inputTokens + r.outputTokens).toLocaleString()} tok</span>
                <span className="shrink-0 tabular-nums text-stone-300">{fmtCost(r.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
