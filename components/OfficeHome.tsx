"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useOfficeStore, useSettingsStore } from "@/lib/store/useOfficeStore";
import { useOfficeEvents } from "@/hooks/useOfficeEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import Toasts from "@/components/ui/toasts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProjectSwitcher from "@/components/panels/ProjectSwitcher";
import RoomsPanel from "@/components/panels/RoomsPanel";
import GoalInput from "@/components/panels/GoalInput";
import TaskBoard from "@/components/panels/TaskBoard";
import TaskModal from "@/components/panels/TaskModal";
import AgentCard from "@/components/panels/AgentCard";
import OfficePanel from "@/components/panels/OfficePanel";
import HireModal from "@/components/panels/HireModal";
import ActivityFeed from "@/components/panels/ActivityFeed";
import MemoryPanel from "@/components/panels/MemoryPanel";
import UsagePanel from "@/components/panels/UsagePanel";
import ArtifactsPanel from "@/components/panels/ArtifactsPanel";
import BriefPanel from "@/components/panels/BriefPanel";
import WelcomeModal from "@/components/panels/WelcomeModal";
import { isAgentLive } from "@/lib/live-feed";
import { Pause, Play, Settings, Search, Volume2, VolumeX, Download, Plus, Target, ClipboardList } from "lucide-react";

const OfficeCanvas = dynamic(() => import("@/components/office/OfficeCanvas"), { ssr: false });

const STATUS_DOT: Record<string, string> = {
  idle: "bg-emerald-400",
  thinking: "bg-yellow-400",
  working: "bg-sky-400",
  walking: "bg-teal-400",
  talking: "bg-orange-400",
  blocked: "bg-red-400",
};

type Tab = "tasks" | "memory" | "activity" | "usage" | "artifacts" | "brief";

export default function OfficeHome({ projectId }: { projectId?: string }) {
  const seedIfEmpty = useOfficeStore((s) => s.seedIfEmpty);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const projects = useOfficeStore((s) => s.projects);
  const running = useOfficeStore((s) => s.running);
  const [tab, setTab] = useState<Tab>("tasks");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  useEffect(() => {
    if (projectId) useOfficeStore.getState().setActiveProject(projectId);
  }, [projectId]);

  useOfficeEvents(activeProjectId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const project = projects.find((p) => p.id === activeProjectId);
  const cost = useOfficeStore((s) => (s.activeProjectId ? s.costByProject[s.activeProjectId] ?? 0 : 0));

  return (
    <div className="flex h-screen flex-col bg-stone-950 text-stone-200">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-stone-800 bg-stone-900 px-3 shadow-[0_1px_12px_rgba(0,0,0,0.35)]">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-stone-800">
          <span className="text-lg" aria-hidden>🏢</span>
          <span className="hidden text-sm font-bold tracking-tight text-stone-100 lg:inline">Agent Office</span>
        </Link>
        <span className="hidden max-w-44 shrink-0 truncate text-xs text-stone-500 md:inline" title={project?.description}>
          {project ? `${project.icon} ${project.name}` : "…"}
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-stone-800 md:inline" aria-hidden />
        <GoalInput />
        <Button size="sm" variant="outline" title="Open the manager brief" onClick={() => setTab("brief")}>
          <ClipboardList size={14} /> Brief
        </Button>
        <Button
          size="sm"
          variant="secondary"
          title={running ? "Pause simulation (agents freeze)" : "Resume simulation"}
          onClick={() => useOfficeStore.getState().setRunning(!running)}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </Button>
        <ExportReportButton />
        <Link href="/settings" title="Settings">
          <Button size="sm" variant="ghost" aria-label="Settings">
            <Settings size={14} />
          </Button>
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left sidebar */}
        <aside className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-800 bg-stone-900/60 p-2">
          <ProjectSwitcher />
          <ViewsNav go={(t) => setTab(t)} active={tab} />
          <AgentsList />
          <RoomsPanel />
          <div className="mt-auto space-y-1 border-t border-stone-800/70 px-1 pb-1 pt-2">
            <div className="text-[11px] text-stone-500">Session spend: <span className="font-medium text-stone-300">${cost.toFixed(4)}</span></div>
            <SoundToggle />
          </div>
        </aside>

        {/* center canvas */}
        <main className="relative min-w-0 flex-1">
          <OfficeCanvas />
        </main>

        {/* right panel */}
        <aside className="flex w-[340px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-stone-800 bg-stone-900/60 p-2">
          <OfficePanel />
          <AgentCard />
          <Card>
            <CardHeader className="flex flex-row items-center gap-1 py-1.5">
              {(["tasks", "memory", "activity", "usage", "artifacts", "brief"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`rounded-md px-2 py-1 text-xs capitalize transition-colors ${tab === t ? "bg-stone-800 font-medium text-stone-100" : "text-stone-500 hover:text-stone-300"}`}
                >
                  {t}
                </button>
              ))}
            </CardHeader>
            <CardContent>
              {tab === "tasks" && <TaskBoard compact />}
              {tab === "memory" && <MemoryPanel />}
              {tab === "activity" && <ActivityFeed />}
              {tab === "usage" && <UsagePanel />}
              {tab === "artifacts" && <ArtifactsPanel />}
              {tab === "brief" && <BriefPanel />}
            </CardContent>
          </Card>
          <GoalsList />
        </aside>
      </div>

      {/* bottom activity bar */}
      <footer className="flex h-7 shrink-0 items-center border-t border-stone-800 bg-stone-900">
        <ActivityFeed horizontal />
      </footer>

      <SearchPalette open={searchOpen} query={query} setQuery={setQuery} onClose={() => setSearchOpen(false)} />
      <TaskModal />
      <WelcomeModal />
      <Toasts />
    </div>
  );
}

function ExportReportButton() {
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const [busy, setBusy] = useState(false);
  const exportReport = async () => {
    if (!activeProjectId || busy) return;
    setBusy(true);
    try {
      const spend = useOfficeStore.getState().costByProject[activeProjectId] ?? 0;
      const res = await fetch(`/api/report?projectId=${encodeURIComponent(activeProjectId)}&spend=${spend}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project-report.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="ghost" title="Export project report (.md)" onClick={exportReport} disabled={!activeProjectId || busy}>
      <Download size={14} />
    </Button>
  );
}

function ViewsNav({ go, active }: { go: (t: Tab) => void; active: Tab }) {
  return (
    <div>
      <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Views</div>
      <div className="space-y-0.5">
        {(
          [
            { id: "artifacts", label: "Artifacts", icon: "📁" },
            { id: "brief", label: "Manager Brief", icon: "📋" },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            onClick={() => go(v.id)}
            title={`Open ${v.label}`}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
              active === v.id ? "bg-stone-800 text-stone-100" : "text-stone-300 hover:bg-stone-900"
            }`}
          >
            <span aria-hidden>{v.icon}</span>
            <span className="flex-1 truncate">{v.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentsList() {
  const agents = useOfficeStore((s) => s.agents);
  const teams = useOfficeStore((s) => s.teams);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const [hireOpen, setHireOpen] = useState(false);
  const mine = useMemo(() => {
    const teamIds = new Set(teams.filter((t) => t.projectId === activeProjectId).map((t) => t.id));
    return agents.filter((a) => teamIds.has(a.teamId));
  }, [agents, teams, activeProjectId]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Agents · {mine.length}</span>
        <button
          className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-400 hover:bg-stone-800 hover:text-stone-100"
          onClick={() => setHireOpen(true)}
          title="Hire a new agent"
        >
          <Plus size={12} /> Hire
        </button>
      </div>
      <div className="space-y-0.5">
        {mine.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              useOfficeStore.getState().setSelectedAgent(a.id);
              useOfficeStore.getState().flyToAgent(a.id);
            }}
            title={`${a.name} — ${a.role}, ${a.status}`}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
              selectedAgentId === a.id ? "bg-stone-800 text-stone-100" : "text-stone-300 hover:bg-stone-900"
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status] ?? "bg-stone-500"} ${isAgentLive(a.status) ? "animate-pulse" : ""}`} />
            <span aria-hidden>{a.avatar}</span>
            <span className="flex-1 truncate">{a.name}</span>
            <span className="text-[10px] capitalize text-stone-600">{a.role}</span>
          </button>
        ))}
        {mine.length === 0 && (
          <div className="rounded-md border border-dashed border-stone-800 px-2 py-3 text-center">
            <div className="text-xs text-stone-400">No agents on this floor yet</div>
            <button
              className="mt-1 text-[11px] text-amber-500 hover:text-amber-400"
              onClick={() => setHireOpen(true)}
            >
              Hire your first agent
            </button>
          </div>
        )}
      </div>
      <HireModal open={hireOpen} onClose={() => setHireOpen(false)} />
    </div>
  );
}

function GoalsList() {
  const allGoals = useOfficeStore((s) => s.goals);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const goals = useMemo(() => allGoals.filter((g) => g.projectId === activeProjectId), [allGoals, activeProjectId]);
  return (
    <Card>
      <CardHeader className="py-1.5">
        <CardTitle className="flex items-center gap-1.5 text-xs">
          <Target size={12} className="text-stone-500" /> Goals
          {goals.length > 0 && <span className="font-normal text-stone-500">· {goals.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {goals.length === 0 && (
          <div className="py-1 text-xs leading-snug text-stone-500">
            No goals yet. Type one in the top bar and the team will get moving.
          </div>
        )}
        {goals.map((g) => (
          <div key={g.id} className="rounded bg-stone-950/60 px-2 py-1 text-xs text-stone-300">
            <span className="font-medium">{g.title}</span>
            <span className="ml-1.5 text-[10px] capitalize text-stone-500">{g.priority} · {g.status}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SoundToggle() {
  const sound = useSettingsStore((s) => s.sound);
  const setSound = useSettingsStore((s) => s.setSound);
  return (
    <button
      className="flex items-center gap-1.5 rounded px-0.5 py-0.5 text-[11px] text-stone-500 hover:text-stone-300"
      onClick={() => setSound(!sound)}
      aria-pressed={sound}
    >
      {sound ? <Volume2 size={13} /> : <VolumeX size={13} />} {sound ? "Sound on" : "Sound off"}
    </button>
  );
}

function SearchPalette({ open, query, setQuery, onClose }: { open: boolean; query: string; setQuery: (q: string) => void; onClose: () => void }) {
  const agents = useOfficeStore((s) => s.agents);
  const tasks = useOfficeStore((s) => s.tasks);
  const q = query.toLowerCase();
  const agentHits = agents.filter((a) => a.name.toLowerCase().includes(q) || a.role.includes(q)).slice(0, 5);
  const taskHits = tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5);

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <Search size={15} className="shrink-0 text-stone-500" />
        <Input autoFocus placeholder="Search agents, tasks… (⌘K)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {query.trim() === "" && (
          <div className="py-2 text-center text-xs text-stone-600">Start typing to search agents and tasks</div>
        )}
        {agentHits.map((a) => (
          <button
            key={a.id}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-stone-200 hover:bg-stone-800"
            onClick={() => {
              useOfficeStore.getState().setSelectedAgent(a.id);
              useOfficeStore.getState().flyToAgent(a.id);
              onClose();
            }}
          >
            <span aria-hidden>{a.avatar}</span> {a.name} <Badge>{a.role}</Badge>
          </button>
        ))}
        {taskHits.map((t) => (
          <button
            key={t.id}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-stone-200 hover:bg-stone-800"
            onClick={() => {
              useOfficeStore.getState().setSelectedTask(t.id);
              if (t.assigneeAgentId) useOfficeStore.getState().flyToAgent(t.assigneeAgentId);
              onClose();
            }}
          >
            <span className="text-stone-500">▣</span> {t.title} <Badge>{t.status}</Badge>
          </button>
        ))}
        {query.trim() !== "" && agentHits.length === 0 && taskHits.length === 0 && (
          <div className="py-2 text-center text-xs text-stone-600">No matches for “{query.trim()}”</div>
        )}
      </div>
    </Dialog>
  );
}
