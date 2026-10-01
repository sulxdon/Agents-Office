"use client";

import { useEffect, useRef } from "react";
import { breakSpotFor, deskAnchorFor, useOfficeStore, useSettingsStore, type Activity, type Goal, type Task } from "@/lib/store/useOfficeStore";
import { pathQueues } from "@/components/office/Pathfinding";
import type { OfficeEvent } from "@/lib/sse-bus";
import { blip, celebrate } from "@/lib/sound";

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    goalId: row.goalId as string,
    projectId: row.projectId as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    assigneeAgentId: (row.assigneeAgentId as string) ?? null,
    status: row.status as Task["status"],
    dependencies: safeArr(row.dependencies),
    artifacts: safeArr(row.artifacts),
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  };
}

function safeArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Subscribes to the SSE stream and applies events to the Zustand store. */
export function useOfficeEvents(projectId: string | null) {
  const seen = useRef(new Set<string>());
  const lastTs = useRef(0);

  useEffect(() => {
    if (!projectId) return;
    const handle = (ev: OfficeEvent) => {
      if (!ev || !ev.id) return;
      if (seen.current.has(ev.id)) return;
      seen.current.add(ev.id);
      if (seen.current.size > 1000) seen.current.clear();
      if (typeof ev.timestamp === "number" && ev.timestamp > lastTs.current) lastTs.current = ev.timestamp;
      applyEvent(ev);
    };
    const es = new EventSource(`/api/events?projectId=${encodeURIComponent(projectId)}`);

    es.onmessage = (msg) => {
      try {
        handle(JSON.parse(msg.data) as OfficeEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.onerror = () => {
      /* EventSource auto-reconnects; the poller below backfills gaps */
    };
    // Poll reconciliation: backfill anything the stream missed (drops,
    // restarts, reconnects). Deduped by id, so overlap with SSE is harmless.
    const poll = async () => {
      try {
        const res = await fetch(`/api/events/poll?projectId=${encodeURIComponent(projectId)}&since=${lastTs.current}`);
        if (!res.ok) return;
        const data = (await res.json()) as { events?: OfficeEvent[] };
        for (const ev of data.events ?? []) handle(ev);
      } catch {
        /* offline — SSE fast path still works */
      }
    };
    const timer = setInterval(poll, 2500);
    void poll();
    return () => {
      clearInterval(timer);
      es.close();
    };
  }, [projectId]);
}

function applyEvent(ev: OfficeEvent) {
  const s = useOfficeStore.getState();
  const sound = useSettingsStore.getState().sound;
  const p = ev.payload;

  switch (ev.kind) {
    case "activity": {
      const a = p.activity as Activity;
      if (a) s.pushActivity(a);
      const cost = p.cost as number | undefined;
      if (typeof cost === "number" && cost > 0) s.addCost(ev.projectId, cost);
      if (sound) blip(520, 60);
      break;
    }
    case "agent-status": {
      const { agentId, status, currentTaskId } = p as { agentId: string; status: Parameters<typeof s.setAgentStatus>[1]; currentTaskId: string | null };
      const ag = s.agents.find((x) => x.id === agentId);
      if (ag && (status === "working" || status === "thinking")) {
        // work start: seat the agent at its desk anchor (retarget wins over
        // any in-flight stroll so the latest real event always wins)
        const anchor = deskAnchorFor(ag, s.offices, s.agents, s.teams);
        if (anchor && Math.hypot(ag.x - anchor.x, ag.y - anchor.y) > 24) {
          pathQueues.delete(agentId);
          s.setAgentTarget(agentId, anchor.x, anchor.y);
        }
      } else if (ag && status === "idle" && (currentTaskId === null || currentTaskId === undefined)) {
        // genuine downtime: walk to the project's Break Room lounge
        const team = s.teams.find((t) => t.id === ag.teamId);
        const spot = breakSpotFor(team?.projectId ?? ev.projectId, s.offices, s.agents);
        const room = s.offices.find((o) => o.projectId === (team?.projectId ?? ev.projectId) && o.kind === "break");
        const inside = room != null && ag.x >= room.x && ag.x <= room.x + room.width && ag.y >= room.y && ag.y <= room.y + room.height;
        if (room && spot && !inside) {
          pathQueues.delete(agentId);
          // route first, then mark idle: the ticker walks status-agnostic
          // targets and the agent arrives already idle
          s.setAgentTarget(agentId, spot.x, spot.y);
        }
      }
      s.setAgentStatus(agentId, status, currentTaskId);
      break;
    }
    case "agent-move": {
      const { agentId, x, y } = p as { agentId: string; x: number; y: number };
      pathQueues.delete(agentId); // drop any stale route so the new target wins
      s.setAgentTarget(agentId, x, y);
      break;
    }
    case "agent-say": {
      const { agentId, text } = p as { agentId: string; text: string };
      s.agentSay(agentId, text);
      if (sound) blip(740, 50);
      break;
    }
    case "agent-thought": {
      const { agentId, text, taskId } = p as { agentId: string; text: string; taskId?: string | null };
      if (agentId && text) {
        s.pushLiveEntry(agentId, { id: ev.id, kind: "thought", text, timestamp: ev.timestamp, taskId: taskId ?? null });
      }
      break;
    }
    case "agent-tool": {
      const { agentId, tool, phase, summary, taskId } = p as {
        agentId: string;
        tool: string;
        phase: "start" | "done";
        summary: string;
        taskId?: string | null;
      };
      if (agentId && tool) {
        s.pushLiveEntry(agentId, {
          id: ev.id,
          kind: "tool",
          text: summary ?? "",
          toolName: tool,
          phase: phase === "done" ? "done" : "start",
          timestamp: ev.timestamp,
          taskId: taskId ?? null,
        });
      }
      break;
    }
    case "api-usage": {
      s.bumpUsage();
      break;
    }
    case "task-update": {
      const task = rowToTask(p.task as Record<string, unknown>);
      const prev = s.tasks.find((t) => t.id === task.id);
      s.upsertTask(task);
      if (task.status === "review" && prev?.status !== "review" && task.assigneeAgentId) {
        s.agentSay(task.assigneeAgentId, "Ready for review 👀");
      }
      if (task.status === "done" && prev?.status !== "done") {
        s.clearShortTerm(task.id);
        if (task.assigneeAgentId) s.agentSay(task.assigneeAgentId, "🎉 Done!");
        if (sound) celebrate();
      }
      break;
    }
    case "goal-update": {
      const { goalId, status } = p as { goalId: string; status: string };
      const g = s.goals.find((x) => x.id === goalId);
      if (g) s.upsertGoal({ ...g, status });
      break;
    }
    case "project-update": {
      const proj = p.project as Parameters<typeof s.upsertProject>[0];
      if (proj) s.upsertProject(proj);
      break;
    }
    case "toast": {
      const { title, message, tone } = p as { title?: string; message?: string; tone?: "info" | "success" | "warning" | "error" };
      if (message) {
        s.pushActivity({ id: `toast_${Date.now()}`, projectId: ev.projectId, type: "toast", description: message, timestamp: Date.now() });
        s.pushToast({ title, message, tone: tone ?? "info" });
      }
      break;
    }
  }
}

export type { Goal };
