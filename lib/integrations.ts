// G8 first integrations: user-defined webhooks + server-side web fetch.
// Pure helpers (tested) plus thin fetch executors used by agent tools.
// Keys and webhook secrets live in the browser and are sent per-request;
// the server never stores them.

export interface WebhookConfig {
  name: string;
  url: string;
  secret?: string;
}

/** Keep only webhooks with a name and an http(s) URL. Pure + tested. */
export function activeWebhooks(list: WebhookConfig[] | null | undefined): WebhookConfig[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (w) => !!w && w.name.trim().length > 0 && /^https?:\/\//i.test(w.url.trim())
  );
}

/**
 * Sanitize a webhook name into a safe tool-name fragment: [a-z0-9_].
 * Pure + tested.
 */
export function sanitizeToolName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return clean || "webhook";
}

/** Full agent-tool name for a webhook, e.g. "call_my_hook". Pure + tested. */
export function webhookToolName(name: string): string {
  return `call_${sanitizeToolName(name)}`;
}

/** JSON body POSTed to a webhook. Pure + tested. */
export function buildWebhookPayload(text: string): { text: string } {
  return { text };
}

/** Truncate long text with a suffix marker. Pure + tested. */
export function truncateText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…[truncated]`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Strip HTML down to readable text: drop scripts/styles/nav, remove tags,
 * decode common entities, collapse whitespace. Pure + tested.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      const lower = code.toLowerCase();
      if (ENTITIES[lower] !== undefined) return ENTITIES[lower];
      if (code.startsWith("#")) {
        const hex = code[1] === "x" || code[1] === "X";
        const n = parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10);
        if (Number.isFinite(n) && n > 0 && n < 0x10ffff) return String.fromCodePoint(n);
      }
      return m;
    })
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 6000;
const MAX_WEBHOOK_RESPONSE_CHARS = 4000;

function timeoutSignal(): AbortSignal {
  // AbortSignal.timeout is widely available; fall back to a manual controller.
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const c = new AbortController();
  setTimeout(() => c.abort(), FETCH_TIMEOUT_MS).unref?.();
  return c.signal;
}

function assertHttpUrl(url: string): void {
  if (!/^https?:\/\//i.test(url.trim())) throw new Error("Only http(s) URLs are allowed.");
}

/** Fetch a URL server-side (timeout + 2MB cap) and return readable text. */
export async function webFetch(url: string): Promise<string> {
  assertHttpUrl(url);
  const res = await fetch(url.trim(), { signal: timeoutSignal(), redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}.`);
  const buf = await res.arrayBuffer();
  const slice = buf.byteLength > MAX_FETCH_BYTES ? buf.slice(0, MAX_FETCH_BYTES) : buf;
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  const text = htmlToText(raw);
  return truncateText(text || "(no readable text found)", MAX_TEXT_CHARS);
}

/** POST {text} to a user webhook; optional Bearer secret; truncated reply. */
export async function callWebhook(wh: WebhookConfig, text: string): Promise<string> {
  assertHttpUrl(wh.url);
  const res = await fetch(wh.url.trim(), {
    method: "POST",
    signal: timeoutSignal(),
    headers: {
      "Content-Type": "application/json",
      ...(wh.secret?.trim() ? { Authorization: `Bearer ${wh.secret.trim()}` } : {}),
    },
    body: JSON.stringify(buildWebhookPayload(text)),
  });
  if (!res.ok) throw new Error(`Webhook "${wh.name}" failed: HTTP ${res.status}.`);
  const body = (await res.text()).slice(0, MAX_FETCH_BYTES);
  const trimmed = body.trim();
  return truncateText(trimmed || "(empty response)", MAX_WEBHOOK_RESPONSE_CHARS);
}
