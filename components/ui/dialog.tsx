"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn("ao-dialog relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 p-4 shadow-2xl", className)}
      >
        {children}
      </div>
    </div>
  );
}
