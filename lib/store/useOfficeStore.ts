import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "@/lib/utils";
import { pushLiveEntry as appendLiveEntry, type LiveEntry } from "@/lib/live-feed";
import type { WebhookConfig } from "@/lib/integrations";

// ---------- Types (mirror the DB schema, plus live-only fields) ----------

export type AgentStatus = "idle" | "thinking" | "working" | "walking" | "talking" | "blocked";

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  floorNumber: number;
  createdAt: number;
}

export interface Team {
  id: string;
  projectId: string;
  name: string;
  color: string;
  officeId: string | null;
}

export interface Office {
  id: string;
  projectId: string;
  teamId: string | null;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "room" (default) for team offices, "break" for the per-project Break Room lounge. */
  kind?: "room" | "break";
}

export interface Agent {
  id: string;
  teamId: string;
  name: string;
  role: string;
  avatar: string;
  personalityPrompt: string;
  /** "provider:model" ref, or "" to inherit the system default model. */
  model: string;
  /** Home room id; unset agents work from their team office (then the project default). */
  homeOfficeId?: string | null;
  skills: string[];
  status: AgentStatus;
  x: number;
  y: number;
  currentTaskId: string | null;
  // live-only (not persisted):
  targetX?: number;
  targetY?: number;
  bubble?: string | null;
  bubbleUntil?: number;
}

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: number;
}

export interface Task {
  id: string;
  goalId: string;
  projectId: string;
  title: string;
  description: string;
  assigneeAgentId: string | null;
  status: "todo" | "doing" | "review" | "done" | "blocked";
  dependencies: string[];
  artifacts: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Activity {
  id: string;
  projectId: string;
  type: string;
  description: string;
  timestamp: number;
}

export interface ChatMsg {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  content: string;
  timestamp: number;
}

export interface Toast {
  id: string;
  title?: string;
  message: string;
  tone: "info" | "success" | "warning" | "error";
}

export const AGENT_ROLES = ["manager", "developer", "designer", "researcher", "qa", "writer", "marketer"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const TEAM_COLORS = ["#38bdf8", "#fbbf24", "#a78bfa", "#34d399", "#fb7185", "#f472b6", "#4ade80", "#f97316"];

const MANAGER_NAMES = ["Ari", "Noor", "Kai", "Zoe", "Leo", "Mia", "Eli", "Ivy"];
const MANAGER_AVATARS = ["🦊", "🦉", "🐧", "🦜", "🦋", "🐸", "🦄", "🐝"];

/** Parse a comma-separated skills field into a deduped list (max 12). Pure + tested. */
export function parseSkills(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const s = part.trim().replace(/\s+/g, " ");
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 12) break;
  }
  return out;
}

/** Next status in the board cycle. Pure + tested. */
export function nextTaskStatus(s: Task["status"]): Task["status"] {
  switch (s) {
    case "todo":
      return "doing";
    case "doing":
      return "review";
    case "review":
      return "done";
    default:
      return "todo";
  }
}

/**
 * Find a free spawn spot inside an office: first grid slot not within 48px
 * of an existing agent, else a deterministic fallback inside the room.
 * Pure + tested.
 */
export function freeDeskSpot(office: Office, agents: { x: number; y: number }[]): { x: number; y: number } {
  const spots: { x: number; y: number }[] = [];
  const cols = Math.max(2, Math.floor((office.width - 120) / 200));
  const rows = Math.max(1, Math.floor((office.height - 120) / 110));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      spots.push({ x: Math.round(office.x + 90 + c * 200), y: Math.round(office.y + 90 + r * 110) });
    }
  }
  for (const s of spots) {
    if (agents.every((a) => Math.hypot(a.x - s.x, a.y - s.y) > 48)) return s;
  }
  // Room is full: stack near the door side with a deterministic offset.
  const n = agents.length;
  return {
    x: Math.round(office.x + 60 + ((n * 53) % Math.max(1, office.width - 120))),
    y: Math.round(office.y + office.height - 60),
  };
}

/**
 * The project's default office: its first regular (non-break) room.
 * Unassigned agents work from here. Pure + tested.
 */
export function defaultOfficeFor(projectId: string, offices: Office[]): Office | null {
  return offices.find((o) => o.projectId === projectId && o.kind !== "break") ?? null;
}

/**
 * An agent's home office: explicit homeOfficeId first, then the team office
 * (room tagged with the team, or the team's officeId pointer), then the
 * project default office. Break rooms never qualify. Pure + tested.
 */
export function homeOfficeFor(
  agent: { teamId: string; homeOfficeId?: string | null },
  offices: Office[],
  teams?: { id: string; projectId: string; officeId: string | null }[]
): Office | null {
  if (agent.homeOfficeId) {
    const home = offices.find((o) => o.id === agent.homeOfficeId && o.kind !== "break");
    if (home) return home;
  }
  const byTeam = offices.find((o) => o.teamId === agent.teamId && o.kind !== "break");
  if (byTeam) return byTeam;
  const team = teams?.find((t) => t.id === agent.teamId);
  if (team?.officeId) {
    const pointed = offices.find((o) => o.id === team.officeId && o.kind !== "break");
    if (pointed) return pointed;
  }
  if (team) return defaultOfficeFor(team.projectId, offices);
  return null;
}

/**
 * An agent's desk anchor: a free desk inside its home office. The agent's
 * own position is excluded so the anchor is stable when the agent is
 * already seated. Null when the agent has no office. Pure + tested.
 */
export function deskAnchorFor(
  agent: { id: string; teamId: string; homeOfficeId?: string | null },
  offices: Office[],
  agents: { id: string; x: number; y: number }[],
  teams?: { id: string; projectId: string; officeId: string | null }[]
): { x: number; y: number } | null {
  const office = homeOfficeFor(agent, offices, teams);
  if (!office) return null;
  return freeDeskSpot(office, agents.filter((a) => a.id !== agent.id));
}

/**
 * Rehome every agent whose home room was deleted to the fallback office
 * (null when the project has no rooms left). Non-matching agents keep
 * their reference. Pure + tested.
 */
export function rehomeAgentsForRoomDelete<T extends { homeOfficeId?: string | null }>(
  agents: T[],
  deletedOfficeId: string,
  fallbackOfficeId: string | null
): T[] {
  return agents.map((a) => (a.homeOfficeId === deletedOfficeId ? { ...a, homeOfficeId: fallbackOfficeId } : a));
}

/**
 * A free canvas spot for a new room: the next auto-arrange grid slot
 * (2 per row, 460x330 rooms, 40px gaps) that doesn't overlap an existing
 * room, else below everything. Pure + tested.
 */
export function nextRoomSpot(offices: Office[], projectId: string, w = 460, h = 330): { x: number; y: number } {
  const mine = offices.filter((o) => o.projectId === projectId);
  const gap = 40;
  const perRow = 2;
  let i = mine.length;
  for (let tries = 0; tries < 64; tries++, i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 60 + col * (w + gap);
    const y = 60 + row * (h + gap);
    const overlaps = mine.some((o) => x < o.x + o.width && x + w > o.x && y < o.y + o.height && y + h > o.y);
    if (!overlaps) return { x, y };
  }
  const bottom = mine.reduce((m, o) => Math.max(m, o.y + o.height), 0);
  return { x: 60, y: bottom + gap };
}

/** A free lounge spot inside a project's Break Room (null when none exists). Pure + tested. */
export function breakSpotFor(
  projectId: string,
  offices: Office[],
  agents: { id: string; x: number; y: number }[]
): { x: number; y: number } | null {
  const room = offices.find((o) => o.projectId === projectId && o.kind === "break");
  if (!room) return null;
  return freeDeskSpot(room, agents.filter((a) => a.x >= room.x && a.x <= room.x + room.width && a.y >= room.y && a.y <= room.y + room.height));
}

/**
 * Backfill helper: ensure the project has exactly one Break Room.
 * Returns the input array unchanged when one already exists (idempotent:
 * the room id is deterministic per project). Pure + tested.
 */
export function ensureBreakRoom(offices: Office[], projectId: string): Office[] {
  if (offices.some((o) => o.projectId === projectId && o.kind === "break")) return offices;
  const mine = offices.filter((o) => o.projectId === projectId);
  const bottom = mine.reduce((m, o) => Math.max(m, o.y + o.height), 0);
  const room: Office = {
    id: `off_break_${projectId}`,
    projectId,
    teamId: null,
    name: "Break Room",
    x: 60,
    y: mine.length > 0 ? bottom + 40 : 430,
    width: 460,
    height: 260,
    kind: "break",
  };
  return [...offices, room];
}

/**
 * Reset every agent to follow the system default model (blank = inherit).
 * Pure + tested. One click in Settings; per-agent overrides can be re-applied after.
 */
export function resetModelsToDefault(agents: Agent[]): Agent[] {
  return agents.map((a) => (a.model === "" ? a : { ...a, model: "" }));
}

type WorldSlice = Pick<
  OfficeState,
  | "projects" | "teams" | "offices" | "agents" | "goals" | "tasks" | "activities"
  | "activeProjectId" | "selectedAgentId" | "selectedOfficeId" | "selectedTaskId" | "cameraTargetAgentId"
>;

/**
 * Remove a project and everything on its floor: teams, offices, agents,
 * goals, tasks, activities. Clears active/selection pointers when they
 * pointed into the deleted project. Pure + tested.
 */
export function cascadeDeleteProject(state: WorldSlice, projectId: string): WorldSlice {
  const teamIds = new Set(state.teams.filter((t) => t.projectId === projectId).map((t) => t.id));
  const agentIds = new Set(state.agents.filter((a) => teamIds.has(a.teamId)).map((a) => a.id));
  const wasActive = state.activeProjectId === projectId;
  return {
    projects: state.projects.filter((p) => p.id !== projectId),
    teams: state.teams.filter((t) => t.projectId !== projectId),
    offices: state.offices.filter((o) => o.projectId !== projectId),
    agents: state.agents.filter((a) => !teamIds.has(a.teamId)),
    goals: state.goals.filter((g) => g.projectId !== projectId),
    tasks: state.tasks.filter((t) => t.projectId !== projectId),
    activities: state.activities.filter((a) => a.projectId !== projectId),
    activeProjectId: wasActive ? null : state.activeProjectId,
    selectedAgentId: wasActive || (state.selectedAgentId && agentIds.has(state.selectedAgentId)) ? null : state.selectedAgentId,
    selectedOfficeId: wasActive ? null : state.selectedOfficeId,
    selectedTaskId: wasActive ? null : state.selectedTaskId,
    cameraTargetAgentId:
      wasActive || (state.cameraTargetAgentId && agentIds.has(state.cameraTargetAgentId)) ? null : state.cameraTargetAgentId,
  };
}

export interface OfficeState {
  projects: Project[];
  teams: Team[];
  offices: Office[];
  agents: Agent[];
  goals: Goal[];
  tasks: Task[];
  activities: Activity[];
  // short-term memory: last messages per task (cleared when task completes)
  shortTerm: Record<string, ChatMsg[]>;
  costByProject: Record<string, number>;
  addCost: (projectId: string, amount: number) => void;
  // toast stack (live-only: never persisted)
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  // per-agent live thinking feed ring buffer (live-only: never persisted)
  liveFeed: Record<string, LiveEntry[]>;
  pushLiveEntry: (agentId: string, e: LiveEntry) => void;
  // bumps on every api-usage SSE event so the Usage panel refetches (live-only)
  usageVersion: number;
  bumpUsage: () => void;
  // selection & camera
  activeProjectId: string | null;
  selectedAgentId: string | null;
  selectedOfficeId: string | null;
  selectedTaskId: string | null;
  cameraTargetAgentId: string | null;
  running: boolean;

  setActiveProject: (id: string) => void;
  setSelectedAgent: (id: string | null) => void;
  setSelectedOffice: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  flyToAgent: (id: string) => void;
  clearFly: () => void;
  setRunning: (v: boolean) => void;
  upsertProject: (p: Project) => void;
  upsertGoal: (g: Goal) => void;
  upsertTask: (t: Task) => void;
  moveTask: (taskId: string, status: Task["status"]) => void;
  reassignTask: (taskId: string, agentId: string | null) => void;
  setAgentPos: (id: string, x: number, y: number) => void;
  setAgentTarget: (id: string, x: number, y: number) => void;
  clearAgentTarget: (id: string) => void;
  setAgentStatus: (id: string, status: AgentStatus, taskId?: string | null) => void;
  agentSay: (id: string, text: string, ttlMs?: number) => void;
  pushActivity: (a: Activity) => void;
  pushShortTerm: (taskId: string, m: ChatMsg) => void;
  clearShortTerm: (taskId: string) => void;
  moveOffice: (id: string, x: number, y: number) => void;
  addOffice: (o: Office) => void;
  renameOffice: (id: string, name: string) => void;
  /** Delete a room; its agents move home to the project's default office. Break Rooms cannot be deleted. */
  deleteOffice: (id: string) => void;
  moveAgentToTeam: (agentId: string, teamId: string, x: number, y: number, homeOfficeId?: string | null) => void;
  addTeam: (t: Team) => void;
  addAgent: (a: Agent) => void;
  /** Patch an agent's editable fields (name, role, avatar, skills, personality, team, model, home office). */
  updateAgent: (agentId: string, patch: Partial<Pick<Agent, "name" | "role" | "avatar" | "skills" | "personalityPrompt" | "teamId" | "model" | "homeOfficeId">>) => void;
  /** Remove an agent; their open tasks return to todo, unassigned. */
  fireAgent: (agentId: string) => void;
  setAgentModel: (agentId: string, model: string) => void;
  /** One click: every agent follows the system default model (blank = inherit). */
  resetAllAgentsToDefault: () => void;
  /** Create a project that is never empty: project + team + office + manager. Returns the project id. */
  createProject: (name: string, description: string) => string;
  renameProject: (id: string, name: string, description?: string) => void;
  /** Delete a project and everything on its floor (teams, offices, agents, goals, tasks). */
  deleteProject: (id: string) => void;
  autoArrange: () => void;
  seedIfEmpty: () => void;
}

function deskSpots(office: Office, count: number): { x: number; y: number }[] {
  // Desks arranged in two columns inside the room.
  const spots: { x: number; y: number }[] = [];
  const cols = 2;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    spots.push({
      x: office.x + 90 + col * 200,
      y: office.y + 90 + row * 110,
    });
  }
  return spots;
}

function seedData(): Pick<OfficeState, "projects" | "teams" | "offices" | "agents" | "goals" | "tasks" | "activities"> {
  const now = Date.now();
  const project: Project = {
    id: "proj_coffee",
    name: "Coffee Shop Website",
    description: "Landing page + online menu for the downtown coffee shop.",
    icon: "☕",
    floorNumber: 1,
    createdAt: now,
  };
  const officeA: Office = { id: "off_builders", projectId: project.id, teamId: "team_builders", name: "Builders", x: 60, y: 60, width: 460, height: 330 };
  const officeB: Office = { id: "off_story", projectId: project.id, teamId: "team_story", name: "Storytellers", x: 580, y: 60, width: 460, height: 330 };
  const breakRoom: Office = { id: `off_break_${project.id}`, projectId: project.id, teamId: null, name: "Break Room", x: 60, y: 430, width: 460, height: 260, kind: "break" };
  const teams: Team[] = [
    { id: "team_builders", projectId: project.id, name: "Builders", color: "#38bdf8", officeId: officeA.id },
    { id: "team_story", projectId: project.id, name: "Storytellers", color: "#fbbf24", officeId: officeB.id },
  ];
  const spotsA = deskSpots(officeA, 3);
  const spotsB = deskSpots(officeB, 2);
  const agents: Agent[] = [
    {
      id: "agent_maya", teamId: "team_builders", name: "Maya", role: "manager", avatar: "🦊",
      personalityPrompt: "Decisive, warm, keeps the team unblocked.", model: "",
      skills: ["planning", "delegation", "review"], status: "idle", x: spotsA[0].x, y: spotsA[0].y, currentTaskId: null,
    },
    {
      id: "agent_dev", teamId: "team_builders", name: "Devon", role: "developer", avatar: "🐧",
      personalityPrompt: "Pragmatic coder, loves TypeScript and clean APIs.", model: "",
      skills: ["react", "typescript", "api-design"], status: "idle", x: spotsA[1].x, y: spotsA[1].y, currentTaskId: null,
    },
    {
      id: "agent_qa", teamId: "team_builders", name: "Quinn", role: "qa", avatar: "🦉",
      personalityPrompt: "Detail-obsessed perfectionist, finds every edge case.", model: "",
      skills: ["testing", "review", "quality"], status: "idle", x: spotsA[2].x, y: spotsA[2].y, currentTaskId: null,
    },
    {
      id: "agent_wren", teamId: "team_story", name: "Wren", role: "writer", avatar: "🦜",
      personalityPrompt: "Playful wordsmith, writes copy that converts.", model: "",
      skills: ["copy", "docs", "content"], status: "idle", x: spotsB[0].x, y: spotsB[0].y, currentTaskId: null,
    },
    {
      id: "agent_pip", teamId: "team_story", name: "Pip", role: "designer", avatar: "🦋",
      personalityPrompt: "Visual thinker, obsesses over spacing and hierarchy.", model: "",
      skills: ["ui", "ux", "layout", "brand"], status: "idle", x: spotsB[1].x, y: spotsB[1].y, currentTaskId: null,
    },
  ];
  return {
    projects: [project],
    teams,
    offices: [officeA, officeB, breakRoom],
    agents,
    goals: [],
    tasks: [],
    activities: [
      { id: "seed_act", projectId: project.id, type: "system", description: "Welcome to your office! Drop a goal above to get the team moving.", timestamp: now },
    ],
  };
}

export const useOfficeStore = create<OfficeState>()(
  persist(
    (set, get) => ({
      projects: [],
      teams: [],
      offices: [],
      agents: [],
      goals: [],
      tasks: [],
      activities: [],
      shortTerm: {},
      costByProject: {},
      addCost: (projectId, amount) =>
        set((s) => ({ costByProject: { ...s.costByProject, [projectId]: (s.costByProject[projectId] ?? 0) + amount } })),
      toasts: [],
      pushToast: (t) =>
        set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id: uid("toast") }] })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      liveFeed: {},
      pushLiveEntry: (agentId, e) =>
        set((s) => ({ liveFeed: { ...s.liveFeed, [agentId]: appendLiveEntry(s.liveFeed[agentId] ?? [], e) } })),
      usageVersion: 0,
      bumpUsage: () => set((s) => ({ usageVersion: s.usageVersion + 1 })),
      activeProjectId: null,
      selectedAgentId: null,
      selectedOfficeId: null,
      selectedTaskId: null,
      cameraTargetAgentId: null,
      running: true,

      setActiveProject: (id) => set({ activeProjectId: id, selectedAgentId: null, selectedOfficeId: null, selectedTaskId: null }),
      setSelectedAgent: (id) => set({ selectedAgentId: id }),
      setSelectedOffice: (id) => set({ selectedOfficeId: id }),
      setSelectedTask: (id) => set({ selectedTaskId: id }),
      flyToAgent: (id) => set({ cameraTargetAgentId: id }),
      clearFly: () => set({ cameraTargetAgentId: null }),
      setRunning: (v) => set({ running: v }),

      upsertProject: (p) =>
        set((s) => ({ projects: s.projects.some((x) => x.id === p.id) ? s.projects.map((x) => (x.id === p.id ? p : x)) : [...s.projects, p] })),
      upsertGoal: (g) =>
        set((s) => ({ goals: s.goals.some((x) => x.id === g.id) ? s.goals.map((x) => (x.id === g.id ? { ...x, ...g } : x)) : [...s.goals, g] })),
      upsertTask: (t) =>
        set((s) => ({ tasks: s.tasks.some((x) => x.id === t.id) ? s.tasks.map((x) => (x.id === t.id ? { ...x, ...t } : x)) : [...s.tasks, t] })),
      moveTask: (taskId, status) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t)) })),
      reassignTask: (taskId, agentId) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, assigneeAgentId: agentId, updatedAt: Date.now() } : t)) })),

      setAgentPos: (id, x, y) => set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, x, y } : a)) })),
      setAgentTarget: (id, x, y) =>
        set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, targetX: x, targetY: y, status: "walking" as AgentStatus } : a)) })),
      clearAgentTarget: (id) =>
        set((s) => ({
          agents: s.agents.map((a) => {
            if (a.id !== id) return a;
            const next = { ...a } as Partial<Agent>;
            delete next.targetX;
            delete next.targetY;
            return next as Agent;
          }),
        })),
      setAgentStatus: (id, status, taskId) =>
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === id ? { ...a, status, currentTaskId: taskId !== undefined ? taskId : a.currentTaskId } : a
          ),
        })),
      agentSay: (id, text, ttlMs = 6000) =>
        set((s) => ({
          agents: s.agents.map((a) => (a.id === id ? { ...a, bubble: text, bubbleUntil: Date.now() + ttlMs } : a)),
        })),
      pushActivity: (a) => set((s) => ({ activities: [...s.activities.slice(-199), a] })),
      pushShortTerm: (taskId, m) =>
        set((s) => ({ shortTerm: { ...s.shortTerm, [taskId]: [...(s.shortTerm[taskId] ?? []), m].slice(-20) } })),
      clearShortTerm: (taskId) =>
        set((s) => {
          const next = { ...s.shortTerm };
          delete next[taskId];
          return { shortTerm: next };
        }),
      moveOffice: (id, x, y) => set((s) => ({ offices: s.offices.map((o) => (o.id === id ? { ...o, x, y } : o)) })),
      addOffice: (o) => set((s) => ({ offices: [...s.offices, o] })),
      renameOffice: (id, name) =>
        set((s) => ({ offices: s.offices.map((o) => (o.id === id ? { ...o, name } : o)) })),
      deleteOffice: (id) => {
        const s = get();
        const doomed = s.offices.find((o) => o.id === id);
        if (!doomed || doomed.kind === "break") return;
        const rest = s.offices.filter((o) => o.id !== id);
        const fallback = defaultOfficeFor(doomed.projectId, rest);
        const fallbackId = fallback?.id ?? null;
        const inside = (a: { x: number; y: number }) =>
          a.x >= doomed.x && a.x <= doomed.x + doomed.width && a.y >= doomed.y && a.y <= doomed.y + doomed.height;
        // Agents standing in the deleted room walk home to a free desk in the fallback.
        const placed: { x: number; y: number }[] = fallback
          ? s.agents.filter((a) => !inside(a)).map((a) => ({ x: a.x, y: a.y }))
          : [];
        const agents = rehomeAgentsForRoomDelete(s.agents, id, fallbackId).map((a) => {
          if (!inside(a) || !fallback) return a;
          const spot = freeDeskSpot(fallback, placed);
          placed.push(spot);
          return { ...a, x: spot.x, y: spot.y, targetX: undefined, targetY: undefined };
        });
        set({
          offices: rest,
          agents,
          teams: s.teams.map((t) => (t.officeId === id ? { ...t, officeId: fallbackId } : t)),
          selectedOfficeId: s.selectedOfficeId === id ? null : s.selectedOfficeId,
        });
      },
      moveAgentToTeam: (agentId, teamId, x, y, homeOfficeId) =>
        set((s) => ({
          agents: s.agents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  teamId,
                  x,
                  y,
                  ...(homeOfficeId !== undefined ? { homeOfficeId } : {}),
                  targetX: undefined,
                  targetY: undefined,
                  status: "idle" as AgentStatus,
                }
              : a
          ),
        })),
      addTeam: (t) => set((s) => ({ teams: s.teams.some((x) => x.id === t.id) ? s.teams : [...s.teams, t] })),
      addAgent: (a) => set((s) => ({ agents: s.agents.some((x) => x.id === a.id) ? s.agents : [...s.agents, a] })),
      updateAgent: (agentId, patch) =>
        set((s) => ({ agents: s.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)) })),
      resetAllAgentsToDefault: () => set((s) => ({ agents: resetModelsToDefault(s.agents) })),
      fireAgent: (agentId) =>
        set((s) => ({
          agents: s.agents.filter((a) => a.id !== agentId),
          tasks: s.tasks.map((t) =>
            t.assigneeAgentId === agentId && t.status !== "done"
              ? { ...t, assigneeAgentId: null, status: "todo" as const, updatedAt: Date.now() }
              : t
          ),
          selectedAgentId: s.selectedAgentId === agentId ? null : s.selectedAgentId,
          cameraTargetAgentId: s.cameraTargetAgentId === agentId ? null : s.cameraTargetAgentId,
        })),
      setAgentModel: (agentId, model) =>
        set((s) => ({ agents: s.agents.map((a) => (a.id === agentId ? { ...a, model } : a)) })),
      createProject: (name, description) => {
        const s = get();
        const floor = s.projects.length === 0 ? 1 : Math.max(...s.projects.map((p) => p.floorNumber)) + 1;
        const now = Date.now();
        const projectId = uid("proj");
        const teamId = uid("team");
        const officeId = uid("off");
        const managerId = uid("agent");
        const project: Project = { id: projectId, name: name.trim(), description: description.trim(), icon: "🏢", floorNumber: floor, createdAt: now };
        const team: Team = { id: teamId, projectId, name: "Core Team", color: TEAM_COLORS[(floor - 1) % TEAM_COLORS.length], officeId };
        const office: Office = { id: officeId, projectId, teamId, name: "Main Room", x: 60, y: 60, width: 460, height: 330 };
        const lounge: Office = { id: `off_break_${projectId}`, projectId, teamId: null, name: "Break Room", x: 60, y: 430, width: 460, height: 260, kind: "break" };
        const spot = freeDeskSpot(office, []);
        const manager: Agent = {
          id: managerId,
          teamId,
          name: MANAGER_NAMES[(floor - 1) % MANAGER_NAMES.length],
          role: "manager",
          avatar: MANAGER_AVATARS[(floor - 1) % MANAGER_AVATARS.length],
          personalityPrompt: "Decisive, warm, keeps the team unblocked.",
          model: "",
          skills: ["planning", "delegation", "review"],
          status: "idle",
          x: spot.x,
          y: spot.y,
          currentTaskId: null,
        };
        set((st) => ({
          projects: [...st.projects, project],
          teams: [...st.teams, team],
          offices: [...st.offices, office, lounge],
          agents: [...st.agents, manager],
          activities: [
            ...st.activities.slice(-199),
            { id: uid("act"), projectId, type: "system", description: `${manager.name} joined as manager of ${project.name}.`, timestamp: now },
          ],
          activeProjectId: projectId,
          selectedAgentId: null,
          selectedOfficeId: null,
          selectedTaskId: null,
        }));
        return projectId;
      },
      renameProject: (id, name, description) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name, description: description?.trim() ?? p.description } : p
          ),
        })),
      deleteProject: (id) => set((s) => cascadeDeleteProject(s, id)),
      autoArrange: () => {
        const { offices, activeProjectId } = get();
        const mine = offices.filter((o) => o.projectId === activeProjectId);
        const gap = 40;
        const perRow = 2;
        const w = 460;
        mine.forEach((o, i) => {
          const col = i % perRow;
          const row = Math.floor(i / perRow);
          get().moveOffice(o.id, 60 + col * (w + gap), 60 + row * (330 + gap));
        });
      },
      seedIfEmpty: () => {
        const { projects, offices } = get();
        if (projects.length === 0) {
          const seed = seedData();
          set({ ...seed, activeProjectId: seed.projects[0].id });
          return;
        }
        // Backfill: saves created before Break Rooms existed get one per project.
        let next = offices;
        for (const p of projects) next = ensureBreakRoom(next, p.id);
        if (next !== offices) set({ offices: next });
      },
    }),
    {
      name: "agent-office-store",
      // Live-only fields are stripped so reloads don't resurrect stale bubbles/targets.
      partialize: (s) => ({
        projects: s.projects,
        teams: s.teams,
        offices: s.offices,
        agents: s.agents.map(({ targetX, targetY, bubble, bubbleUntil, ...a }) => ({ ...a, status: "idle" as AgentStatus })),
        goals: s.goals,
        tasks: s.tasks,
        activities: s.activities.slice(-100),
        shortTerm: {},
        costByProject: s.costByProject,
        activeProjectId: s.activeProjectId,
        selectedAgentId: null,
        selectedOfficeId: null,
        selectedTaskId: null,
        cameraTargetAgentId: null,
        running: true,
      }),
    }
  )
);

/** Persisted API keys + model prefs live outside the office store. */
interface SettingsState {
  keys: Record<string, string>;
  defaultModel: string;
  demoMode: boolean;
  sound: boolean;
  /** First-run onboarding completed (welcome tour). */
  onboarded: boolean;
  /** User-defined webhook integrations (browser-only; sent per-request, never stored server-side). */
  webhooks: WebhookConfig[];
  setKey: (provider: string, value: string) => void;
  setDefaultModel: (m: string) => void;
  setDemoMode: (v: boolean) => void;
  setSound: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  addWebhook: () => void;
  updateWebhook: (index: number, patch: Partial<WebhookConfig>) => void;
  removeWebhook: (index: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      keys: {},
      defaultModel: "openai:gpt-4o-mini",
      demoMode: true,
      sound: false,
      onboarded: false,
      webhooks: [],
      setKey: (provider, value) => set((s) => ({ keys: { ...s.keys, [provider]: value } })),
      setDefaultModel: (m) => set({ defaultModel: m }),
      setDemoMode: (v) => set({ demoMode: v }),
      setSound: (v) => set({ sound: v }),
      setOnboarded: (v) => set({ onboarded: v }),
      addWebhook: () => set((s) => ({ webhooks: [...s.webhooks, { name: "", url: "", secret: "" }] })),
      updateWebhook: (index, patch) =>
        set((s) => ({ webhooks: s.webhooks.map((w, i) => (i === index ? { ...w, ...patch } : w)) })),
      removeWebhook: (index) => set((s) => ({ webhooks: s.webhooks.filter((_, i) => i !== index) })),
    }),
    { name: "agent-office-settings" }
  )
);
