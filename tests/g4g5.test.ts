// G4+G5 pure-helper coverage: md-lite renderer, brief grouping/summary,
// and artifact-row collection. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMdLite, renderInline, escapeHtml } from "../lib/md-lite";
import {
  groupTasksByGoal,
  summarizeBrief,
  collectArtifactRows,
  mergeServerFiles,
} from "../lib/brief";

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    assert.equal(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
  });
});

describe("renderMdLite", () => {
  it("renders headings", () => {
    assert.equal(renderMdLite("# Title"), "<h1>Title</h1>");
    assert.equal(renderMdLite("### Sub"), "<h3>Sub</h3>");
  });

  it("renders unordered and ordered lists", () => {
    assert.equal(renderMdLite("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
    assert.equal(renderMdLite("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  });

  it("renders fenced code blocks without interpreting markup", () => {
    const out = renderMdLite("```\n<b>hi</b>\n```");
    assert.equal(out, "<pre><code>&lt;b&gt;hi&lt;/b&gt;</code></pre>");
  });

  it("renders inline code, bold, and links", () => {
    assert.ok(renderMdLite("use `x()` here").includes("<code>x()</code>"));
    assert.ok(renderMdLite("a **bold** b").includes("<strong>bold</strong>"));
    const link = renderMdLite("[docs](https://example.com/a)");
    assert.ok(link.includes('<a href="https://example.com/a"'));
    assert.ok(link.includes("noopener"));
  });

  it("escapes raw HTML and rejects non-http links", () => {
    const out = renderMdLite('<script>alert(1)</script>\n[x](javascript:alert(1))');
    assert.ok(!out.includes("<script>"));
    assert.ok(out.includes("&lt;script&gt;"));
    assert.ok(!out.includes("javascript:"));
    assert.ok(!out.includes("<a href"));
  });

  it("wraps plain lines in paragraphs", () => {
    assert.equal(renderMdLite("hello\nworld"), "<p>hello<br>world</p>");
  });
});

describe("renderInline", () => {
  it("does not format markup inside code spans", () => {
    assert.equal(renderInline("`**x**`"), "<code>**x**</code>");
  });
});

describe("groupTasksByGoal", () => {
  const goals = [
    { id: "g1", title: "Launch", status: "active" },
    { id: "g2", title: "Empty", status: "active" },
  ];
  const tasks = [
    { id: "t1", goalId: "g1", title: "Old", status: "done", assigneeAgentId: null, assigneeName: null, updatedAt: 1, artifacts: [] },
    { id: "t2", goalId: "g1", title: "New", status: "doing", assigneeAgentId: "a1", assigneeName: "Dev", updatedAt: 5, artifacts: ["a.md"] },
    { id: "t3", goalId: "gone", title: "Orphan", status: "todo", assigneeAgentId: null, assigneeName: null, updatedAt: 3, artifacts: [] },
  ];

  it("groups under goals newest-first and keeps empty goals", () => {
    const sections = groupTasksByGoal(goals, tasks);
    assert.equal(sections.length, 3); // + "Other tasks"
    assert.equal(sections[0].goal.title, "Launch");
    assert.deepEqual(sections[0].tasks.map((t) => t.id), ["t2", "t1"]);
    assert.deepEqual(sections[1].tasks, []);
    assert.equal(sections[2].goal.title, "Other tasks");
    assert.deepEqual(sections[2].tasks.map((t) => t.id), ["t3"]);
  });

  it("omits the ungrouped section when every task has a goal", () => {
    assert.equal(groupTasksByGoal(goals, tasks.slice(0, 2)).length, 2);
  });
});

describe("summarizeBrief", () => {
  it("counts statuses and derives approvals/revisions", () => {
    const c = summarizeBrief(
      [{ status: "done" }, { status: "done" }, { status: "review" }, { status: "doing" }, { status: "blocked" }, { status: "todo" }],
      4
    );
    assert.equal(c.total, 6);
    assert.equal(c.done, 2);
    assert.equal(c.approvals, 2);
    assert.equal(c.revisions, 4);
    assert.equal(c.blocked, 1);
  });

  it("clamps negative revision counts", () => {
    assert.equal(summarizeBrief([], -3).revisions, 0);
  });
});

describe("collectArtifactRows", () => {
  it("flattens task artifacts newest-first with agent names", () => {
    const rows = collectArtifactRows(
      [
        { id: "t1", title: "Old", assigneeAgentId: "a1", updatedAt: 1, artifacts: ["a.md", "b.md"] },
        { id: "t2", title: "New", assigneeAgentId: null, updatedAt: 9, artifacts: ["c.md"] },
      ],
      (id) => (id === "a1" ? "Dev" : null)
    );
    assert.deepEqual(rows.map((r) => r.file), ["c.md", "a.md", "b.md"]);
    assert.equal(rows[1].agentName, "Dev");
    assert.equal(rows[0].agentName, null);
    assert.equal(rows[1].taskTitle, "Old");
  });
});

describe("mergeServerFiles", () => {
  it("adds unlinked rows only for unknown files", () => {
    const base = [{ file: "a.md", taskId: "t1", taskTitle: "T", agentName: "Dev", updatedAt: 1 }];
    const out = mergeServerFiles(base, ["a.md", "orphan.md"]);
    assert.equal(out.length, 2);
    assert.equal(out[1].file, "orphan.md");
    assert.equal(out[1].taskId, null);
  });
});
