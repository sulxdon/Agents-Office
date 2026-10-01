// LLM provider abstraction with BYO keys. Keys live in the browser (localStorage)
// and are sent per-request in the x-llm-keys header; the server never stores them.

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, type CoreMessage, type ToolSet } from "ai";
import type { WebhookConfig } from "@/lib/integrations";

export type ProviderId = "openai" | "anthropic" | "groq" | "google" | "openrouter" | "ollama" | "meta" | "custom";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  google: "Google",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
  meta: "Meta (Muse)",
  custom: "Custom endpoint",
};

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  groq?: string;
  google?: string;
  openrouter?: string;
  ollamaBaseUrl?: string;
  meta?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}

export interface ModelRef {
  provider: ProviderId;
  model: string;
}

/** Last-resort default when neither the agent nor the system default names a model. */
export const FALLBACK_DEFAULT_MODEL = "openai:gpt-4o-mini";

/**
 * Model inheritance: a blank agent model means "use the system default".
 * Pure + tested. Callers must resolve before parseModelRef/modelFor —
 * an empty ref would otherwise parse as provider "openai" with an empty id.
 */
export function resolveAgentModel(agentModel: string | null | undefined, defaultModel: string | null | undefined): string {
  const own = (agentModel ?? "").trim();
  if (own) return own;
  const fallback = (defaultModel ?? "").trim();
  return fallback || FALLBACK_DEFAULT_MODEL;
}

/** Parse "provider:model" strings from the UI, e.g. "openai:gpt-4o-mini". */
export function parseModelRef(ref: string): ModelRef {
  const idx = ref.indexOf(":");
  if (idx === -1) return { provider: "openai", model: ref };
  return { provider: ref.slice(0, idx) as ProviderId, model: ref.slice(idx + 1) };
}

export const MODEL_CATALOG: { ref: string; label: string; provider: ProviderId }[] = [
  { ref: "openai:gpt-4o-mini", label: "GPT-4o mini (fast, cheap)", provider: "openai" },
  { ref: "openai:gpt-4o", label: "GPT-4o (strong)", provider: "openai" },
  { ref: "anthropic:claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", provider: "anthropic" },
  { ref: "anthropic:claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (fast)", provider: "anthropic" },
  { ref: "groq:llama-3.1-70b-versatile", label: "Llama 3.1 70B (Groq)", provider: "groq" },
  { ref: "groq:llama-3.1-8b-instant", label: "Llama 3.1 8B instant (Groq)", provider: "groq" },
  { ref: "google:gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
  { ref: "google:gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "google" },
  { ref: "openrouter:meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B (OpenRouter)", provider: "openrouter" },
  { ref: "openrouter:anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (OpenRouter)", provider: "openrouter" },
  { ref: "ollama:llama3.1", label: "Llama 3.1 (Ollama local)", provider: "ollama" },
  { ref: "ollama:qwen2.5", label: "Qwen 2.5 (Ollama local)", provider: "ollama" },
  { ref: "meta:muse-spark-1.3", label: "Muse Spark 1.3 (Meta)", provider: "meta" },
  { ref: "meta:muse-spark-1.1", label: "Muse Spark 1.1 (Meta)", provider: "meta" },
];

/** Meta Model API serves Muse models over an OpenAI-compatible endpoint. */
export const META_BASE_URL = "https://api.meta.ai/v1";

export function modelFor(ref: ModelRef, keys: ApiKeys) {
  switch (ref.provider) {
    case "openai":
      return createOpenAI({ apiKey: keys.openai })(ref.model);
    case "anthropic":
      return createAnthropic({ apiKey: keys.anthropic })(ref.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: keys.google })(ref.model);
    case "groq":
      return createOpenAICompatible({
        name: "groq",
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: keys.groq,
      })(ref.model);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: keys.openrouter,
      })(ref.model);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: `${keys.ollamaBaseUrl || "http://localhost:11434"}/v1`,
        apiKey: "ollama",
      })(ref.model);
    case "meta":
      return createOpenAICompatible({
        name: "meta",
        baseURL: META_BASE_URL,
        apiKey: keys.meta,
      })(ref.model);
    case "custom": {
      const baseURL = (keys.customBaseUrl ?? "").trim();
      if (!baseURL) throw new Error("Custom provider needs a base URL — set it in Settings.");
      return createOpenAICompatible({
        name: "custom",
        baseURL,
        apiKey: keys.customApiKey?.trim() ? keys.customApiKey : "custom",
      })(ref.model);
    }
    default:
      throw new Error(`Unknown provider "${(ref as ModelRef).provider}" — check the model ref.`);
  }
}

export interface CallLLMOptions {
  model: string; // "provider:model" ref
  messages: CoreMessage[] | { role: string; content: string }[];
  tools?: ToolSet;
  apiKeys: ApiKeys;
  maxSteps?: number;
  temperature?: number;
}

export async function callLLM(opts: CallLLMOptions) {
  const ref = parseModelRef(opts.model);
  const model = modelFor(ref, opts.apiKeys);
  const result = await generateText({
    model,
    messages: opts.messages as CoreMessage[],
    tools: opts.tools,
    maxSteps: opts.maxSteps ?? 5,
    temperature: opts.temperature ?? 0.7,
  });
  return { text: result.text, toolCalls: result.toolCalls, usage: result.usage };
}

export function streamLLM(opts: CallLLMOptions) {
  const ref = parseModelRef(opts.model);
  const model = modelFor(ref, opts.apiKeys);
  return streamText({
    model,
    messages: opts.messages as CoreMessage[],
    tools: opts.tools,
    maxSteps: opts.maxSteps ?? 5,
    temperature: opts.temperature ?? 0.7,
  });
}

/** Rough USD estimates per 1K tokens (input/output blended). Used for the cost tracker. */
const COST_PER_1K: Record<string, number> = {
  "openai:gpt-4o-mini": 0.0004,
  "openai:gpt-4o": 0.008,
  "anthropic:claude-3-5-sonnet-latest": 0.006,
  "anthropic:claude-3-5-haiku-latest": 0.001,
  "google:gemini-1.5-flash": 0.0002,
  "google:gemini-1.5-pro": 0.003,
  "meta:muse-spark-1.3": 0.001,
  "meta:muse-spark-1.1": 0.001,
  default: 0.001,
};

export function estimateCost(modelRef: string, inputTokens: number, outputTokens: number): number {
  const rate = COST_PER_1K[modelRef] ?? COST_PER_1K.default;
  return ((inputTokens + outputTokens) / 1000) * rate;
}

/**
 * Encode the x-llm-keys header payload (base64 JSON): API keys plus the
 * user's webhook integrations. Runs in the browser and in Node. Pure + tested.
 */
export function buildKeysHeader(keys: ApiKeys, webhooks?: WebhookConfig[]): string {
  const payload = webhooks?.length ? { ...keys, webhooks } : { ...keys };
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf-8").toString("base64");
  return btoa(unescape(encodeURIComponent(json)));
}

/**
 * Decode the x-llm-keys header (base64 JSON) sent by the browser into
 * API keys + webhook configs. The server uses both per-request and
 * never stores them. Pure + tested.
 */
export function headerPayloadFromHeader(header: string | null): { keys: ApiKeys; webhooks: WebhookConfig[] } {
  if (!header) return { keys: {}, webhooks: [] };
  try {
    const raw = JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as Record<string, unknown>;
    const { webhooks, ...keys } = raw;
    const list = Array.isArray(webhooks)
      ? (webhooks as WebhookConfig[]).filter((w) => !!w && typeof w.name === "string" && typeof w.url === "string")
      : [];
    return { keys: keys as ApiKeys, webhooks: list };
  } catch {
    return { keys: {}, webhooks: [] };
  }
}

/** Decode just the API keys from the x-llm-keys header. Pure + tested. */
export function keysFromHeader(header: string | null): ApiKeys {
  return headerPayloadFromHeader(header).keys;
}

/** Decode just the webhook configs from the x-llm-keys header. Pure + tested. */
export function webhooksFromHeader(header: string | null): WebhookConfig[] {
  return headerPayloadFromHeader(header).webhooks;
}
