"use client";

import { useCallback, useRef } from "react";
import { Container, Graphics, Text } from "@pixi/react";
import type * as PIXI from "pixi.js";
import type { Agent } from "@/lib/store/useOfficeStore";

interface Props {
  agent: Agent;
  color: string;
  selected: boolean;
  /** True while the agent is actively working — tints the nameplate + shows a live dot. */
  live?: boolean;
  /** Shared canvas gesture lock: agent drags claim "agent" so pans stay exclusive. */
  gestureRef: { current: null | "pan" | "room" | "agent" };
  toWorld: (sx: number, sy: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDrop: (id: string, x: number, y: number) => void;
}

const ROLE_BADGE: Record<string, string> = {
  manager: "MGR",
  developer: "DEV",
  designer: "DSN",
  researcher: "RSH",
  qa: "QA",
  writer: "WRT",
  marketer: "MKT",
};

const STATUS_DOT: Record<string, string> = {
  idle: "#4ade80",
  thinking: "#facc15",
  working: "#38bdf8",
  walking: "#2dd4bf",
  talking: "#fb923c",
  blocked: "#f87171",
};

export default function AgentCharacter({ agent, color, selected, live, gestureRef, toWorld, onSelect, onDragMove, onDrop }: Props) {
  const dragging = useRef(false);

  const drawBody = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      // status ring: thin circle tinted by current status
      g.lineStyle(2, STATUS_DOT[agent.status] ?? "#4ade80", 0.9);
      g.drawCircle(0, 0, 21);
      // selection ring
      if (selected) {
        g.lineStyle(2, 0xffffff, 0.9);
        g.drawCircle(0, 0, 25);
      }
      // shadow
      g.lineStyle(0);
      g.beginFill(0x000000, 0.35);
      g.drawEllipse(0, 20, 16, 6);
      g.endFill();
      // body
      g.lineStyle(3, 0x000000, 0.45);
      g.beginFill(color, 1);
      g.drawCircle(0, 0, 17);
      g.endFill();
      // status dot
      g.lineStyle(2, 0x000000, 0.6);
      g.beginFill(STATUS_DOT[agent.status] ?? "#4ade80", 1);
      g.drawCircle(13, -13, 6);
      g.endFill();
    },
    [color, selected, agent.status]
  );

  // nameplate pill behind the name text (width scales with name length)
  const drawPlate = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const w = Math.max(44, agent.name.length * 8.2 + 16);
      g.beginFill(0x0c0a09, 0.78);
      g.lineStyle(1, live ? 0x4ade80 : 0x000000, live ? 0.9 : 0.4);
      g.drawRoundedRect(-w / 2, 26, w, 18, 9);
      g.endFill();
      if (live) {
        // live dot on the left edge of the nameplate
        g.lineStyle(0);
        g.beginFill(0x4ade80, 1);
        g.drawCircle(-w / 2 + 8, 35, 3.5);
        g.endFill();
      }
    },
    [agent.name, live]
  );

  const drawBubble = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      const w = 150;
      const h = 40;
      g.beginFill(0xffffff, 0.97);
      g.lineStyle(1, 0x000000, 0.25);
      g.drawRoundedRect(-w / 2, -86, w, h, 10);
      g.endFill();
      // tail
      g.beginFill(0xffffff, 0.97);
      g.moveTo(-8, -47);
      g.lineTo(8, -47);
      g.lineTo(0, -36);
      g.lineTo(-8, -47);
      g.endFill();
    },
    []
  );

  const showBubble = agent.bubble && agent.bubbleUntil && agent.bubbleUntil > Date.now();

  return (
    <Container
      x={agent.x}
      y={agent.y}
      interactive
      cursor="pointer"
      pointerdown={(e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        gestureRef.current = "agent";
        dragging.current = true;
        onSelect(agent.id);
      }}
      pointermove={(e: PIXI.FederatedPointerEvent) => {
        if (!dragging.current) return;
        e.stopPropagation();
        const p = toWorld(e.data.global.x, e.data.global.y);
        onDragMove(agent.id, p.x, p.y);
      }}
      pointerup={(e: PIXI.FederatedPointerEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        if (gestureRef.current === "agent") gestureRef.current = null;
        e.stopPropagation();
        const p = toWorld(e.data.global.x, e.data.global.y);
        onDrop(agent.id, p.x, p.y);
      }}
      pointerupoutside={() => {
        dragging.current = false;
        if (gestureRef.current === "agent") gestureRef.current = null;
      }}
    >
      <Graphics draw={drawBody} />
      <Text
        text={agent.avatar}
        x={0}
        y={-1}
        anchor={0.5}
        style={{ fontSize: 18, align: "center" } as unknown as PIXI.TextStyle}
      />
      {/* nameplate pill + name tag */}
      <Graphics draw={drawPlate} />
      <Text
        text={agent.name}
        x={0}
        y={35}
        anchor={0.5}
        style={{ fontSize: 12, fill: "#ffffff", fontWeight: "bold" } as unknown as PIXI.TextStyle}
      />
      {/* role badge */}
      <Text
        text={ROLE_BADGE[agent.role.toLowerCase()] ?? agent.role.slice(0, 3).toUpperCase()}
        x={0}
        y={46}
        anchor={0.5}
        style={{ fontSize: 9, fill: color, fontWeight: "bold", dropShadow: true, dropShadowDistance: 1 } as unknown as PIXI.TextStyle}
      />
      {/* thinking dots */}
      {agent.status === "thinking" && (
        <Text
          text="💭"
          x={20}
          y={-30}
          anchor={0.5}
          style={{ fontSize: 16 } as unknown as PIXI.TextStyle}
        />
      )}
      {agent.status === "blocked" && (
        <Text
          text="⛔"
          x={-22}
          y={-28}
          anchor={0.5}
          style={{ fontSize: 15 } as unknown as PIXI.TextStyle}
        />
      )}
      {/* speech bubble */}
      {showBubble && (
        <Container>
          <Graphics draw={drawBubble} />
          <Text
            text={agent.bubble!.slice(0, 110)}
            x={0}
            y={-66}
            anchor={0.5}
            style={{ fontSize: 11, fill: "#1c1917", wordWrap: true, wordWrapWidth: 136, align: "center" } as unknown as PIXI.TextStyle}
          />
        </Container>
      )}
    </Container>
  );
}
