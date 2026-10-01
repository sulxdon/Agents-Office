"use client";

import { useCallback, useRef } from "react";
import { Container, Graphics, Text } from "@pixi/react";
import type * as PIXI from "pixi.js";
import type { Office } from "@/lib/store/useOfficeStore";
import { DOOR_WIDTH } from "./Pathfinding";

interface Props {
  office: Office;
  color: string;
  selected: boolean;
  /** Shared canvas gesture lock: room drags claim "room" so pans stay exclusive. */
  gestureRef: { current: null | "pan" | "room" | "agent" };
  toWorld: (sx: number, sy: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onRename: (id: string) => void;
}

// Desk grid must match freeDeskSpot()/deskSpots() spawn math in the store.
const DESK_COLS = 2;
const DESK_ROWS = 2;
const DESK_DX = 200;
const DESK_DY = 110;
const DESK_OX = 90;
const DESK_OY = 90;

export default function OfficeRoom({ office, color, selected, gestureRef, toWorld, onSelect, onMove, onRename }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const { x, y, width: w, height: h } = office;
  const isBreak = office.kind === "break";

  // One static Graphics node: redraws only when size/team/selection changes,
  // so the 60fps ticker never pays for room decor.
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      // floor (break rooms get a warmer lounge tint)
      g.lineStyle(selected ? 3 : 2, selected ? 0xffffff : color, selected ? 1 : 0.8);
      g.beginFill(isBreak ? 0x2b1c10 : 0x201a15, 1);
      g.drawRoundedRect(0, 0, w, h, 12);
      g.endFill();
      // warm floor tint
      g.beginFill(color, 0.07);
      g.drawRoundedRect(0, 0, w, h, 12);
      g.endFill();
      // floor variation: subtle plank seams
      g.lineStyle(1, 0x000000, 0.22);
      for (let py = 36; py < h - 10; py += 36) {
        g.moveTo(8, py).lineTo(w - 8, py);
      }
      // walls: top + sides full, bottom split by door
      const doorX0 = w / 2 - DOOR_WIDTH / 2;
      const doorX1 = w / 2 + DOOR_WIDTH / 2;
      g.lineStyle(8, 0x0c0a09, 1);
      g.moveTo(0, 0).lineTo(w, 0); // top
      g.moveTo(0, 0).lineTo(0, h); // left
      g.moveTo(w, 0).lineTo(w, h); // right
      g.moveTo(0, h).lineTo(doorX0, h); // bottom-left
      g.moveTo(doorX1, h).lineTo(w, h); // bottom-right
      // wall trim: warm inner highlight just inside the walls
      g.lineStyle(2, 0xa16207, 0.35);
      g.moveTo(6, 6).lineTo(w - 6, 6);
      g.moveTo(6, 6).lineTo(6, h - 6);
      g.moveTo(w - 6, 6).lineTo(w - 6, h - 6);
      g.moveTo(6, h - 6).lineTo(doorX0, h - 6);
      g.moveTo(doorX1, h - 6).lineTo(w - 6, h - 6);
      // door mat (outside the door) + inner threshold strip
      g.lineStyle(0);
      g.beginFill(0x78716c, 0.85);
      g.drawRoundedRect(doorX0 + 6, h + 2, DOOR_WIDTH - 12, 14, 4);
      g.endFill();
      g.lineStyle(1, 0x44403c, 0.9);
      g.moveTo(doorX0 + 12, h + 9).lineTo(doorX1 - 12, h + 9);
      g.lineStyle(0);
      g.beginFill(0x44403c, 0.9);
      g.drawRoundedRect(doorX0 + 4, h - 10, DOOR_WIDTH - 8, 6, 3);
      g.endFill();

      // rug under the meeting corner
      const mx = w - 90;
      const my = h - 62;
      g.lineStyle(0);
      g.beginFill(color, 0.16);
      g.drawEllipse(mx, my, 72, 44);
      g.endFill();
      g.lineStyle(2, color, 0.35);
      g.drawEllipse(mx, my, 64, 37);

      // desks: aligned workstations with monitor, keyboard, chair
      // (break rooms get lounge furniture instead — no desks to anchor to)
      if (isBreak) {
        // central lounge rug
        g.lineStyle(0);
        g.beginFill(color, 0.14);
        g.drawEllipse(w / 2, h / 2 + 10, 130, 80);
        g.endFill();
        g.lineStyle(2, color, 0.4);
        g.drawEllipse(w / 2, h / 2 + 10, 118, 71);
        // sofa along the top of the rug
        const sofaY = h / 2 - 34;
        g.lineStyle(1, 0x000000, 0.5);
        g.beginFill(0x9a3412, 1);
        g.drawRoundedRect(w / 2 - 70, sofaY, 140, 30, 10);
        g.endFill();
        g.beginFill(0xc2410c, 1);
        g.drawRoundedRect(w / 2 - 64, sofaY + 4, 58, 18, 8);
        g.drawRoundedRect(w / 2 + 6, sofaY + 4, 58, 18, 8);
        g.endFill();
        // coffee table + stools
        g.lineStyle(1, 0x000000, 0.4);
        g.beginFill(0x57534e, 1);
        g.drawEllipse(w / 2, h / 2 + 34, 44, 22);
        g.endFill();
        g.lineStyle(0);
        g.beginFill(0x78716c, 1);
        g.drawEllipse(w / 2, h / 2 + 31, 37, 17);
        g.endFill();
        for (const sx of [w / 2 - 78, w / 2 + 78]) {
          g.lineStyle(1, 0x000000, 0.5);
          g.beginFill(0x44403c, 1);
          g.drawCircle(sx, h / 2 + 36, 10);
          g.endFill();
        }
      } else {
        for (let c = 0; c < DESK_COLS; c++) {
          for (let r = 0; r < DESK_ROWS; r++) {
            const dx = DESK_OX + c * DESK_DX;
            const dy = DESK_OY + r * DESK_DY;
            if (dx + 40 > w - 8 || dy + 44 > h - 8) continue; // small custom rooms: skip overflow desks
            // chair (below desk, centered)
            g.lineStyle(1, 0x000000, 0.5);
            g.beginFill(0x44403c, 1);
            g.drawCircle(dx, dy + 34, 8);
            g.endFill();
            g.beginFill(0x57534e, 1);
            g.drawCircle(dx, dy + 34, 4);
            g.endFill();
            // desk top
            g.lineStyle(1, 0x000000, 0.5);
            g.beginFill(0x8b5e34, 1);
            g.drawRoundedRect(dx - 34, dy - 14, 68, 34, 6);
            g.endFill();
            // keyboard strip
            g.lineStyle(0);
            g.beginFill(0x1c1917, 0.85);
            g.drawRoundedRect(dx - 20, dy + 4, 40, 8, 2);
            g.endFill();
            // monitor stand + glow screen
            g.beginFill(0x292524, 1);
            g.drawRect(dx - 3, dy - 16, 6, 4);
            g.endFill();
            g.lineStyle(1, 0x000000, 0.6);
            g.beginFill(0x38bdf8, 0.85);
            g.drawRoundedRect(dx - 16, dy - 32, 32, 16, 3);
            g.endFill();
            g.lineStyle(0);
            g.beginFill(0xe0f2fe, 0.5);
            g.drawRect(dx - 12, dy - 29, 10, 3);
            g.endFill();
          }
        }
      }
      // meeting table on the rug
      g.lineStyle(1, 0x000000, 0.4);
      g.beginFill(0x57534e, 1);
      g.drawEllipse(mx, my, 52, 28);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0x78716c, 1);
      g.drawEllipse(mx, my - 3, 44, 22);
      g.endFill();
      // whiteboard (top wall, right of center)
      g.lineStyle(2, 0x44403c, 1);
      g.beginFill(0xf5f5f4, 1);
      g.drawRoundedRect(w / 2 + 40, 12, 110, 44, 4);
      g.endFill();
      g.lineStyle(1, 0x38bdf8, 0.9);
      g.moveTo(w / 2 + 52, 26).lineTo(w / 2 + 120, 26);
      g.moveTo(w / 2 + 52, 36).lineTo(w / 2 + 100, 36);
      // shelf (top-left corner)
      g.lineStyle(1, 0x000000, 0.5);
      g.beginFill(0x78350f, 1);
      g.drawRoundedRect(14, 34, 64, 10, 2);
      g.endFill();
      g.beginFill(0x38bdf8, 0.9);
      g.drawRect(20, 20, 8, 14);
      g.endFill();
      g.beginFill(0x4ade80, 0.9);
      g.drawRect(31, 23, 8, 11);
      g.endFill();
      g.beginFill(0xfbbf24, 0.9);
      g.drawRect(42, 21, 8, 13);
      g.endFill();
      // plants (bottom corners)
      for (const px of [30, w - 30]) {
        const py = h - 34;
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
      }
    },
    [w, h, color, selected, isBreak]
  );

  return (
    <Container
      x={x}
      y={y}
      interactive
      cursor="grab"
      pointerdown={(e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        gestureRef.current = "room";
        onSelect(office.id);
        const p = toWorld(e.data.global.x, e.data.global.y);
        drag.current = { dx: p.x - x, dy: p.y - y };
      }}
      pointermove={(e: PIXI.FederatedPointerEvent) => {
        if (!drag.current) return;
        e.stopPropagation();
        const p = toWorld(e.data.global.x, e.data.global.y);
        onMove(office.id, Math.round(p.x - drag.current.dx), Math.round(p.y - drag.current.dy));
      }}
      pointerup={(e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        drag.current = null;
        if (gestureRef.current === "room") gestureRef.current = null;
      }}
      pointerupoutside={() => {
        drag.current = null;
        if (gestureRef.current === "room") gestureRef.current = null;
      }}
      rightclick={(e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        onRename(office.id);
      }}
    >
      <Graphics draw={draw} />
      <Text
        text={office.name}
        x={16}
        y={10}
        style={{ fontSize: 15, fill: "#ffffff", fontWeight: "bold", dropShadow: true, dropShadowDistance: 1 } as unknown as PIXI.TextStyle}
      />
      {isBreak && (
        <Text
          text="☕ BREAK"
          x={16}
          y={32}
          style={{ fontSize: 11, fill: "#fdba74", fontWeight: "bold" } as unknown as PIXI.TextStyle}
        />
      )}
    </Container>
  );
}
