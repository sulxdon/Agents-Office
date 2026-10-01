// Focused regression coverage for the office simulation's pure core:
// skill-based delegation, wall-aware pathfinding, the SSE bus, and model refs.
// Run with: npm test
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate bus/DB tests onto a fresh temp database per run (read lazily on
// first getDb). Unique per run: pid-recycled temp files caused flakes.
const TEST_DB = path.join(os.tmpdir(), `agent-office-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
process.env.AGENT_OFFICE_DB = TEST_DB;
after(() => {
  try {
    fs.rmSync(TEST_DB, { force: true });
  } catch {
    /* ignore */
  }
});
import { assignTask } from "../lib/agents/delegation";
import { findPath } from "../components/office/Pathfinding";
import { publish, recentEvents, subscribe } from "../lib/sse-bus";
import { parseModelRef, estimateCost, modelFor, MODEL_CATALOG, META_BASE_URL, resolveAgentModel, FALLBACK_DEFAULT_MODEL } from "../lib/llm-provider";
import { sanitizeArtifactName } from "../lib/artifacts";
import { MAX_REVIEW_ROUNDS, shouldAutoApprove, parseReviewVerdict, demoReviewDecide } from "../lib/agents/review";

describe("delegation", () => {
  const roster = [
    { id: "a-dev", role: "developer", skills: ["react", "typescript"], status: "idle", openTasks: 0 },
    { id: "a-des", role: "designer", skills: ["ui", "ux"], status: "idle", openTasks: 0 },
    { id: "a-mgr", role: "manager", skills: ["planning"], status: "idle", openTasks: 0 },
  ];

  it("routes design work to the designer", () => {
    const pick = assignTask("Design the hero section layout and brand style", roster);
    assert.equal(pick?.id, "a-des");
  });

  it("routes implementation work to the developer", () => {
    const pick = assignTask("Implement the landing page with React and TypeScript", roster);
    assert.equal(pick?.id, "a-dev");
  });

  it("deprioritizes the manager for execution work", () => {
    const pick = assignTask("Write the API code for the menu feature", roster);
    assert.notEqual(pick?.id, "a-mgr");
  });

  it("prefers less-loaded agents on ties", () => {
    const loaded = roster.map((r) => (r.id === "a-dev" ? { ...r, openTasks: 5 } : r));
    // neutral text: no skill/role keywords, so load decides
    const pick = assignTask("Help out with whatever the team needs today", loaded);
    assert.notEqual(pick?.id, "a-dev");
  });
});

describe("pathfinding", () => {
  const office = { id: "o1", projectId: "p", teamId: "t", name: "Room", x: 100, y: 100, width: 400, height: 300 };

  it("routes through the door gap, not through walls", () => {
    // from below the room to its center: must enter via the bottom door
    const pts = findPath({ x: 300, y: 500 }, { x: 300, y: 250 }, [office]);
    assert.ok(pts.length >= 2);
    const last = pts[pts.length - 1];
    assert.deepEqual(last, { x: 300, y: 250 });
    // every waypoint near the bottom wall must be inside the door x-range
    const doorX0 = 100 + 200 - 36;
    const doorX1 = 100 + 200 + 36;
    for (const p of pts) {
      if (Math.abs(p.y - 400) < 24) {
        assert.ok(p.x >= doorX0 - 24 && p.x <= doorX1 + 24, `waypoint ${p.x},${p.y} crosses a wall`);
      }
    }
  });

  it("walks straight in open space", () => {
    const pts = findPath({ x: 0, y: 0 }, { x: 50, y: 0 }, [office]);
    assert.deepEqual(pts[pts.length - 1], { x: 50, y: 0 });
  });
});

describe("sse-bus", () => {
  it("delivers published events to subscribers", async () => {
    const seen: string[] = [];
    const unsub = subscribe((ev) => {
      if (ev.projectId === "test-proj") seen.push(ev.kind);
    });
    await publish({ projectId: "test-proj", kind: "activity", payload: {} });
    await publish({ projectId: "other-proj", kind: "activity", payload: {} });
    unsub();
    assert.deepEqual(seen, ["activity"]);
  });

  it("replays durable history per project", async () => {
    await publish({ projectId: "replay-proj", kind: "toast", payload: { message: "hi" } });
    const evs = await recentEvents("replay-proj");
    assert.ok(evs.some((e) => e.kind === "toast"));
    assert.ok(!(await recentEvents("replay-proj", Date.now() + 1000)).length);
  });

  it("caps history per project so the outbox cannot grow unbounded", async () => {
    for (let i = 0; i < 505; i++) {
      await publish({ projectId: "cap-proj", kind: "activity", payload: { n: i } });
    }
    const evs = await recentEvents("cap-proj");
    assert.equal(evs.length, 500);
  });

  it("isolates projects and honors since cursors", async () => {
    const before = Date.now();
    await publish({ projectId: "since-proj", kind: "activity", payload: { n: 1 } });
    assert.deepEqual(await recentEvents("unrelated-proj"), []);
    const fresh = await recentEvents("since-proj", before - 1);
    assert.ok(fresh.length >= 1);
    assert.ok(!(await recentEvents("since-proj", Date.now() + 60000)).length);
  });
});

describe("llm-provider", () => {
  it("parses provider:model refs", () => {
    assert.deepEqual(parseModelRef("anthropic:claude-3-5-sonnet-latest"), {
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
    });
    assert.deepEqual(parseModelRef("gpt-4o-mini"), { provider: "openai", model: "gpt-4o-mini" });
  });

  it("estimates positive cost", () => {
    assert.ok(estimateCost("openai:gpt-4o-mini", 1000, 500) > 0);
    assert.equal(estimateCost("openai:gpt-4o-mini", 0, 0), 0);
  });

  it("parses meta and custom refs (free-form model ids)", () => {
    assert.deepEqual(parseModelRef("meta:muse-spark-1.3"), { provider: "meta", model: "muse-spark-1.3" });
    assert.deepEqual(parseModelRef("custom:my-local-model"), { provider: "custom", model: "my-local-model" });
    // unknown future models still parse — the catalog is only suggestions
    assert.deepEqual(parseModelRef("openai:gpt-99"), { provider: "openai", model: "gpt-99" });
  });

  it("catalog suggests at least one Muse model", () => {
    assert.ok(MODEL_CATALOG.some((m) => m.provider === "meta"));
    assert.equal(META_BASE_URL, "https://api.meta.ai/v1");
  });

  it("resolves blank agent models to the system default", () => {
    assert.equal(resolveAgentModel("", "meta:muse-spark-1.3"), "meta:muse-spark-1.3");
    assert.equal(resolveAgentModel("   ", "meta:muse-spark-1.3"), "meta:muse-spark-1.3");
    assert.equal(resolveAgentModel(null, "meta:muse-spark-1.3"), "meta:muse-spark-1.3");
    assert.equal(resolveAgentModel("openai:gpt-4o", "meta:muse-spark-1.3"), "openai:gpt-4o");
    assert.equal(resolveAgentModel("", ""), FALLBACK_DEFAULT_MODEL);
  });

  it("builds meta/custom clients without network, custom requires a base URL", () => {
    assert.ok(modelFor({ provider: "meta", model: "muse-spark-1.3" }, { meta: "test-key" }));
    assert.ok(
      modelFor({ provider: "custom", model: "anything" }, { customBaseUrl: "https://example.test/v1", customApiKey: "k" })
    );
    assert.throws(() => modelFor({ provider: "custom", model: "anything" }, {}), /base URL/);
    assert.throws(() => modelFor({ provider: "nope" as never, model: "x" }, {}), /Unknown provider/);
  });
});

describe("artifacts", () => {
  it("accepts plain filenames", () => {
    assert.equal(sanitizeArtifactName("spec.md"), "spec.md");
    assert.equal(sanitizeArtifactName("  report v2.md  "), "report v2.md");
  });

  it("rejects path traversal and separators", () => {
    assert.throws(() => sanitizeArtifactName("../secrets.txt"));
    assert.throws(() => sanitizeArtifactName("a/b.md"));
    assert.throws(() => sanitizeArtifactName("a\\b.md"));
    assert.throws(() => sanitizeArtifactName(".."));
  });

  it("rejects hidden, empty, and weird names", () => {
    assert.throws(() => sanitizeArtifactName(".env"));
    assert.throws(() => sanitizeArtifactName("   "));
    assert.throws(() => sanitizeArtifactName("evil;rm.md"));
    assert.throws(() => sanitizeArtifactName("x".repeat(129)));
  });
});

describe("review", () => {
  it("caps revisions at 2 rounds, then auto-approves", () => {
    assert.equal(MAX_REVIEW_ROUNDS, 2);
    assert.equal(shouldAutoApprove(0), false);
    assert.equal(shouldAutoApprove(1), false);
    assert.equal(shouldAutoApprove(2), true);
    assert.equal(shouldAutoApprove(5), true);
  });

  it("parses APPROVE / REVISE verdict lines", () => {
    assert.deepEqual(parseReviewVerdict("APPROVE"), { approved: true, feedback: "" });
    assert.deepEqual(parseReviewVerdict("approve — looks great"), { approved: true, feedback: "" });
    const r = parseReviewVerdict("REVISE: add error handling");
    assert.equal(r.approved, false);
    assert.ok(r.feedback.includes("error handling"));
  });

  it("demo heuristic approves solid work but enforces the cap", () => {
    assert.equal(demoReviewDecide("a".repeat(100), 0).approved, true);
    assert.equal(demoReviewDecide("thin", 0).approved, false);
    assert.equal(demoReviewDecide("thin", 2).approved, true);
  });
});
