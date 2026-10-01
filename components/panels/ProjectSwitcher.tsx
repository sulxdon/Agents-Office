"use client";

import { useState } from "react";
import { useOfficeStore } from "@/lib/store/useOfficeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Plus, ChevronRight, Pencil, Trash2 } from "lucide-react";

export default function ProjectSwitcher() {
  const projects = useOfficeStore((s) => s.projects);
  const activeProjectId = useOfficeStore((s) => s.activeProjectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) return;
    // New projects are never empty: project + team + office + manager, and it becomes active.
    useOfficeStore.getState().createProject(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setOpen(false);
  };

  const startRename = (id: string, curName: string, curDesc: string) => {
    setRenaming(id);
    setRenameName(curName);
    setRenameDesc(curDesc);
  };

  const applyRename = () => {
    if (!renaming) return;
    useOfficeStore.getState().renameProject(renaming, renameName, renameDesc);
    setRenaming(null);
  };

  const remove = async (id: string) => {
    // Best-effort server cleanup, then the client cascade (always runs).
    await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => undefined);
    useOfficeStore.getState().deleteProject(id);
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Projects</span>
        <button className="rounded p-0.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100" onClick={() => setOpen(true)} title="New project">
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {projects.length === 0 && (
          <div className="rounded-md border border-dashed border-stone-800 px-2 py-3 text-center text-xs text-stone-500">
            No projects yet — create one to get started.
          </div>
        )}
        {projects.map((p) =>
          confirmDelete === p.id ? (
            <div key={p.id} className="flex items-center gap-1 rounded-md bg-stone-900 px-2 py-1.5 text-xs">
              <span className="flex-1 truncate text-red-400">Delete {p.name}?</span>
              <button className="rounded bg-red-600 px-1.5 py-0.5 text-white hover:bg-red-500" onClick={() => remove(p.id)}>
                Yes
              </button>
              <button className="rounded px-1.5 py-0.5 text-stone-400 hover:bg-stone-800" onClick={() => setConfirmDelete(null)}>
                No
              </button>
            </div>
          ) : (
            <div
              key={p.id}
              className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                p.id === activeProjectId ? "bg-stone-800 text-stone-100" : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"
              }`}
            >
              <button className="flex min-w-0 flex-1 items-center gap-2" onClick={() => useOfficeStore.getState().setActiveProject(p.id)}>
                <span>{p.icon}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-stone-600">F{p.floorNumber}</span>
                {p.id === activeProjectId && <ChevronRight size={14} className="text-stone-500" />}
              </button>
              <button
                title="Rename project"
                className="hidden rounded p-0.5 text-stone-500 hover:bg-stone-700 hover:text-stone-200 group-hover:block"
                onClick={() => startRename(p.id, p.name, p.description)}
              >
                <Pencil size={12} />
              </button>
              <button
                title="Delete project"
                className="hidden rounded p-0.5 text-stone-500 hover:bg-stone-700 hover:text-red-400 group-hover:block"
                onClick={() => setConfirmDelete(p.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <h2 className="mb-3 text-base font-semibold text-stone-100">New project</h2>
        <div className="space-y-2">
          <Input placeholder="Project name — e.g. Blog SEO" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Short description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create floor</Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)}>
        <h2 className="mb-3 text-base font-semibold text-stone-100">Rename project</h2>
        <div className="space-y-2">
          <Input placeholder="Project name" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          <Input placeholder="Short description (optional)" value={renameDesc} onChange={(e) => setRenameDesc(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button onClick={applyRename}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
