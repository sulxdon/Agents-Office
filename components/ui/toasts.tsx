"use client";

import { useEffect } from "react";
import { useOfficeStore, type Toast } from "@/lib/store/useOfficeStore";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  info: { icon: Info, ring: "text-sky-400" },
  success: { icon: CheckCircle2, ring: "text-emerald-400" },
  warning: { icon: AlertTriangle, ring: "text-amber-400" },
  error: { icon: XCircle, ring: "text-red-400" },
} as const;

const AUTO_DISMISS_MS = 6000;

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useOfficeStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [dismissToast, toast.id]);

  const { icon: Icon, ring } = TONE[toast.tone] ?? TONE.info;
  return (
    <div
      role="status"
      className="ao-toast pointer-events-auto flex w-72 items-start gap-2 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 shadow-xl"
    >
      <Icon size={16} className={cn("mt-0.5 shrink-0", ring)} />
      <div className="min-w-0 flex-1">
        {toast.title && <div className="text-xs font-semibold text-stone-100">{toast.title}</div>}
        <div className="break-words text-xs leading-snug text-stone-300">{toast.message}</div>
      </div>
      <button
        className="shrink-0 rounded p-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** Bottom-right stack fed by SSE `toast` events (see useOfficeEvents). */
export default function Toasts() {
  const toasts = useOfficeStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-10 right-3 z-40 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
