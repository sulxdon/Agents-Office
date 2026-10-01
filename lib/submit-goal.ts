"use client";

import { useOfficeStore, useSettingsStore } from "@/lib/store/useOfficeStore";
import { buildKeysHeader } from "@/lib/llm-provider";
import { activeWebhooks } from "@/lib/integrations";

/**
 * Post a goal through the real /api/goals pipeline and apply the result to
 * the store. Shared by the top-bar GoalInput and the onboarding sample goal.
 * Returns the created goal id, or null when nothing was sent.
 */
export async function postGoal(opts: {
  title: string;
  description?: string;
  priority?: string;
}): Promise<string | null> {
  const s = useOfficeStore.getState();
  const settings = useSettingsStore.getState();
  const title = opts.title.trim();
  if (!s.activeProjectId || !title) return null;

  const teamIds = new Set(s.teams.filter((t) => t.projectId === s.activeProjectId).map((t) => t.id));
  const officeByTeam = new Map(
    s.teams.filter((t) => t.projectId === s.activeProjectId).map((t) => [t.id, t.officeId])
  );
  const roster = s.agents
    .filter((a) => teamIds.has(a.teamId))
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      skills: a.skills,
      status: a.status,
      // raw per-agent model ("" = inherit); the server resolves against the default
      model: a.model,
      officeId: a.homeOfficeId ?? officeByTeam.get(a.teamId) ?? null,
      x: Math.round(a.x),
      y: Math.round(a.y),
    }));

  const keys = settings.keys;
  const webhooks = activeWebhooks(settings.webhooks);
  const res = await fetch("/api/goals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(Object.keys(keys).length || webhooks.length ? { "x-llm-keys": buildKeysHeader(keys, webhooks) } : {}),
    },
    body: JSON.stringify({
      projectId: s.activeProjectId,
      projectName: s.projects.find((p) => p.id === s.activeProjectId)?.name ?? "",
      title,
      description: (opts.description ?? "").trim(),
      priority: opts.priority ?? "medium",
      model: settings.defaultModel,
      demoMode: settings.demoMode,
      roster,
    }),
  });
  const data = await res.json();
  if (!data.goal) return null;

  s.upsertGoal({
    id: data.goal.id,
    projectId: data.goal.projectId,
    title: data.goal.title,
    description: data.goal.description ?? "",
    status: data.goal.status ?? "active",
    priority: data.goal.priority ?? "medium",
    createdAt: data.goal.createdAt,
  });
  // the Manager walks to the center of their office to "announce" the plan
  const mgr = s.agents.find((a) => a.role === "manager");
  if (mgr) {
    s.agentSay(mgr.id, `New goal: ${title.slice(0, 60)} — planning now…`);
  }
  return data.goal.id as string;
}
