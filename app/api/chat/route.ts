import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { estimateCost, keysFromHeader, resolveAgentModel, FALLBACK_DEFAULT_MODEL } from "@/lib/llm-provider";
import { callLLMMetered } from "@/lib/usage-meter";
import { publish } from "@/lib/sse-bus";
import { searchMemories } from "@/lib/memory/memory-manager";

export const runtime = "nodejs";

const DEMO_REPLIES = [
  "Got it! I'm on standby in the office — give the team a goal and watch me work.",
  "Interesting… in demo mode my brain runs on canned lines. Add an API key in Settings for the real me.",
  "Noted! I'll bring it up at the next standup by the coffee machine.",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agentId, projectId, message, model, demoMode } = body as {
    agentId?: string;
    projectId?: string;
    message?: string;
    model?: string;
    demoMode?: boolean;
  };
  if (!agentId || !projectId || !message?.trim()) {
    return NextResponse.json({ error: "agentId, projectId and message are required" }, { status: 400 });
  }

  const db = await getDb();
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  const name = agent?.name ?? "Agent";
  const role = agent?.role ?? "teammate";

  publish({ projectId, kind: "agent-status", payload: { agentId, status: "talking", currentTaskId: null } });

  let reply: string;
  let cost = 0;
  if (demoMode ?? true) {
    await new Promise((r) => setTimeout(r, 700));
    reply = DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)];
  } else {
    try {
      const keys = keysFromHeader(req.headers.get("x-llm-keys"));
      const mems = await searchMemories(projectId, message, 3).catch(() => []);
      const memBlock = mems.length ? `\nWhat you remember about this project:\n${mems.map((m) => `- ${m.content}`).join("\n")}` : "";
      const modelRef = resolveAgentModel(model, FALLBACK_DEFAULT_MODEL);
      const { text, usage } = await callLLMMetered(
        {
          model: modelRef,
          apiKeys: keys,
          messages: [
            { role: "system", content: `You are ${name}, a ${role} working in a 2D simulated office. The CEO (user) is chatting with you directly. Stay in character, be concise (under 120 words).${memBlock}` },
            { role: "user", content: message },
          ],
        },
        { projectId, agentName: name }
      );
      reply = text || "(empty response)";
      if (usage) cost = estimateCost(modelRef, usage.promptTokens ?? 0, usage.completionTokens ?? 0);
    } catch {
      reply = "My LLM call failed — check the API key in Settings, or switch to demo mode.";
    }
  }

  publish({ projectId, kind: "agent-say", payload: { agentId, text: reply.slice(0, 140) } });
  publish({ projectId, kind: "agent-status", payload: { agentId, status: "idle", currentTaskId: null } });
  return NextResponse.json({ reply, cost });
}
