"use client";

import { useEffect, useMemo, useState } from "react";
import { AGENT_ROLES, defaultOfficeFor, freeDeskSpot, parseSkills, useOfficeStore, useSettingsStore, type Agent } from "@/lib/store/useOfficeStore";
import ModelPicker from "@/components/ui/model-picker";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

const AVATARS = ["🦊", "🐧", "🦉", "🦜", "🦋", "🐸", "🦄", "🐝", "🐙", "🦁", "🐰", "🐲"];

const ROLE_SKILLS: Record<string, string> = {
  manager: "planning, delegation, review",
  developer: "react, typescript, api-design",
  designer: "ui, ux, layout, brand",
  researcher: "research, analysis, synthesis",
  qa: "testing, review, quality",
  writer: "copy, docs, content",
  marketer: "seo, copy, analytics",
};

export default function HireModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Agent }) {
  const teams = useOfficeStore((s) => s.teams);
  const offices = useOfficeStore((s) => s.offices);
  const agents = useOfficeStore((s) => s.agents);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const defaultModel = useSettingsStore((s) => s.defaultModel);

  const myTeams = useMemo(() => teams.filter((t) => t.projectId === activeProjectId), [teams, activeProjectId]);
  const myRooms = useMemo(
    () => offices.filter((o) => o.projectId === activeProjectId && o.kind !== "break"),
    [offices, activeProjectId]
  );

  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState<string>(editing?.role ?? "developer");
  const [avatar, setAvatar] = useState(editing?.avatar ?? AVATARS[0]);
  const [skills, setSkills] = useState(editing ? editing.skills.join(", ") : ROLE_SKILLS.developer);
  const [personality, setPersonality] = useState(editing?.personalityPrompt ?? "");
  // "" = inherit the system default model.
  const [model, setModel] = useState(editing?.model ?? "");
  const [teamId, setTeamId] = useState(editing?.teamId ?? "");
  const [homeOfficeId, setHomeOfficeId] = useState(editing?.homeOfficeId ?? "");

  // Resync the form whenever a different agent is edited.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setRole(editing?.role ?? "developer");
    setAvatar(editing?.avatar ?? AVATARS[0]);
    setSkills(editing ? editing.skills.join(", ") : ROLE_SKILLS.developer);
    setPersonality(editing?.personalityPrompt ?? "");
    setModel(editing?.model ?? "");
    setTeamId(editing?.teamId ?? "");
    setHomeOfficeId(editing?.homeOfficeId ?? "");
  }, [open, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const team = myTeams.find((t) => t.id === (teamId || myTeams[0]?.id)) ?? myTeams[0];
  // Home office defaults to the team's office (then the project default room).
  const teamDefaultRoom =
    myRooms.find((o) => o.teamId === team?.id) ??
    myRooms.find((o) => o.id === team?.officeId) ??
    (activeProjectId ? defaultOfficeFor(activeProjectId, myRooms) : null);
  const homeRoom = myRooms.find((o) => o.id === (homeOfficeId || teamDefaultRoom?.id)) ?? teamDefaultRoom ?? null;

  const pickTeam = (id: string) => {
    setTeamId(id);
    // Switching teams re-seats the agent in the new team's office (overridable below).
    const next = myTeams.find((t) => t.id === id);
    const room =
      myRooms.find((o) => o.teamId === id) ??
      myRooms.find((o) => o.id === next?.officeId) ??
      (activeProjectId ? defaultOfficeFor(activeProjectId, myRooms) : null);
    setHomeOfficeId(room?.id ?? "");
  };

  const save = () => {
    const s = useOfficeStore.getState();
    if (!name.trim() || !team || !activeProjectId) return;
    if (editing) {
      s.updateAgent(editing.id, {
        name: name.trim(),
        role,
        avatar,
        skills: parseSkills(skills),
        personalityPrompt: personality.trim(),
        teamId: team.id,
        model,
        homeOfficeId: homeRoom?.id ?? null,
      });
      s.pushActivity({
        id: uid("act"),
        projectId: activeProjectId,
        type: "hire",
        description: `${name.trim()}'s profile was updated.`,
        timestamp: Date.now(),
      });
      onClose();
      return;
    }
    const office = homeRoom;
    const inOffice = office
      ? agents.filter((a) => a.x >= office.x && a.x <= office.x + office.width && a.y >= office.y && a.y <= office.y + office.height)
      : [];
    const spot = office ? freeDeskSpot(office, inOffice) : { x: 200, y: 200 };
    s.addAgent({
      id: uid("agent"),
      teamId: team.id,
      name: name.trim(),
      role,
      avatar,
      personalityPrompt: personality.trim(),
      model,
      homeOfficeId: homeRoom?.id ?? null,
      skills: parseSkills(skills),
      status: "idle",
      x: spot.x,
      y: spot.y,
      currentTaskId: null,
    });
    s.pushActivity({
      id: uid("act"),
      projectId: activeProjectId,
      type: "hire",
      description: `${name.trim()} joined ${team.name} as ${role}.`,
      timestamp: Date.now(),
    });
    setName("");
    setPersonality("");
    onClose();
  };

  const pickRole = (r: string) => {
    setRole(r);
    setSkills(ROLE_SKILLS[r] ?? "");
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <h2 className="mb-3 text-base font-semibold text-stone-100">{editing ? `Edit ${editing.name}` : "Hire an agent"}</h2>
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <Input placeholder="Name — e.g. Devon" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <select
            aria-label="Avatar"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            className="h-9 rounded-md border border-stone-700 bg-stone-950 px-2 text-lg"
          >
            {AVATARS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-stone-400">
            Role
            <select
              value={role}
              onChange={(e) => pickRole(e.target.value)}
              className="h-9 rounded-md border border-stone-700 bg-stone-950 px-2 text-sm capitalize text-stone-100"
            >
              {AGENT_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-stone-400">
            Team
            <select
              value={team?.id ?? ""}
              onChange={(e) => pickTeam(e.target.value)}
              className="h-9 rounded-md border border-stone-700 bg-stone-950 px-2 text-sm text-stone-100"
            >
              {myTeams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-stone-400">
            Home office
            <select
              value={homeRoom?.id ?? ""}
              onChange={(e) => setHomeOfficeId(e.target.value)}
              className="h-9 rounded-md border border-stone-700 bg-stone-950 px-2 text-sm text-stone-100"
            >
              {myRooms.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        </div>
        <Input
          placeholder="Skills, comma-separated — e.g. react, typescript"
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Personality (optional) — e.g. Pragmatic coder, loves clean APIs."
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
        />
        <label className="flex flex-col gap-1 text-xs text-stone-400">
          Model (blank = follow system default)
          <ModelPicker value={model} onChange={setModel} allowDefault defaultHint={defaultModel} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || !team} onClick={save}>{editing ? "Save changes" : `Hire ${name.trim() || "agent"}`}</Button>
        </div>
      </div>
    </Dialog>
  );
}
