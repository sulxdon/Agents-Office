"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOfficeStore, useSettingsStore } from "@/lib/store/useOfficeStore";
import ModelPicker from "@/components/ui/model-picker";
import { buildKeysHeader, resolveAgentModel } from "@/lib/llm-provider";
import { activeWebhooks } from "@/lib/integrations";
import { isAgentLive } from "@/lib/live-feed";
import { timeStr, uid } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Send, LocateFixed, UserMinus, Pencil } from "lucide-react";
import HireModal from "@/components/panels/HireModal";

export default function AgentCard() {
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const agent = useOfficeStore((s) => s.agents.find((a) => a.id === s.selectedAgentId));
  const allTasks = useOfficeStore((s) => s.tasks);
  const teams = useOfficeStore((s) => s.teams);
  const shortTermMap = useOfficeStore((s) => s.shortTerm);
  const tasks = useMemo(
    () => allTasks.filter((t) => t.assigneeAgentId === selectedAgentId && t.status !== "done"),
    [allTasks, selectedAgentId]
  );
  const shortTerm = useMemo(
    () => (selectedAgentId ? shortTermMap[`chat_${selectedAgentId}`] ?? [] : []),
    [shortTermMap, selectedAgentId]
  );
  const liveFeedMap = useOfficeStore((s) => s.liveFeed);
  const liveEntries = useMemo(
    () => (selectedAgentId ? liveFeedMap[selectedAgentId] ?? [] : []),
    [liveFeedMap, selectedAgentId]
  );
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmFire, setConfirmFire] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedTab, setFeedTab] = useState<"chat" | "live">("chat");
  const liveRef = useRef<HTMLDivElement>(null);
  const defaultModel = useSettingsStore((s) => s.defaultModel);

  // auto-scroll the live feed to the newest entry
  useEffect(() => {
    const el = liveRef.current;
    if (el && feedTab === "live") el.scrollTop = el.scrollHeight;
  }, [liveEntries, feedTab]);

  if (!agent) return null;
  const team = teams.find((t) => t.id === agent.teamId);

  const send = async () => {
    if (!msg.trim() || busy) return;
    const s = useOfficeStore.getState();
    const settings = useSettingsStore.getState();
    const text = msg.trim();
    setMsg("");
    setBusy(true);
    s.pushShortTerm(`chat_${agent.id}`, { id: uid("m"), role: "user", content: text, timestamp: Date.now() });
    try {
      const webhooks = activeWebhooks(settings.webhooks);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(Object.keys(settings.keys).length || webhooks.length
            ? { "x-llm-keys": buildKeysHeader(settings.keys, webhooks) }
            : {}),
        },
        body: JSON.stringify({
          agentId: agent.id,
          projectId: s.activeProjectId,
          message: text,
          model: resolveAgentModel(agent.model, settings.defaultModel),
          demoMode: settings.demoMode,
        }),
      });
      const data = await res.json();
      s.pushShortTerm(`chat_${agent.id}`, { id: uid("m"), role: "agent", agentId: agent.id, content: data.reply ?? "(no reply)", timestamp: Date.now() });
      if (typeof data.cost === "number" && data.cost > 0 && s.activeProjectId) s.addCost(s.activeProjectId, data.cost);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-2">
        <CardTitle className="flex items-center gap-1.5">
          {isAgentLive(agent.status) && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" title="Working now" aria-label="Working now" />
          )}
          <span>{agent.avatar} {agent.name} <span className="font-normal text-stone-500">· {agent.role}</span></span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <button
            title="Fly camera to agent"
            className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-amber-400"
            onClick={() => useOfficeStore.getState().flyToAgent(agent.id)}
          >
            <LocateFixed size={14} />
          </button>
          <button
            className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
            onClick={() => useOfficeStore.getState().setSelectedAgent(null)}
          >
            <X size={14} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-2">
        <div className="flex flex-wrap gap-1">
          <Badge>{agent.status}</Badge>
          {team && <Badge style={{ borderColor: team.color }}>{team.name}</Badge>}
          {agent.skills.map((sk) => (
            <Badge key={sk}>{sk}</Badge>
          ))}
        </div>
        {agent.currentTaskId || tasks.length > 0 ? (
          <div className="text-xs text-stone-400">
            <span className="font-semibold text-stone-300">Working on: </span>
            {tasks[0]?.title ?? "…"}
          </div>
        ) : (
          <div className="text-xs text-stone-500">Idle — waiting for work.</div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-stone-500">Model:</span>
          <ModelPicker
            small
            allowDefault
            defaultHint={defaultModel}
            value={agent.model || ""}
            onChange={(ref) => useOfficeStore.getState().setAgentModel(agent.id, ref)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-200"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} /> Edit agent
          </button>
          {confirmFire ? (
            <>
              <span className="flex-1 text-right text-[11px] text-red-400">Fire {agent.name}?</span>
              <Button size="sm" variant="destructive" onClick={() => useOfficeStore.getState().fireAgent(agent.id)}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmFire(false)}>Keep</Button>
            </>
          ) : (
            <button
              className="ml-auto flex items-center gap-1 text-[11px] text-stone-500 hover:text-red-400"
              onClick={() => setConfirmFire(true)}
            >
              <UserMinus size={13} /> Fire
            </button>
          )}
        </div>
        <HireModal open={editing} onClose={() => setEditing(false)} editing={agent} />
        {/* chat / live feed tabs */}
        <div className="flex items-center gap-1">
          {(["chat", "live"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFeedTab(t)}
              aria-pressed={feedTab === t}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors ${feedTab === t ? "bg-stone-800 font-medium text-stone-100" : "text-stone-500 hover:text-stone-300"}`}
            >
              {t === "live" && isAgentLive(agent.status) && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
              )}
              {t === "live" ? `Live${liveEntries.length > 0 ? ` · ${liveEntries.length}` : ""}` : "Chat"}
            </button>
          ))}
        </div>
        {feedTab === "chat" ? (
          <>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md bg-stone-950/70 p-2">
              {shortTerm.length === 0 && <div className="text-[11px] text-stone-600">Chat directly with {agent.name}…</div>}
              {shortTerm.map((m) => (
                <div key={m.id} className={`text-xs leading-snug ${m.role === "user" ? "text-right text-amber-200/90" : "text-left text-stone-300"}`}>
                  <span className="text-[10px] text-stone-600">{timeStr(m.timestamp)} </span>
                  {m.content}
                </div>
              ))}
              {busy && <div className="text-[11px] text-stone-500">{agent.name} is typing…</div>}
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder={`Message ${agent.name}…`}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="secondary" onClick={send} disabled={busy || !msg.trim()}>
                <Send size={13} />
              </Button>
            </div>
          </>
        ) : (
          <div ref={liveRef} className="max-h-44 space-y-1 overflow-y-auto rounded-md bg-stone-950/70 p-2">
            {liveEntries.length === 0 && (
              <div className="text-[11px] text-stone-600">
                Nothing yet — {agent.name}&rsquo;s reasoning and tool calls stream here while working.
              </div>
            )}
            {liveEntries.map((e) => (
              <div key={e.id} className="text-xs leading-snug text-stone-300">
                <span className="text-[10px] text-stone-600">{timeStr(e.timestamp)} </span>
                {e.kind === "tool" ? (
                  <span>
                    <span className="text-sky-400">🔧 {e.toolName}</span>{" "}
                    <span className="text-[10px] text-stone-500">{e.phase === "done" ? "→" : "…"}</span>{" "}
                    <span className="text-stone-400">{e.text}</span>
                  </span>
                ) : (
                  <span>
                    <span className="text-stone-500">💭</span> {e.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
