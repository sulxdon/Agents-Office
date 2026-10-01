"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container, Graphics, Stage, Text, useTick } from "@pixi/react";
import type * as PIXI from "pixi.js";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { uid } from "@/lib/utils";
import { pathQueues, requestPath } from "./Pathfinding";
import AgentCharacter from "./AgentCharacter";
import OfficeRoom from "./OfficeRoom";
import { isAgentLive } from "@/lib/live-feed";

export const COFFEE = { x: 550, y: 500 };
const SPEED = 2.2; // px per frame at 60fps

/**
 * Runs inside <Stage>: advances agents along their event-driven paths and
 * expires speech bubbles. No ambient behavior here — movement comes only
 * from real events (work start -> desk, idle -> Break Room, ask_teammate,
 * user drags) and speech only from real agent-say events.
 */
function WorldTicker() {
  useTick((delta) => {
    const s = useOfficeStore.getState();
    if (!s.running || !s.activeProjectId) return;
    const now = Date.now();
    const offices = s.offices.filter((o) => o.projectId === s.activeProjectId);

    for (const a of s.agents) {
      // expire speech bubbles
      if (a.bubble && a.bubbleUntil && a.bubbleUntil <= now) {
        s.agentSay(a.id, "", 0);
        // clear bubble text right away
        useOfficeStore.setState((st) => ({
          agents: st.agents.map((x) => (x.id === a.id ? { ...x, bubble: null, bubbleUntil: 0 } : x)),
        }));
        continue;
      }
      const hasTarget = a.targetX !== undefined && a.targetY !== undefined;
      if (!hasTarget) continue;
      let queue = pathQueues.get(a.id);
      if (!queue) {
        requestPath(a.id, { x: a.x, y: a.y }, { x: a.targetX!, y: a.targetY! }, offices);
        queue = pathQueues.get(a.id);
      }
      if (!queue || queue.length === 0) {
        pathQueues.delete(a.id);
        s.clearAgentTarget(a.id);
        if (a.status === "walking") s.setAgentStatus(a.id, "idle");
        continue;
      }
      const wp = queue[0];
      const dx = wp.x - a.x;
      const dy = wp.y - a.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * Math.min(delta, 3);
      if (dist <= step + 2) {
        queue.shift();
        s.setAgentPos(a.id, wp.x, wp.y);
        if (queue.length === 0) {
          pathQueues.delete(a.id);
          s.clearAgentTarget(a.id);
          if (a.status === "walking") s.setAgentStatus(a.id, "idle");
        }
      } else {
        s.setAgentPos(a.id, a.x + (dx / dist) * step, a.y + (dy / dist) * step);
      }
    }

  });
  return null;
}

export default function OfficeCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [scale, setScale] = useState(0.85);
  const scaleRef = useRef(scale);
  const [offset, setOffset] = useState({ x: 20, y: 10 });
  // Active canvas gesture: only one of pan / room-drag / agent-drag runs at a
  // time. Rooms and agents claim it via the shared gestureRef prop.
  const gesture = useRef<null | "pan" | "room" | "agent">(null);
  const pan = useRef<{ sx: number; sy: number; cx: number; cy: number; ox: number; oy: number } | null>(null);

  // Window-level pan tracking (fallback alongside the Pixi handlers below):
  // the background Graphics only sees moves while the pointer is over open
  // floor, so without this a pan stalls the moment it crosses a room/agent.
  const onWindowPanMove = useCallback((e: PointerEvent) => {
    if (gesture.current !== "pan" || !pan.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setOffset({
      x: pan.current.ox + (sx - pan.current.cx),
      y: pan.current.oy + (sy - pan.current.cy),
    });
  }, []);
  const onWindowPanUp = useCallback(() => {
    pan.current = null;
    if (gesture.current === "pan") gesture.current = null;
    window.removeEventListener("pointermove", onWindowPanMove);
    window.removeEventListener("pointerup", onWindowPanUp);
  }, [onWindowPanMove]);
  const endPan = useCallback(() => {
    pan.current = null;
    if (gesture.current === "pan") gesture.current = null;
    window.removeEventListener("pointermove", onWindowPanMove);
    window.removeEventListener("pointerup", onWindowPanUp);
  }, [onWindowPanMove, onWindowPanUp]);

  // Never leak window listeners if the canvas unmounts mid-pan.
  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onWindowPanMove);
      window.removeEventListener("pointerup", onWindowPanUp);
    },
    [onWindowPanMove, onWindowPanUp]
  );

  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const allOffices = useOfficeStore((s) => s.offices);
  const agents = useOfficeStore((s) => s.agents);
  const teams = useOfficeStore((s) => s.teams);
  // Select stable top-level slices; derive filtered lists via useMemo.
  // (An inline .filter() in the selector returns a new array every snapshot
  // and sends useSyncExternalStore into an infinite re-render loop.)
  const offices = useMemo(
    () => allOffices.filter((o) => o.projectId === activeProjectId),
    [allOffices, activeProjectId]
  );

  // resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // wheel zoom (native listener so we can preventDefault)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // zoom toward cursor (updaters stay pure: no setState-inside-setState)
      const next = Math.min(2.2, Math.max(0.3, scaleRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const prev = scaleRef.current;
      scaleRef.current = next;
      setScale(next);
      setOffset((off) => ({ x: mx - ((mx - off.x) / prev) * next, y: my - ((my - off.y) / prev) * next }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const setScaleSynced = useCallback((v: number) => {
    scaleRef.current = v;
    setScale(v);
  }, []);

  const toWorld = useCallback(
    (sx: number, sy: number) => ({ x: (sx - offset.x) / scale, y: (sy - offset.y) / scale }),
    [offset, scale]
  );

  // camera fly-to-agent
  const cameraTargetAgentId = useOfficeStore((s) => s.cameraTargetAgentId);
  useEffect(() => {
    if (!cameraTargetAgentId) return;
    const a = useOfficeStore.getState().agents.find((x) => x.id === cameraTargetAgentId);
    if (a) {
      setOffset({ x: size.w / 2 - a.x * scale, y: size.h / 2 - a.y * scale });
    }
    useOfficeStore.getState().clearFly();
  }, [cameraTargetAgentId, size.w, size.h, scale]);

  const teamColor = useCallback(
    (teamId: string) => teams.find((t) => t.id === teamId)?.color ?? "#a8a29e",
    [teams]
  );

  // Static backdrop: drawn once (stable callback), never in the ticker.
  const drawGrid = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0x0c0a09, 1);
    g.drawRect(-2000, -2000, 6000, 6000);
    g.endFill();
    // floor variation: large checker of faint warm tiles
    g.lineStyle(0);
    g.beginFill(0x1c1917, 0.55);
    const step = 240;
    let flip = false;
    for (let x = -2000; x < 4000; x += step) {
      flip = !flip;
      for (let y = -2000; y < 4000; y += step * 2) {
        g.drawRect(x, flip ? y : y + step, step, step);
      }
    }
    g.endFill();
    g.lineStyle(1, 0x292524, 0.6);
    for (let x = -2000; x < 4000; x += 48) {
      g.moveTo(x, -2000).lineTo(x, 4000);
    }
    for (let y = -2000; y < 4000; y += 48) {
      g.moveTo(-2000, y).lineTo(4000, y);
    }
  }, []);

  // Warm lamp glow spots over the floor (static, layered alpha circles).
  const drawLamps = useCallback((g: PIXI.Graphics) => {
    g.clear();
    const lamps = [
      { x: 290, y: 225 },
      { x: 810, y: 225 },
      { x: COFFEE.x, y: COFFEE.y - 10 },
    ];
    for (const l of lamps) {
      g.lineStyle(0);
      g.beginFill(0xfbbf24, 0.05);
      g.drawCircle(l.x, l.y, 150);
      g.endFill();
      g.beginFill(0xfbbf24, 0.07);
      g.drawCircle(l.x, l.y, 95);
      g.endFill();
      g.beginFill(0xfde68a, 0.10);
      g.drawCircle(l.x, l.y, 45);
      g.endFill();
    }
  }, []);

  // Dressed coffee corner: rug, counter, machine, stools, plant.
  const drawCoffee = useCallback((g: PIXI.Graphics) => {
    g.clear();
    // rug
    g.lineStyle(0);
    g.beginFill(0x7c2d12, 0.35);
    g.drawEllipse(COFFEE.x, COFFEE.y + 18, 74, 46);
    g.endFill();
    g.lineStyle(2, 0xfdba74, 0.35);
    g.drawEllipse(COFFEE.x, COFFEE.y + 18, 66, 39);
    // counter
    g.lineStyle(2, 0x000000, 0.5);
    g.beginFill(0x7c2d12, 1);
    g.drawRoundedRect(COFFEE.x - 26, COFFEE.y - 34, 52, 56, 8);
    g.endFill();
    // machine face + glow + slot
    g.lineStyle(0);
    g.beginFill(0xfdba74, 1);
    g.drawRoundedRect(COFFEE.x - 18, COFFEE.y - 24, 36, 18, 4);
    g.endFill();
    g.beginFill(0xfff7ed, 0.65);
    g.drawRect(COFFEE.x - 14, COFFEE.y - 21, 12, 4);
    g.endFill();
    g.beginFill(0x1c1917, 1);
    g.drawRect(COFFEE.x - 6, COFFEE.y + 2, 12, 12);
    g.endFill();
    // stools
    for (const sx of [COFFEE.x - 52, COFFEE.x + 52]) {
      g.lineStyle(1, 0x000000, 0.5);
      g.beginFill(0x44403c, 1);
      g.drawCircle(sx, COFFEE.y + 34, 9);
      g.endFill();
      g.beginFill(0xa8a29e, 1);
      g.drawCircle(sx, COFFEE.y + 34, 3);
      g.endFill();
    }
    // plant
    const px = COFFEE.x + 58;
    const py = COFFEE.y - 30;
    g.lineStyle(1, 0x000000, 0.5);
    g.beginFill(0xb45309, 1);
    g.drawRoundedRect(px - 9, py, 18, 14, 3);
    g.endFill();
    g.lineStyle(0);
    g.beginFill(0x16a34a, 1);
    g.drawCircle(px - 5, py - 6, 7);
    g.drawCircle(px + 5, py - 8, 8);
    g.drawCircle(px, py - 13, 7);
    g.endFill();
  }, []);

  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const selectedOfficeId = useOfficeStore((s) => s.selectedOfficeId);

  const agentsHere = useMemo(() => {
    const teamIds = new Set(teams.filter((t) => t.projectId === activeProjectId).map((t) => t.id));
    return agents.filter((a) => teamIds.has(a.teamId));
  }, [agents, activeProjectId, teams]);

  if (!activeProjectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-stone-950">
        <div className="text-3xl" aria-hidden>🏢</div>
        <div className="text-sm font-medium text-stone-200">No project yet</div>
        <div className="max-w-60 text-center text-xs leading-snug text-stone-500">
          Create a project from the left sidebar to open your first office floor.
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-stone-950">
      <Stage
        width={size.w}
        height={size.h}
        options={{ backgroundColor: 0x0c0a09, antialias: true }}
        onMount={() => undefined}
      >
        <Container x={offset.x} y={offset.y} scale={scale}>
          {/* background: pan + double-click to create office */}
          <Graphics
            draw={drawGrid}
            interactive
            cursor="grab"
            pointerdown={(e: PIXI.FederatedPointerEvent) => {
              if (gesture.current) return; // a room/agent drag owns the pointer
              const st = useOfficeStore.getState();
              st.setSelectedAgent(null);
              st.setSelectedOffice(null);
              gesture.current = "pan";
              const native = e.nativeEvent as PointerEvent;
              const rect = wrapRef.current?.getBoundingClientRect();
              pan.current = {
                sx: e.data.global.x,
                sy: e.data.global.y,
                cx: rect ? native.clientX - rect.left : e.data.global.x,
                cy: rect ? native.clientY - rect.top : e.data.global.y,
                ox: offset.x,
                oy: offset.y,
              };
              // Track the gesture at canvas level: window listeners keep the
              // pan alive while crossing rooms/agents (which swallow Pixi
              // moves) or leaving the canvas; pointer capture on the canvas
              // keeps Pixi's own event flow intact while dragging.
              window.addEventListener("pointermove", onWindowPanMove);
              window.addEventListener("pointerup", onWindowPanUp);
              try {
                const canvas = wrapRef.current?.querySelector("canvas");
                canvas?.setPointerCapture?.(native.pointerId);
              } catch {
                /* capture unsupported: window listeners still track the pan */
              }
            }}
            pointermove={(e: PIXI.FederatedPointerEvent) => {
              if (gesture.current !== "pan" || !pan.current) return;
              setOffset({
                x: pan.current.ox + (e.data.global.x - pan.current.sx),
                y: pan.current.oy + (e.data.global.y - pan.current.sy),
              });
            }}
            pointerup={() => {
              endPan();
            }}
            pointerupoutside={() => {
              endPan();
            }}
            click={(e: PIXI.FederatedPointerEvent) => {
              // Pixi has no dblclick event — detect double taps manually.
              const now = Date.now();
              const last = (e.currentTarget as unknown as { __lastClick?: number }).__lastClick ?? 0;
              (e.currentTarget as unknown as { __lastClick?: number }).__lastClick = now;
              if (now - last > 350) return;
              const st = useOfficeStore.getState();
              const p = toWorld(e.data.global.x, e.data.global.y);
              const n = st.offices.filter((o) => o.projectId === st.activeProjectId && o.kind !== "break").length + 1;
              st.addOffice({
                id: uid("off"),
                projectId: st.activeProjectId!,
                teamId: null,
                name: `Room ${n}`,
                x: Math.round(p.x - 230),
                y: Math.round(p.y - 165),
                width: 460,
                height: 330,
              });
            }}
          />
          <Graphics draw={drawLamps} />
          <Graphics draw={drawCoffee} />
          <Text
            text="☕ Coffee corner"
            x={COFFEE.x}
            y={COFFEE.y + 68}
            anchor={0.5}
            style={{ fontSize: 12, fill: "#a8a29e" } as unknown as PIXI.TextStyle}
          />
          {offices.map((o) => (
            <OfficeRoom
              key={o.id}
              office={o}
              color={o.kind === "break" ? "#fb923c" : o.teamId ? teamColor(o.teamId) : "#a8a29e"}
              selected={selectedOfficeId === o.id}
              gestureRef={gesture}
              toWorld={toWorld}
              onSelect={(id) => useOfficeStore.getState().setSelectedOffice(id)}
              onMove={(id, x, y) => {
                pathQueues.clear(); // walls moved: drop cached routes
                useOfficeStore.getState().moveOffice(id, x, y);
              }}
              onRename={(id) => {
                const cur = useOfficeStore.getState().offices.find((x) => x.id === id);
                const name = window.prompt("Rename room:", cur?.name ?? "");
                if (name && name.trim()) useOfficeStore.getState().renameOffice(id, name.trim());
              }}
            />
          ))}
          {agentsHere.map((a) => (
            <AgentCharacter
              key={a.id}
              agent={a}
              color={teamColor(a.teamId)}
              selected={selectedAgentId === a.id}
              live={isAgentLive(a.status)}
              gestureRef={gesture}
              toWorld={toWorld}
              onSelect={(id) => useOfficeStore.getState().setSelectedAgent(id)}
              onDragMove={(id, x, y) => {
                pathQueues.delete(id);
                useOfficeStore.getState().setAgentPos(id, Math.round(x), Math.round(y));
              }}
              onDrop={(id, x, y) => {
                const st = useOfficeStore.getState();
                const room = st.offices.find(
                  (o) => o.projectId === st.activeProjectId && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height
                );
                const ag = st.agents.find((v) => v.id === id);
                if (room?.teamId && ag && room.teamId !== ag.teamId) {
                  st.moveAgentToTeam(id, room.teamId, Math.round(x), Math.round(y), room.id);
                  st.agentSay(id, `Joining ${st.teams.find((t) => t.id === room.teamId)?.name ?? "new team"}!`);
                } else {
                  // Dropping an agent in a regular room re-homes them there
                  // (Break Room lounges are visit-only: home stays put).
                  if (room && room.kind !== "break") st.updateAgent(id, { homeOfficeId: room.id });
                  st.clearAgentTarget(id);
                  st.setAgentStatus(id, "idle");
                }
              }}
            />
          ))}
          <WorldTicker />
        </Container>
      </Stage>
      {/* zoom controls */}
      <div className="absolute bottom-3 left-3 flex gap-1">
        <button title="Zoom in" aria-label="Zoom in" className="rounded-md border border-stone-700/70 bg-stone-900/90 px-2 py-1 text-sm text-stone-200 hover:bg-stone-800" onClick={() => setScaleSynced(Math.min(2.2, scaleRef.current * 1.2))}>+</button>
        <button title="Zoom out" aria-label="Zoom out" className="rounded-md border border-stone-700/70 bg-stone-900/90 px-2 py-1 text-sm text-stone-200 hover:bg-stone-800" onClick={() => setScaleSynced(Math.max(0.3, scaleRef.current / 1.2))}>−</button>
        <button
          title="Reset camera"
          className="rounded-md border border-stone-700/70 bg-stone-900/90 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800"
          onClick={() => {
            setScaleSynced(0.85);
            setOffset({ x: 20, y: 10 });
          }}
        >
          Reset view
        </button>
        <button
          title="Tile rooms in a grid"
          className="rounded-md border border-stone-700/70 bg-stone-900/90 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800"
          onClick={() => useOfficeStore.getState().autoArrange()}
        >
          Auto arrange
        </button>
      </div>
      <div className="absolute bottom-3 right-3 rounded-md border border-stone-800 bg-stone-900/85 px-2 py-1 text-[11px] text-stone-500">
        Drag to pan · Scroll to zoom · Double-click floor for a room · Drag agents between rooms
      </div>
    </div>
  );
}
