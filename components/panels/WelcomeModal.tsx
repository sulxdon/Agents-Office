"use client";

import { useState } from "react";
import Link from "next/link";
import { useSettingsStore } from "@/lib/store/useOfficeStore";
import { postGoal } from "@/lib/submit-goal";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Users, Send, MousePointerClick, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export const SAMPLE_GOAL = {
  title: "Plan a weekend promo for the coffee shop",
  description: "Dream up one promo idea, write the announcement copy, and sketch the counter sign.",
};

const STEPS = [
  {
    icon: Users,
    title: "Meet the team",
    body: "This is your office floor. Agents work at their desks and unwind in the Break Room — click any character to inspect them, or the roster on the left to find everyone.",
  },
  {
    icon: Send,
    title: "Send a goal",
    body: "Type anything into the top bar and hit Send to team. The Manager breaks it into tasks, assigns them by skill, and the crew gets to work — live on the canvas.",
  },
  {
    icon: MousePointerClick,
    title: "Click an agent",
    body: "Click any character to inspect their status, skills, and current task — or chat with them directly. Click a task card to fly the camera to its assignee.",
  },
  {
    icon: Settings,
    title: "Open Settings",
    body: "The app boots in free demo mode with mock agents. Add your own API key in Settings and turn demo mode off for real LLM planning and work.",
  },
];

/** First-run welcome tour. Shown until dismissed; completion persists in settings. */
export default function WelcomeModal() {
  const onboarded = useSettingsStore((s) => s.onboarded);
  const setOnboarded = useSettingsStore((s) => s.setOnboarded);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (onboarded) return null;
  const last = step === STEPS.length - 1;
  const S = STEPS[step];
  const Icon = S.icon;

  const sendSample = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      const id = await postGoal(SAMPLE_GOAL);
      if (id) setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onClose={() => setOnboarded(true)}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-500/90">
        Welcome to Agent Office
      </div>
      <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-100">
        You&apos;re the CEO. They do the work.
      </h2>

      {/* step dots */}
      <div className="mb-3 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setStep(i)}
            aria-label={`Step ${i + 1}: ${s.title}`}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i === step ? "bg-amber-500" : i < step ? "bg-amber-800" : "bg-stone-800 hover:bg-stone-700"
            )}
          />
        ))}
      </div>

      <div className="mb-4 flex gap-3 rounded-md border border-stone-800 bg-stone-950/60 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-800 text-amber-400">
          <Icon size={18} />
        </span>
        <div>
          <div className="text-sm font-semibold text-stone-100">
            {step + 1}. {S.title}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-stone-400">{S.body}</p>
        </div>
      </div>

      {last && (
        <div className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/20 p-3">
          <div className="text-[13px] font-medium text-stone-200">Try it right now</div>
          <p className="mt-0.5 text-xs leading-snug text-stone-400">
            {sent
              ? "Sample goal sent — watch Maya plan it on the floor. Close this tour to follow along."
              : `Send a sample goal (“${SAMPLE_GOAL.title}”) through the real pipeline and watch the team react.`}
          </p>
          <Button size="sm" className="mt-2" disabled={sending || sent} onClick={sendSample}>
            {sending ? "Sending…" : sent ? "Sent — check the floor" : "Send sample goal"}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          className="text-xs text-stone-500 hover:text-stone-300"
          onClick={() => setOnboarded(true)}
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {last ? (
            <Button size="sm" onClick={() => setOnboarded(true)}>
              Start managing
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 text-center text-[11px] text-stone-600">
        You can replay this tour anytime from{" "}
        <Link href="/settings" className="underline hover:text-stone-400">
          Settings
        </Link>
        .
      </div>
    </Dialog>
  );
}
