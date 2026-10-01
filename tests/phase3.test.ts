// Phase 3 pure-helper coverage: hiring/skill parsing, spawn spots,
// task status cycling, and the Markdown project report.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_ROLES,
  cascadeDeleteProject,
  freeDeskSpot,
  nextTaskStatus,
  parseSkills,
  resetModelsToDefault,
  type Agent,
} from "../lib/store/useOfficeStore";
import { buildProjectReport } from "../lib/report";

describe("agent roles", () => {
  it("covers the seven hireable roles", () => {
    assert.deepEqual([...AGENT_ROLES], ["manager", "developer", "designer", "researcher", "qa", "writer", "marketer"]);
  });
});

describe("parseSkills", () => {
  it("splits, trims, and drops empties", () => {
    assert.deepEqual(parseSkills("react, typescript , , api-design"), ["react", "typescript", "api-design"]);
  });

  it("dedupes case-insensitively and caps at 12", () => {
    assert.deepEqual(parseSkills("React, react, REACT"), ["React"]);
    const many = Array.from({ length: 20 }, (_, i) => `s${i}`).join(",");
    assert.equal(parseSkills(many).length, 12);
  });

  it("handles empty input", () => {
    assert.deepEqual(parseSkills(""), []);
    assert.deepEqual(parseSkills("   , ,"), []);
  });
});

describe("nextTaskStatus", () => {
  it("cycles todo -> doing -> review -> done -> todo", () => {
    assert.equal(nextTaskStatus("todo"), "doing");
    assert.equal(nextTaskStatus("doing"), "review");
    assert.equal(nextTaskStatus("review"), "done");
    assert.equal(nextTaskStatus("done"), "todo");
    assert.equal(nextTaskStatus("blocked"), "todo");
  });
});

describe("freeDeskSpot", () => {
  const office = { id: "o", projectId: "p", teamId: "t", name: "Room", x: 60, y: 60, width: 460, height: 330 };

  it("returns a spot inside the room", () => {
    const s = freeDeskSpot(office, []);
    assert.ok(s.x > office.x && s.x < office.x + office.width);
    assert.ok(s.y > office.y && s.y < office.y + office.height);
  });

  it("avoids occupied desks", () => {
    const first = freeDeskSpot(office, []);
    const second = freeDeskSpot(office, [first]);
    assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 48);
  });

  it("still returns an in-room spot when crowded", () => {
    const crowd = Array.from({ length: 40 }, (_, i) => ({ x: 100 + (i % 10) * 30, y: 100 + Math.floor(i / 10) * 30 }));
    const s = freeDeskSpot(office, crowd);
    assert.ok(s.x >= office.x && s.x <= office.x + office.width);
    assert.ok(s.y >= office.y && s.y <= office.y + office.height);
  });
});

describe("buildProjectReport", () => {
  const input = {
    project: { id: "p1", name: "Coffee Shop", description: "Landing page" },
    goals: [{ title: "Launch site", status: "active", priority: "high" }],
    tasks: [
      { title: "Design hero", status: "done", assigneeName: "Pip" },
      { title: "Build API", status: "doing", assigneeName: "Devon" },
      { title: "Write copy", status: "todo", assigneeName: null },
    ],
    memories: [{ type: "decision", content: "Use Next.js", createdAt: 1000 }],
    activities: [{ type: "task", description: "Devon started Build API", timestamp: 2000 }],
    spend: 0.01234,
    generatedAt: 0,
  };

  it("includes every section", () => {
    const md = buildProjectReport(input);
    for (const h of ["# Coffee Shop", "## Goals", "## Tasks by status", "## Memories", "## Recent activity", "## Session spend"]) {
      assert.ok(md.includes(h), `missing ${h}`);
    }
    assert.ok(md.includes("Launch site"));
    assert.ok(md.includes("### doing (1)"));
    assert.ok(md.includes("Build API"));
    assert.ok(md.includes("Use Next.js"));
    assert.ok(md.includes("$0.0123"));
  });

  it("handles empty projects without crashing", () => {
    const md = buildProjectReport({ ...input, goals: [], tasks: [], memories: [], activities: [], spend: 0 });
    assert.ok(md.includes("No goals yet"));
    assert.ok(md.includes("No tasks yet"));
    assert.ok(md.includes("$0.0000"));
  });
});

describe("resetModelsToDefault", () => {
  const mk = (id: string, model: string): Agent => ({
    id, teamId: "t", name: id, role: "developer", avatar: "🐧", personalityPrompt: "",
    model, skills: [], status: "idle", x: 0, y: 0, currentTaskId: null,
  });

  it("blanks every model so agents inherit the system default", () => {
    const out = resetModelsToDefault([mk("a", "openai:gpt-4o"), mk("b", "")]);
    assert.deepEqual(out.map((a) => a.model), ["", ""]);
    assert.equal(out[0].name, "a"); // only the model changes
  });

  it("keeps already-inheriting agents referentially stable", () => {
    const a = mk("a", "");
    assert.equal(resetModelsToDefault([a])[0], a);
  });
});

describe("cascadeDeleteProject", () => {
  const world = () => ({
    projects: [
      { id: "p1", name: "One", description: "", icon: "🏢", floorNumber: 1, createdAt: 1 },
      { id: "p2", name: "Two", description: "", icon: "🏢", floorNumber: 2, createdAt: 2 },
    ],
    teams: [
      { id: "t1", projectId: "p1", name: "A", color: "#fff", officeId: null },
      { id: "t2", projectId: "p2", name: "B", color: "#fff", officeId: null },
    ],
    offices: [
      { id: "o1", projectId: "p1", teamId: "t1", name: "R1", x: 0, y: 0, width: 1, height: 1 },
      { id: "o2", projectId: "p2", teamId: "t2", name: "R2", x: 0, y: 0, width: 1, height: 1 },
    ],
    agents: [
      { id: "a1", teamId: "t1", name: "A", role: "developer", avatar: "", personalityPrompt: "", model: "", skills: [], status: "idle" as const, x: 0, y: 0, currentTaskId: null },
      { id: "a2", teamId: "t2", name: "B", role: "developer", avatar: "", personalityPrompt: "", model: "", skills: [], status: "idle" as const, x: 0, y: 0, currentTaskId: null },
    ],
    goals: [{ id: "g1", projectId: "p1", title: "G", description: "", status: "active", priority: "high", createdAt: 1 }],
    tasks: [{ id: "k1", goalId: "g1", projectId: "p1", title: "T", description: "", assigneeAgentId: "a1", status: "doing" as const, dependencies: [], artifacts: [], createdAt: 1, updatedAt: 1 }],
    activities: [{ id: "x1", projectId: "p1", type: "info", description: "d", timestamp: 1 }],
    activeProjectId: "p1",
    selectedAgentId: "a1",
    selectedOfficeId: "o1",
    selectedTaskId: "k1",
    cameraTargetAgentId: "a1",
  });

  it("removes only the deleted project's floor and clears its pointers", () => {
    const out = cascadeDeleteProject(world(), "p1");
    assert.deepEqual(out.projects.map((p) => p.id), ["p2"]);
    assert.deepEqual(out.teams.map((t) => t.id), ["t2"]);
    assert.deepEqual(out.offices.map((o) => o.id), ["o2"]);
    assert.deepEqual(out.agents.map((a) => a.id), ["a2"]);
    assert.deepEqual(out.goals, []);
    assert.deepEqual(out.tasks, []);
    assert.deepEqual(out.activities, []);
    assert.equal(out.activeProjectId, null);
    assert.equal(out.selectedAgentId, null);
    assert.equal(out.selectedOfficeId, null);
    assert.equal(out.selectedTaskId, null);
    assert.equal(out.cameraTargetAgentId, null);
  });

  it("deleting an inactive project keeps the active floor and selections", () => {
    const out = cascadeDeleteProject({ ...world(), activeProjectId: "p2", selectedAgentId: "a2", cameraTargetAgentId: "a2" }, "p1");
    assert.equal(out.activeProjectId, "p2");
    assert.equal(out.selectedAgentId, "a2");
    assert.equal(out.cameraTargetAgentId, "a2");
    assert.deepEqual(out.projects.map((p) => p.id), ["p2"]);
  });
});
