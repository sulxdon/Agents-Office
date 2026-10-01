"use client";

import { useState } from "react";
import { postGoal } from "@/lib/submit-goal";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export default function GoalInput() {
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [busy, setBusy] = useState(false);

  const submit = async (goalTitle: string, goalDesc: string) => {
    if (!goalTitle.trim() || busy) return;
    setBusy(true);
    try {
      const id = await postGoal({ title: goalTitle, description: goalDesc, priority });
      if (!id) return;
      setQuick("");
      setTitle("");
      setDesc("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center gap-2">
      <Input
        placeholder='What should the team do? e.g. "Build a landing page for a coffee shop"'
        value={quick}
        onChange={(e) => setQuick(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(quick, "");
        }}
        className="h-8 text-[13px]"
      />
      <Button size="sm" disabled={busy || !quick.trim()} onClick={() => submit(quick, "")}>
        {busy ? "Sending…" : "Send to team"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} title="New goal with details">
        <Plus size={14} /> Goal
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <h2 className="mb-3 text-base font-semibold text-stone-100">New goal</h2>
        <div className="space-y-2">
          <Input placeholder="Title — e.g. Launch landing page" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            rows={3}
            placeholder="Details, constraints, links… (tip: @Name to force an assignee)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">Priority</span>
            {(["low", "medium", "high"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
                  priority === p ? "bg-amber-500 text-stone-950" : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !title.trim()} onClick={() => submit(title, desc)}>
              {busy ? "Sending…" : "Send to team"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export { uid };
