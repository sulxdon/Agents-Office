// API usage metering (G6): record shape + pure aggregation helpers.
// Rows live in the sql.js `llm_calls` table (server-side); the UsagePanel
// renders AggregatedUsage returned by GET /api/usage.

export interface LlmCallRecord {
  id: string;
  projectId: string;
  provider: string;
  model: string;
  agentName: string | null;
  taskId: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  ok: boolean;
  error: string | null;
  timestamp: number;
}

/** Max rows retained per project; older rows are deleted on insert. */
export const USAGE_ROW_CAP = 500;

export interface UsageBreakdown {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface UsageTotals extends UsageBreakdown {
  failed: number;
  avgLatencyMs: number;
}

export interface AggregatedUsage {
  totals: UsageTotals;
  perAgent: Record<string, UsageBreakdown>;
  perModel: Record<string, UsageBreakdown>;
}

const emptyBreakdown = (): UsageBreakdown => ({ calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });

/**
 * Roll call rows up into session totals plus per-agent / per-model
 * breakdowns. Pure + tested.
 */
export function aggregateUsage(rows: LlmCallRecord[]): AggregatedUsage {
  const totals: UsageTotals = { ...emptyBreakdown(), failed: 0, avgLatencyMs: 0 };
  const perAgent: Record<string, UsageBreakdown> = {};
  const perModel: Record<string, UsageBreakdown> = {};
  let latencySum = 0;
  for (const r of rows) {
    totals.calls++;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.cost += r.cost;
    latencySum += r.latencyMs;
    if (!r.ok) totals.failed++;
    const agentKey = r.agentName?.trim() ? r.agentName : "(unknown)";
    const modelKey = r.model?.trim() ? `${r.provider}:${r.model}` : "(unknown)";
    const ab = (perAgent[agentKey] ??= emptyBreakdown());
    ab.calls++;
    ab.inputTokens += r.inputTokens;
    ab.outputTokens += r.outputTokens;
    ab.cost += r.cost;
    const mb = (perModel[modelKey] ??= emptyBreakdown());
    mb.calls++;
    mb.inputTokens += r.inputTokens;
    mb.outputTokens += r.outputTokens;
    mb.cost += r.cost;
  }
  totals.avgLatencyMs = totals.calls > 0 ? Math.round(latencySum / totals.calls) : 0;
  return { totals, perAgent, perModel };
}
