"use client";

import { useMemo, useState } from "react";
import {
  defaultOfficeFor,
  homeOfficeFor,
  nextRoomSpot,
  useOfficeStore,
} from "@/lib/store/useOfficeStore";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";

/** Rooms section for the left sidebar: rename, delete (move-to-default), + Room. */
export default function RoomsPanel() {
  const offices = useOfficeStore((s) => s.offices);
  const teams = useOfficeStore((s) => s.teams);
  const agents = useOfficeStore((s) => s.agents);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const selectedOfficeId = useOfficeStore((s) => s.selectedOfficeId);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const rooms = useMemo(
    () => offices.filter((o) => o.projectId === activeProjectId),
    [offices, activeProjectId]
  );
  // How many agents call each room home (explicit home, else team/default fallback).
  const homeCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of rooms) counts.set(a.id, 0);
    for (const a of agents) {
      const home = homeOfficeFor(a, offices, teams);
      if (home && home.projectId === activeProjectId) counts.set(home.id, (counts.get(home.id) ?? 0) + 1);
    }
    return counts;
  }, [agents, offices, rooms, teams, activeProjectId]);

  if (!activeProjectId) return null;

  const addRoom = () => {
    const s = useOfficeStore.getState();
    const spot = nextRoomSpot(s.offices, activeProjectId);
    const n = s.offices.filter((o) => o.projectId === activeProjectId && o.kind !== "break").length + 1;
    const id = uid("off");
    s.addOffice({
      id,
      projectId: activeProjectId,
      teamId: null,
      name: `Room ${n}`,
      x: spot.x,
      y: spot.y,
      width: 460,
      height: 330,
    });
    s.setSelectedOffice(id);
  };

  const rename = (id: string, cur: string) => {
    const name = window.prompt("Rename room:", cur);
    if (name && name.trim()) useOfficeStore.getState().renameOffice(id, name.trim());
  };

  const fallback = defaultOfficeFor(activeProjectId, offices.filter((o) => o.id !== confirmDelete));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Rooms · {rooms.length}
        </span>
        <button
          className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-400 hover:bg-stone-800 hover:text-stone-100"
          onClick={addRoom}
          title="Add a room to this floor"
        >
          <Plus size={12} /> Room
        </button>
      </div>
      <div className="space-y-0.5">
        {rooms.map((r) => {
          const isBreak = r.kind === "break";
          const count = homeCount.get(r.id) ?? 0;
          const armed = confirmDelete === r.id;
          return (
            <div key={r.id}>
              <div
                className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors ${
                  selectedOfficeId === r.id ? "bg-stone-800 text-stone-100" : "text-stone-300 hover:bg-stone-900"
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                  onClick={() => useOfficeStore.getState().setSelectedOffice(r.id)}
                  title={`${r.name} — click to select`}
                >
                  <span aria-hidden>{isBreak ? "☕" : "🏠"}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-[10px] text-stone-600" title={`${count} agent${count === 1 ? "" : "s"} homed here`}>
                    {count}
                  </span>
                </button>
                <button
                  className="hidden rounded p-0.5 text-stone-500 hover:text-stone-200 group-hover:block"
                  onClick={() => rename(r.id, r.name)}
                  title={`Rename ${r.name}`}
                >
                  <Pencil size={12} />
                </button>
                {!isBreak && (
                  <button
                    className="hidden rounded p-0.5 text-stone-500 hover:text-red-400 group-hover:block"
                    onClick={() => setConfirmDelete(armed ? null : r.id)}
                    title={`Delete ${r.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {armed && !isBreak && (
                <div className="ml-2 mt-0.5 rounded-md border border-red-900/60 bg-red-950/30 px-2 py-1.5 text-[11px] text-stone-300">
                  {count > 0 ? (
                    <span>
                      Move {count} agent{count === 1 ? "" : "s"} home to{" "}
                      <span className="font-medium">{fallback?.name ?? "nowhere (no rooms left)"}</span>?
                    </span>
                  ) : (
                    <span>Delete {r.name}?</span>
                  )}
                  <div className="mt-1 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        useOfficeStore.getState().deleteOffice(r.id);
                        setConfirmDelete(null);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rooms.length === 0 && (
          <div className="rounded-md border border-dashed border-stone-800 px-2 py-3 text-center">
            <div className="text-xs text-stone-400">No rooms on this floor yet</div>
            <button className="mt-1 text-[11px] text-amber-500 hover:text-amber-400" onClick={addRoom}>
              Add your first room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
