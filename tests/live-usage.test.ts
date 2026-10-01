// G3 + G6 pure-helper coverage: the live-feed ring buffer and the
// API usage aggregation behind the Usage dashboard.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LIVE_FEED_CAP, isAgentLive, pushLiveEntry, type LiveEntry } from "../lib/live-feed";
import { aggregateUsage, USAGE_ROW_CAP, type LlmCallRecord } from "../lib/usage";

const entry = (id: string, text = id): LiveEntry => ({ id, kind: "thought", text, timestamp: 1000 });

describe("pushLiveEntry", () => {
  it("appends entries without mutating the input", () => {
    const before = [entry("a")];
    const after = pushLiveEntry(before, entry("b"));
    assert.deepEqual(before.map((e) => e.id), ["a"]);
    assert.deepEqual(after.map((e) => e.id), ["a", "b"]);
  });

  it("trims to the newest cap entries", () => {
    let buf: LiveEntry[] = [];
    for (let i = 0; i < 40; i++) buf = pushLiveEntry(buf, entry(`e${i}`), 30);
    assert.equal(buf.length, 30);
    assert.equal(buf[0].id, "e10");
    assert.equal(buf[29].id, "e39");
  });

  it("defaults to a cap of ~30", () => {
    assert.equal(LIVE_FEED_CAP, 30);
    let buf: LiveEntry[] = [];
    for (let i = 0; i < 50; i++) buf = pushLiveEntry(buf, entry(`e${i}`));
    assert.equal(buf.length, 30);
  });

  it("keeps tool entries with their metadata", () => {
    const tool: LiveEntry = { id: "t1", kind: "tool", text: "spec.md", toolName: "write_artifact", phase: "done", timestamp: 5 };
    const after = pushLiveEntry([], tool);
    assert.equal(after[0].toolName, "write_artifact");
    assert.equal(after[0].phase, "done");
  });
});

describe("isAgentLive", () => {
  it("marks active statuses live, idle/blocked not", () => {
    for (const s of ["thinking", "working", "talking", "walking"]) assert.equal(isAgentLive(s), true, s);
    assert.equal(isAgentLive("idle"), false);
    assert.equal(isAgentLive("blocked"), false);
  });
});

const call = (over: Partial<LlmCallRecord> = {}): LlmCallRecord => ({
  id: `llm_${Math.random()}`,
  projectId: "p1",
  provider: "openai",
  model: "gpt-4o-mini",
  agentName: "Devon",
  taskId: null,
  inputTokens: 100,
  outputTokens: 50,
  cost: 0.001,
  latencyMs: 200,
  ok: true,
  error: null,
  timestamp: 1000,
  ...over,
});

describe("aggregateUsage", () => {
  it("rolls rows up into totals", () => {
    const agg = aggregateUsage([call(), call({ inputTokens: 300, outputTokens: 100, cost: 0.003, latencyMs: 400 })]);
    assert.equal(agg.totals.calls, 2);
    assert.equal(agg.totals.inputTokens, 400);
    assert.equal(agg.totals.outputTokens, 150);
    assert.ok(Math.abs(agg.totals.cost - 0.004) < 1e-9);
    assert.equal(agg.totals.avgLatencyMs, 300);
    assert.equal(agg.totals.failed, 0);
  });

  it("counts failures separately", () => {
    const agg = aggregateUsage([call(), call({ ok: false, error: "boom" })]);
    assert.equal(agg.totals.calls, 2);
    assert.equal(agg.totals.failed, 1);
  });

  it("breaks down by agent and model", () => {
    const agg = aggregateUsage([
      call({ agentName: "Devon" }),
      call({ agentName: "Wren", provider: "anthropic", model: "claude-3-5-haiku-latest", cost: 0.002 }),
    ]);
    assert.deepEqual(Object.keys(agg.perAgent).sort(), ["Devon", "Wren"]);
    assert.equal(agg.perAgent["Wren"].cost, 0.002);
    assert.deepEqual(Object.keys(agg.perModel).sort(), ["anthropic:claude-3-5-haiku-latest", "openai:gpt-4o-mini"]);
    assert.equal(agg.perModel["openai:gpt-4o-mini"].calls, 1);
  });

  it("groups blank agent/model names under (unknown)", () => {
    const agg = aggregateUsage([call({ agentName: null, provider: "", model: "" })]);
    assert.equal(agg.perAgent["(unknown)"].calls, 1);
    assert.equal(agg.perModel["(unknown)"].calls, 1);
  });

  it("returns zeros for empty input", () => {
    const agg = aggregateUsage([]);
    assert.deepEqual(agg.totals, { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, failed: 0, avgLatencyMs: 0 });
    assert.deepEqual(agg.perAgent, {});
    assert.deepEqual(agg.perModel, {});
  });

  it("caps retained rows at 500 per project", () => {
    assert.equal(USAGE_ROW_CAP, 500);
  });
});
