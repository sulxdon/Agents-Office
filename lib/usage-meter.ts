// API usage meter (G6, server-only): wraps callLLM, records one row per
// call into the llm_calls table (capped at USAGE_ROW_CAP newest per
// project), and publishes an api-usage SSE event for the dashboard.
// Kept separate from lib/llm-provider.ts because that module is imported
// by client components and must stay free of node-only deps (sql.js).

import { sql } from "drizzle-orm";
import { getDb, persistDb } from "@/lib/db/client";
import { llmCalls } from "@/lib/db/schema";
import { publish } from "@/lib/sse-bus";
import { uid } from "@/lib/utils";
import { callLLM, estimateCost, parseModelRef, type CallLLMOptions } from "@/lib/llm-provider";
import { USAGE_ROW_CAP, type LlmCallRecord } from "@/lib/usage";

export interface MeterMeta {
  projectId: string;
  agentName?: string | null;
  taskId?: string | null;
}

export async function recordLlmCall(
  modelRef: string,
  meta: MeterMeta,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  ok: boolean,
  error?: string | null
): Promise<LlmCallRecord> {
  const { provider, model } = parseModelRef(modelRef);
  const record: LlmCallRecord = {
    id: uid("llm"),
    projectId: meta.projectId,
    provider,
    model,
    agentName: meta.agentName ?? null,
    taskId: meta.taskId ?? null,
    inputTokens,
    outputTokens,
    cost: estimateCost(modelRef, inputTokens, outputTokens),
    latencyMs,
    ok,
    error: error ?? null,
    timestamp: Date.now(),
  };
  try {
    const db = await getDb();
    await db.insert(llmCalls).values({
      id: record.id,
      projectId: record.projectId,
      provider: record.provider,
      model: record.model,
      agentName: record.agentName,
      taskId: record.taskId,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cost: record.cost,
      latencyMs: record.latencyMs,
      ok: record.ok ? 1 : 0,
      error: record.error,
      timestamp: record.timestamp,
    });
    // Cap: keep only the newest USAGE_ROW_CAP rows per project.
    await db.run(sql`DELETE FROM llm_calls WHERE project_id = ${record.projectId} AND id NOT IN (
      SELECT id FROM llm_calls WHERE project_id = ${record.projectId} ORDER BY timestamp DESC LIMIT ${USAGE_ROW_CAP}
    )`);
    persistDb();
  } catch {
    // Metering is best-effort; never break the LLM call itself.
  }
  publish({ projectId: meta.projectId, kind: "api-usage", payload: { record } });
  return record;
}

/** Metered callLLM: identical result, plus a usage row + api-usage event. */
export async function callLLMMetered(opts: CallLLMOptions, meta: MeterMeta) {
  const started = Date.now();
  try {
    const result = await callLLM(opts);
    const usage = result.usage as { promptTokens?: number; completionTokens?: number } | undefined;
    await recordLlmCall(opts.model, meta, usage?.promptTokens ?? 0, usage?.completionTokens ?? 0, Date.now() - started, true);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "LLM call failed";
    await recordLlmCall(opts.model, meta, 0, 0, Date.now() - started, false, message);
    throw err;
  }
}
