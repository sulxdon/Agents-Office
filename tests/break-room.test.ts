// G2 behavior-model coverage: desk anchors, Break Room backfill, lounge spots.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  breakSpotFor,
  deskAnchorFor,
  ensureBreakRoom,
  type Office,
} from "../lib/store/useOfficeStore";

const office: Office = { id: "o", projectId: "p", teamId: "t", name: "Room", x: 60, y: 60, width: 460, height: 330 };
const lounge: Office = { id: "off_break_p", projectId: "p", teamId: null, name: "Break Room", x: 60, y: 430, width: 460, height: 260, kind: "break" };
const agent = { id: "a", teamId: "t" };

describe("deskAnchorFor", () => {
  it("returns the first free desk in the agent's assigned office", () => {
    assert.deepEqual(deskAnchorFor(agent, [office], []), { x: 150, y: 150 });
  });

  it("treats offices without a kind field as regular rooms", () => {
    const { kind: _drop, ...legacy } = { ...office, kind: "room" as const };
    assert.deepEqual(deskAnchorFor(agent, [legacy], []), { x: 150, y: 150 });
  });

  it("is stable when the agent already sits at its desk (own spot excluded)", () => {
    const anchor = deskAnchorFor(agent, [office], [{ id: "a", x: 150, y: 150 }]);
    assert.deepEqual(anchor, { x: 150, y: 150 });
  });

  it("avoids desks occupied by teammates", () => {
    const anchor = deskAnchorFor(agent, [office], [{ id: "b", x: 150, y: 150 }]);
    assert.deepEqual(anchor, { x: 350, y: 150 });
  });

  it("returns null when the team has no office", () => {
    assert.equal(deskAnchorFor(agent, [], []), null);
    assert.equal(deskAnchorFor({ id: "a", teamId: "zzz" }, [office], []), null);
  });

  it("never anchors inside a Break Room", () => {
    const fakeTeamLounge: Office = { ...lounge, teamId: "t" };
    assert.equal(deskAnchorFor(agent, [fakeTeamLounge], []), null);
    // a real lounge alongside the team office does not disturb the anchor
    assert.deepEqual(deskAnchorFor(agent, [office, lounge], []), { x: 150, y: 150 });
  });
});

describe("breakSpotFor", () => {
  it("returns a spot inside the project's Break Room", () => {
    const spot = breakSpotFor("p", [office, lounge], []);
    assert.ok(spot);
    assert.ok(spot.x > lounge.x && spot.x < lounge.x + lounge.width);
    assert.ok(spot.y > lounge.y && spot.y < lounge.y + lounge.height);
  });

  it("returns null when the project has no Break Room", () => {
    assert.equal(breakSpotFor("p", [office], []), null);
    assert.equal(breakSpotFor("other", [office, lounge], []), null);
  });

  it("spreads idlers across the lounge", () => {
    const first = breakSpotFor("p", [lounge], []);
    const second = breakSpotFor("p", [lounge], [{ id: "x", x: first!.x, y: first!.y }]);
    assert.ok(Math.hypot(first!.x - second!.x, first!.y - second!.y) > 48);
  });
});

describe("ensureBreakRoom", () => {
  it("appends exactly one Break Room below the existing rooms", () => {
    const out = ensureBreakRoom([office], "p");
    assert.equal(out.length, 2);
    const room = out[1];
    assert.equal(room.id, "off_break_p");
    assert.equal(room.kind, "break");
    assert.equal(room.teamId, null);
    assert.equal(room.name, "Break Room");
    assert.equal(room.y, 60 + 330 + 40);
  });

  it("is idempotent: existing rooms are returned by reference", () => {
    const input = [office, lounge];
    assert.equal(ensureBreakRoom(input, "p"), input);
  });

  it("backfills each project independently", () => {
    const other: Office = { ...office, id: "o2", projectId: "q", teamId: "tq" };
    const out = ensureBreakRoom(ensureBreakRoom([office, other], "p"), "q");
    assert.deepEqual(
      out.filter((o) => o.kind === "break").map((o) => o.projectId).sort(),
      ["p", "q"]
    );
  });

  it("seeds a default position when the project has no rooms", () => {
    const out = ensureBreakRoom([], "p");
    assert.equal(out.length, 1);
    assert.equal(out[0].y, 430);
  });
});
