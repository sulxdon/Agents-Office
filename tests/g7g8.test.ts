// G7 rooms/home-office + G8 integrations pure-helper coverage.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultOfficeFor,
  deskAnchorFor,
  homeOfficeFor,
  nextRoomSpot,
  rehomeAgentsForRoomDelete,
  type Office,
} from "../lib/store/useOfficeStore";
import {
  activeWebhooks,
  buildWebhookPayload,
  htmlToText,
  sanitizeToolName,
  truncateText,
  webhookToolName,
} from "../lib/integrations";
import {
  buildKeysHeader,
  headerPayloadFromHeader,
  keysFromHeader,
  webhooksFromHeader,
} from "../lib/llm-provider";

const officeA: Office = { id: "oa", projectId: "p", teamId: "ta", name: "A", x: 60, y: 60, width: 460, height: 330 };
const officeB: Office = { id: "ob", projectId: "p", teamId: null, name: "B", x: 580, y: 60, width: 460, height: 330 };
const lounge: Office = { id: "off_break_p", projectId: "p", teamId: null, name: "Break Room", x: 60, y: 430, width: 460, height: 260, kind: "break" };
const other: Office = { id: "oq", projectId: "q", teamId: "tq", name: "Q", x: 60, y: 60, width: 460, height: 330 };
const teams = [
  { id: "ta", projectId: "p", name: "A", color: "#fff", officeId: "oa" },
  { id: "tb", projectId: "p", name: "B", color: "#fff", officeId: null },
];

describe("defaultOfficeFor", () => {
  it("picks the project's first regular room", () => {
    assert.equal(defaultOfficeFor("p", [officeA, officeB, lounge])?.id, "oa");
  });

  it("skips Break Rooms and other projects", () => {
    assert.equal(defaultOfficeFor("p", [lounge, other, officeB])?.id, "ob");
    assert.equal(defaultOfficeFor("q", [officeA, lounge]), null);
  });

  it("returns null when the project has no regular rooms", () => {
    assert.equal(defaultOfficeFor("p", [lounge]), null);
    assert.equal(defaultOfficeFor("p", []), null);
  });
});

describe("homeOfficeFor", () => {
  it("prefers the explicit home office", () => {
    assert.equal(homeOfficeFor({ teamId: "ta", homeOfficeId: "ob" }, [officeA, officeB], teams)?.id, "ob");
  });

  it("falls back to the team office, then the project default", () => {
    assert.equal(homeOfficeFor({ teamId: "ta" }, [officeA, officeB], teams)?.id, "oa");
    // tb has no office of its own: works from the project default
    assert.equal(homeOfficeFor({ teamId: "tb" }, [officeA, officeB], teams)?.id, "oa");
  });

  it("ignores a stale home id and resolves the team office instead", () => {
    assert.equal(homeOfficeFor({ teamId: "ta", homeOfficeId: "gone" }, [officeA], teams)?.id, "oa");
  });

  it("never resolves to a Break Room", () => {
    assert.equal(homeOfficeFor({ teamId: "tb", homeOfficeId: "off_break_p" }, [officeA, lounge], teams)?.id, "oa");
    assert.equal(homeOfficeFor({ teamId: "zzz" }, [officeA], teams), null);
  });
});

describe("deskAnchorFor home preference", () => {
  it("seats the agent at its home room desk", () => {
    const anchor = deskAnchorFor({ id: "a", teamId: "ta", homeOfficeId: "ob" }, [officeA, officeB], [], teams);
    assert.deepEqual(anchor, { x: 670, y: 150 });
  });

  it("unassigned agents anchor in the project default office", () => {
    const anchor = deskAnchorFor({ id: "a", teamId: "tb" }, [officeA, officeB, lounge], [], teams);
    assert.deepEqual(anchor, { x: 150, y: 150 });
  });
});

describe("rehomeAgentsForRoomDelete", () => {
  it("moves agents homed in the deleted room to the fallback", () => {
    const agents = [
      { id: "a", homeOfficeId: "oa" as string | null },
      { id: "b", homeOfficeId: "ob" as string | null },
      { id: "c", homeOfficeId: null },
    ];
    const out = rehomeAgentsForRoomDelete(agents, "oa", "ob");
    assert.deepEqual(out.map((a) => a.homeOfficeId), ["ob", "ob", null]);
  });

  it("supports a null fallback and keeps other agents referentially stable", () => {
    const keep = { id: "b", homeOfficeId: "ob" as string | null };
    const out = rehomeAgentsForRoomDelete([{ id: "a", homeOfficeId: "oa" }, keep], "oa", null);
    assert.equal(out[0].homeOfficeId, null);
    assert.equal(out[1], keep);
  });
});

describe("nextRoomSpot", () => {
  it("tiles rooms on the auto-arrange grid", () => {
    assert.deepEqual(nextRoomSpot([], "p"), { x: 60, y: 60 });
    assert.deepEqual(nextRoomSpot([officeA], "p"), { x: 560, y: 60 });
    assert.deepEqual(nextRoomSpot([officeA, officeB], "p"), { x: 60, y: 430 });
  });

  it("skips slots that overlap existing rooms", () => {
    const squatter: Office = { ...officeB, id: "sq", x: 560, y: 60 };
    const spot = nextRoomSpot([officeA, squatter], "p");
    assert.deepEqual(spot, { x: 60, y: 430 });
  });

  it("ignores other projects' rooms", () => {
    assert.deepEqual(nextRoomSpot([other], "p"), { x: 60, y: 60 });
  });
});

describe("htmlToText", () => {
  it("drops scripts, styles, and tags but keeps text", () => {
    const text = htmlToText(
      `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>` +
        `<body><h1>Hello</h1><p>World &amp; <b>friends</b></p></body></html>`
    );
    assert.ok(!text.includes("alert") && !text.includes("color"), text);
    assert.ok(text.includes("Hello") && text.includes("World & friends"), text);
    assert.ok(!text.includes("<"), text);
  });

  it("decodes entities and collapses whitespace", () => {
    assert.equal(htmlToText(`<p>A&nbsp;&nbsp;B&#33; &lt;3</p>`), "A B! <3");
    assert.equal(htmlToText(`<div>  a\t\tb  </div>`), "a b");
  });

  it("handles empty input", () => {
    assert.equal(htmlToText(""), "");
  });
});

describe("sanitizeToolName", () => {
  it("maps names to [a-z0-9_]", () => {
    assert.equal(sanitizeToolName("Deploy Hook!"), "deploy_hook");
    assert.equal(sanitizeToolName("  __My-API_v2__ "), "my_api_v2");
    assert.match(sanitizeToolName("Anything @#$ here"), /^[a-z0-9_]+$/);
  });

  it("falls back when nothing survives", () => {
    assert.equal(sanitizeToolName("!!!"), "webhook");
    assert.equal(sanitizeToolName(""), "webhook");
  });

  it("builds call_<name> tool names and webhook payloads", () => {
    assert.equal(webhookToolName("Deploy Hook!"), "call_deploy_hook");
    assert.deepEqual(buildWebhookPayload("hello"), { text: "hello" });
  });
});

describe("truncateText", () => {
  it("passes short text through and marks truncation", () => {
    assert.equal(truncateText("abc", 10), "abc");
    assert.equal(truncateText("abcdef", 3), "abc…[truncated]");
  });
});

describe("activeWebhooks", () => {
  it("keeps only named http(s) webhooks", () => {
    const list = activeWebhooks([
      { name: "ok", url: "https://example.com/hook" },
      { name: "", url: "https://example.com/empty" },
      { name: "nope", url: "ftp://example.com/x" },
      { name: "blank", url: "  " },
    ]);
    assert.deepEqual(list.map((w) => w.name), ["ok"]);
    assert.deepEqual(activeWebhooks(null), []);
    assert.deepEqual(activeWebhooks(undefined), []);
  });
});

describe("keys header round-trip", () => {
  it("carries keys plus webhooks and decodes both", () => {
    const header = buildKeysHeader({ openai: "sk-x" }, [{ name: "h", url: "https://x.test", secret: "s" }]);
    const { keys, webhooks } = headerPayloadFromHeader(header);
    assert.deepEqual(keys, { openai: "sk-x" });
    assert.deepEqual(webhooks, [{ name: "h", url: "https://x.test", secret: "s" }]);
  });

  it("keysFromHeader strips the webhooks array (legacy key-only shape)", () => {
    const legacy = Buffer.from(JSON.stringify({ openai: "k" }), "utf-8").toString("base64");
    assert.deepEqual(keysFromHeader(legacy), { openai: "k" });
    assert.deepEqual(webhooksFromHeader(legacy), []);
    const header = buildKeysHeader({ openai: "k" }, [{ name: "h", url: "https://x.test" }]);
    assert.deepEqual(keysFromHeader(header), { openai: "k" });
    assert.equal(webhooksFromHeader(header).length, 1);
  });

  it("tolerates missing and corrupt headers", () => {
    assert.deepEqual(headerPayloadFromHeader(null), { keys: {}, webhooks: [] });
    assert.deepEqual(headerPayloadFromHeader("not-base64!!!"), { keys: {}, webhooks: [] });
  });
});
