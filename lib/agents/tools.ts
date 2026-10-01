import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { searchMemories } from "@/lib/memory/memory-manager";
import { readWhiteboard, writeWhiteboard } from "@/lib/whiteboard";
import { readArtifact, writeArtifact } from "@/lib/artifacts";
import { orchestrateAskTeammate } from "./collaboration";
import { emitTool, summarizeForFeed } from "./live";
import { FALLBACK_DEFAULT_MODEL, type ApiKeys } from "@/lib/llm-provider";
import {
  activeWebhooks,
  callWebhook,
  webFetch,
  webhookToolName,
  type WebhookConfig,
} from "@/lib/integrations";

/** Extra context so tools can act on behalf of the running worker. */
export interface AgentToolContext {
  agentId?: string;
  agentName?: string;
  taskId?: string;
  model?: string;
  keys?: ApiKeys;
  demoMode?: boolean;
  /** User-defined webhooks (sent per-request, never stored server-side). */
  webhooks?: WebhookConfig[];
}

export function agentTools(projectId: string, officeId: string, ctx: AgentToolContext = {}): ToolSet {
  const tools: ToolSet = {
    search_project_memory: tool({
      description: "Search the project's long-term memory for decisions, facts, and learnings.",
      parameters: z.object({ query: z.string().describe("What to look up") }),
      execute: async ({ query }: { query: string }) => {
        const hits = await searchMemories(projectId, query, 5);
        return hits.map((h) => `[${h.type}] ${h.content}`).join("\n") || "No relevant memories.";
      },
    }),
    read_whiteboard: tool({
      description: "Read the shared whiteboard in this office room. All agents in the room see it.",
      parameters: z.object({}),
      execute: async () => (await readWhiteboard(officeId)) || "(whiteboard is empty)",
    }),
    write_whiteboard: tool({
      description: "Write or update the shared whiteboard so teammates can see the context.",
      parameters: z.object({ content: z.string() }),
      execute: async ({ content }: { content: string }) => {
        await writeWhiteboard(officeId, content);
        return "Whiteboard updated.";
      },
    }),
    report_progress: tool({
      description: "Report a short status update about the current task. This appears in the office activity feed.",
      parameters: z.object({ update: z.string() }),
      execute: async ({ update }: { update: string }) => `Noted: ${update}`,
    }),
    ask_teammate: tool({
      description:
        "Walk over to a teammate and ask them a question. Use this when you need input, a review, or domain help from a specific teammate by name.",
      parameters: z.object({
        teammate: z.string().describe("Name of the teammate to ask"),
        question: z.string().describe("Your question for them"),
      }),
      execute: async ({ teammate, question }: { teammate: string; question: string }) => {
        if (!ctx.agentId) return "You are not running as a known agent.";
        return orchestrateAskTeammate({
          projectId,
          requesterId: ctx.agentId,
          teammateName: teammate,
          question,
          taskId: ctx.taskId ?? null,
          model: ctx.model ?? FALLBACK_DEFAULT_MODEL,
          keys: ctx.keys ?? {},
          demoMode: ctx.demoMode ?? true,
        });
      },
    }),
    write_artifact: tool({
      description:
        "Save a deliverable file (spec, code, notes, report) so it persists with the task. Always save your main deliverable with this tool. The filename must be a plain name like 'spec.md' (no folders or path separators).",
      parameters: z.object({
        filename: z.string().describe("Plain filename, e.g. 'spec.md'"),
        content: z.string().describe("Full file content"),
      }),
      execute: async ({ filename, content }: { filename: string; content: string }) => {
        try {
          const rel = await writeArtifact(projectId, ctx.taskId ?? null, filename, content);
          return `Saved artifact: ${rel}`;
        } catch (e) {
          return `Could not save artifact: ${(e as Error).message}`;
        }
      },
    }),
    read_artifact: tool({
      description: "Read a previously saved artifact file by its plain filename.",
      parameters: z.object({ filename: z.string().describe("Plain filename, e.g. 'spec.md'") }),
      execute: async ({ filename }: { filename: string }) => {
        try {
          return await readArtifact(projectId, filename);
        } catch (e) {
          return `Could not read artifact: ${(e as Error).message}`;
        }
      },
    }),
    web_fetch: tool({
      description:
        "Fetch a web page (http/https) and read its text content. No API key needed. Use for docs, references, and research.",
      parameters: z.object({ url: z.string().describe("Full http(s) URL to fetch") }),
      execute: async ({ url }: { url: string }) => {
        try {
          return await webFetch(url);
        } catch (e) {
          return `Could not fetch that URL: ${(e as Error).message}`;
        }
      },
    }),
  };
  // G8 user webhooks: one call_<name> tool per configured webhook.
  // Names are sanitized to [a-z0-9_] and deduped with a numeric suffix.
  const seen = new Set(Object.keys(tools));
  for (const wh of activeWebhooks(ctx.webhooks)) {
    let name = webhookToolName(wh.name);
    for (let n = 2; seen.has(name); n++) name = `${webhookToolName(wh.name)}_${n}`;
    seen.add(name);
    const hook = wh;
    tools[name] = tool({
      description: `Call the "${hook.name}" integration with a text message. Returns its response.`,
      parameters: z.object({ text: z.string().describe("Message to send to the integration") }),
      execute: async ({ text }: { text: string }) => {
        try {
          return await callWebhook(hook, text);
        } catch (e) {
          return `Webhook "${hook.name}" failed: ${(e as Error).message}`;
        }
      },
    });
  }
  // G3 live feed: wrap every execute fn so tool calls + result summaries
  // stream to the per-agent thinking feed as agent-tool SSE events.
  if (ctx.agentId) {
    const agentId = ctx.agentId;
    const taskId = ctx.taskId ?? null;
    for (const [name, t] of Object.entries(tools)) {
      const holder = t as unknown as { execute?: (...a: never[]) => PromiseLike<unknown> };
      const orig = holder.execute;
      if (typeof orig !== "function") continue;
      holder.execute = async (...a: never[]): Promise<unknown> => {
        emitTool(projectId, agentId, name, "start", summarizeForFeed(a[0]), taskId);
        try {
          const result: unknown = await orig(...a);
          emitTool(projectId, agentId, name, "done", summarizeForFeed(result), taskId);
          return result;
        } catch (err) {
          emitTool(projectId, agentId, name, "done", `Failed: ${(err as Error).message}`.slice(0, 120), taskId);
          throw err;
        }
      };
    }
  }
  return tools;
}
