"use client";

import { useId, useMemo } from "react";
import { MODEL_CATALOG, PROVIDER_LABELS, parseModelRef, type ProviderId } from "@/lib/llm-provider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PROVIDERS = Object.keys(PROVIDER_LABELS) as ProviderId[];

interface Props {
  /** Full "provider:model" ref, e.g. "meta:muse-spark-1.3" — or "" to inherit the default. */
  value: string;
  onChange: (ref: string) => void;
  /** Compact layout for tight cards. */
  small?: boolean;
  className?: string;
  /**
   * Show a "Default" toggle: when on, the value is "" and the system default
   * model is used (per-agent override cleared). Used on agent pickers.
   */
  allowDefault?: boolean;
  /** Effective model shown when inheriting (the resolved system default). */
  defaultHint?: string;
}

/**
 * Provider select + free-form model input. The catalog is only suggestions —
 * any model id can be typed, so new releases work without an app update.
 */
export default function ModelPicker({ value, onChange, small, className, allowDefault, defaultHint }: Props) {
  const listId = useId();
  const inherited = allowDefault && !value.trim();
  const { provider, model } = useMemo(() => parseModelRef(value.trim() || "openai:gpt-4o-mini"), [value]);
  const suggestions = useMemo(() => MODEL_CATALOG.filter((m) => m.provider === provider), [provider]);

  if (inherited) {
    return (
      <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
        <span className="min-w-0 flex-1 truncate text-[11px] text-stone-400" title={defaultHint || "System default"}>
          Default{defaultHint ? `: ${defaultHint}` : ""}
        </span>
        <button
          type="button"
          onClick={() => onChange(defaultHint || "openai:gpt-4o-mini")}
          className={cn(
            "shrink-0 rounded border border-stone-700 text-stone-300 hover:bg-stone-800",
            small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
          )}
        >
          Override
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-1.5", small && "min-w-0 flex-1", className)}>
      <select
        aria-label="Provider"
        value={provider}
        onChange={(e) => onChange(`${e.target.value}:${model}`)}
        className={cn(
          "shrink-0 rounded-md border border-stone-700 bg-stone-950 text-stone-200",
          small ? "h-7 max-w-[104px] px-1 text-[11px]" : "h-9 px-2 text-sm"
        )}
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {PROVIDER_LABELS[p]}
          </option>
        ))}
      </select>
      <Input
        aria-label="Model id (free-form)"
        list={listId}
        value={model}
        placeholder="model-id, e.g. muse-spark-1.3"
        onChange={(e) => onChange(`${provider}:${e.target.value}`)}
        className={cn("min-w-0 flex-1", small && "h-7 px-1.5 text-[11px]")}
      />
      <datalist id={listId}>
        {suggestions.map((m) => (
          <option key={m.ref} value={m.ref.split(":")[1]}>
            {m.label}
          </option>
        ))}
      </datalist>
      {allowDefault && (
        <button
          type="button"
          title="Follow the system default model"
          onClick={() => onChange("")}
          className={cn(
            "shrink-0 rounded border border-stone-700 text-stone-400 hover:bg-stone-800 hover:text-stone-200",
            small ? "px-1.5 text-[11px]" : "px-2 text-xs"
          )}
        >
          Default
        </button>
      )}
    </div>
  );
}
