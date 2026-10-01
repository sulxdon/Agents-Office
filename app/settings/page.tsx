"use client";

import Link from "next/link";
import { useOfficeStore, useSettingsStore } from "@/lib/store/useOfficeStore";
import ModelPicker from "@/components/ui/model-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, KeyRound, FlaskConical, RotateCcw, Webhook, Plus, Trash2 } from "lucide-react";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
  { id: "groq", label: "Groq", placeholder: "gsk_…" },
  { id: "google", label: "Google (Gemini)", placeholder: "AIza…" },
  { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-…" },
  { id: "ollamaBaseUrl", label: "Ollama base URL (no key needed)", placeholder: "http://localhost:11434" },
  { id: "meta", label: "Meta Model API (Muse)", placeholder: "key from ai.developer.meta.com" },
  { id: "customBaseUrl", label: "Custom endpoint base URL", placeholder: "https://…/v1" },
  { id: "customApiKey", label: "Custom endpoint API key", placeholder: "sk-…" },
];

export default function SettingsPage() {
  const keys = useSettingsStore((s) => s.keys);
  const setKey = useSettingsStore((s) => s.setKey);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const setDefaultModel = useSettingsStore((s) => s.setDefaultModel);
  const demoMode = useSettingsStore((s) => s.demoMode);
  const setDemoMode = useSettingsStore((s) => s.setDemoMode);
  const setOnboarded = useSettingsStore((s) => s.setOnboarded);
  const webhooks = useSettingsStore((s) => s.webhooks);
  const addWebhook = useSettingsStore((s) => s.addWebhook);
  const updateWebhook = useSettingsStore((s) => s.updateWebhook);
  const removeWebhook = useSettingsStore((s) => s.removeWebhook);

  return (
    <div className="min-h-screen bg-stone-950 p-6 text-stone-200">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-100">
          <ArrowLeft size={15} /> Back to office
        </Link>
        <h1 className="text-xl font-bold text-stone-100">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical size={15} /> Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} className="accent-amber-500" />
              Demo mode (mock agents, no API calls, no cost)
            </label>
            <p className="text-xs text-stone-500">
              Turn demo mode off and add a key below to let real LLMs plan and do the work. Keys are sent with each
              request and never stored on the server.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound size={15} /> Bring your own keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <p className="text-xs text-stone-500">
              Stored only in this browser (localStorage). The server uses them per-request and never saves them.
            </p>
            {PROVIDERS.map((p) => (
              <div key={p.id} className="grid grid-cols-[180px_1fr] items-center gap-2">
                <label className="text-xs text-stone-400">{p.label}</label>
                <Input
                  type={p.id === "ollamaBaseUrl" || p.id === "customBaseUrl" ? "text" : "password"}
                  placeholder={p.placeholder}
                  value={keys[p.id] ?? ""}
                  onChange={(e) => setKey(p.id, e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook size={15} /> Webhook integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <p className="text-xs text-stone-500">
              Each webhook becomes a <span className="font-mono">call_&lt;name&gt;</span> agent tool that POSTs{" "}
              <span className="font-mono">{"{text}"}</span> JSON to your URL. Stored only in this browser
              (localStorage) and sent with each request — secrets stay in the browser and are never saved on the
              server.
            </p>
            {webhooks.map((w, i) => (
              <div key={i} className="space-y-1.5 rounded-md border border-stone-800 bg-stone-950/60 p-2.5">
                <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                  <label className="text-xs text-stone-400">Name</label>
                  <Input
                    placeholder="e.g. deploy-hook"
                    value={w.name}
                    onChange={(e) => updateWebhook(i, { name: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                  <label className="text-xs text-stone-400">URL</label>
                  <Input
                    placeholder="https://…"
                    value={w.url}
                    onChange={(e) => updateWebhook(i, { url: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                  <label className="text-xs text-stone-400">Secret (optional)</label>
                  <Input
                    type="password"
                    placeholder="Bearer token"
                    value={w.secret ?? ""}
                    onChange={(e) => updateWebhook(i, { secret: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 hover:text-red-400"
                    onClick={() => removeWebhook(i)}
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={addWebhook}>
              <Plus size={13} /> Add webhook
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default model</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelPicker value={defaultModel} onChange={setDefaultModel} />
            <p className="mt-2 text-xs text-stone-500">
              Pick any provider, then type any model id — the suggestions are just a starting
              point. For Muse: provider Meta (Muse), model muse-spark-1.3, plus your Meta
              Model API key above. Agents set to Default follow this automatically; give
              the Manager a strong model and workers fast ones via each agent card.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => useOfficeStore.getState().resetAllAgentsToDefault()}
            >
              Apply system default to all agents
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={15} /> Tour
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              Replay the 4-step welcome tour (meet the team, send a goal, click an agent, Settings).
            </p>
            <Link href="/">
              <Button size="sm" variant="secondary" onClick={() => setOnboarded(false)}>
                Replay tour
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Link href="/">
          <Button className="w-full">Done — back to the office</Button>
        </Link>
      </div>
    </div>
  );
}
