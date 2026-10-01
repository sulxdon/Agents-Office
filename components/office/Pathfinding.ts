// A* pathfinding on a coarse grid. Office perimeter walls block movement
// except for a door gap centered on the bottom edge of each room.

import type { Office } from "@/lib/store/useOfficeStore";

export const CELL = 24;
export const DOOR_WIDTH = 72;
export const WALL_PAD = 6;

export interface Pt {
  x: number;
  y: number;
}

function toCell(p: Pt): Pt {
  return { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
}

function toWorld(c: Pt): Pt {
  return { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 };
}

/** True when the world point hits a wall segment of any office. */
function hitsWall(p: Pt, offices: Office[]): boolean {
  for (const o of offices) {
    const left = o.x;
    const right = o.x + o.width;
    const top = o.y;
    const bottom = o.y + o.height;
    const nearV = (x: number) => Math.abs(p.x - x) < WALL_PAD && p.y >= top - WALL_PAD && p.y <= bottom + WALL_PAD;
    const nearH = (y: number) => Math.abs(p.y - y) < WALL_PAD && p.x >= left - WALL_PAD && p.x <= right + WALL_PAD;
    const doorX0 = o.x + o.width / 2 - DOOR_WIDTH / 2;
    const doorX1 = o.x + o.width / 2 + DOOR_WIDTH / 2;
    const inDoor = p.x >= doorX0 && p.x <= doorX1;
    if (nearV(left) || nearV(right)) return true;
    if (nearH(top)) return true;
    if (nearH(bottom) && !inDoor) return true;
  }
  return false;
}

const key = (c: Pt) => `${c.x},${c.y}`;

export function findPath(start: Pt, end: Pt, offices: Office[], maxIter = 4000): Pt[] {
  const s = toCell(start);
  const e = toCell(end);
  if (key(s) === key(e)) return [end];
  // Clamp search bounds to a box around start/end so the open world stays cheap.
  const minX = Math.min(s.x, e.x) - 20;
  const maxX = Math.max(s.x, e.x) + 20;
  const minY = Math.min(s.y, e.y) - 20;
  const maxY = Math.max(s.y, e.y) + 20;

  const open: { c: Pt; f: number }[] = [{ c: s, f: 0 }];
  const came = new Map<string, string>();
  const g = new Map<string, number>([[key(s), 0]]);
  const closed = new Set<string>();
  const h = (c: Pt) => Math.abs(c.x - e.x) + Math.abs(c.y - e.y);

  let iter = 0;
  while (open.length > 0 && iter++ < maxIter) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!.c;
    const ck = key(cur);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (ck === key(e)) {
      // reconstruct
      const cells: Pt[] = [cur];
      let k = ck;
      while (came.has(k)) {
        k = came.get(k)!;
        const [x, y] = k.split(",").map(Number);
        cells.push({ x, y });
      }
      cells.reverse();
      const pts = cells.map(toWorld);
      pts[pts.length - 1] = end;
      return smooth(pts, offices);
    }
    const neighbors = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) continue;
      const nk = key(n);
      if (closed.has(nk)) continue;
      if (hitsWall(toWorld(n), offices)) continue;
      const ng = (g.get(ck) ?? Infinity) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, ck);
        open.push({ c: n, f: ng + h(n) });
      }
    }
  }
  // No path (e.g. target inside a wall): fall back to a straight walk.
  return [end];
}

/** Drop waypoints when a straight line between neighbors is wall-free. */
function smooth(pts: Pt[], offices: Office[]): Pt[] {
  if (pts.length <= 2) return pts;
  const out: Pt[] = [pts[0]];
  let anchor = 0;
  for (let i = 2; i <= pts.length; i++) {
    const next = pts[i];
    if (next && lineClear(pts[anchor], next, offices)) continue;
    out.push(pts[i - 1]);
    anchor = i - 1;
  }
  return out;
}

function lineClear(a: Pt, b: Pt, offices: Office[]): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(dist / (CELL / 2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (hitsWall({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, offices)) return false;
  }
  return true;
}

/** Live waypoint queues per agent. Kept outside React state at 60fps. */
export const pathQueues = new Map<string, Pt[]>();

export function requestPath(agentId: string, from: Pt, to: Pt, offices: Office[]) {
  pathQueues.set(agentId, findPath(from, to, offices));
}
