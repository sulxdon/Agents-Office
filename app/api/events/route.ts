import { NextRequest } from "next/server";
import { recentEvents, subscribe } from "@/lib/sse-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const encoder = new TextEncoder();
  // catch-up snapshot from the durable outbox (survives restarts)
  const replay = await recentEvents(projectId);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          /* closed */
        }
      };
      // catch-up: replay recent history so reloads don't miss state
      for (const ev of replay) {
        send(`data: ${JSON.stringify(ev)}\n\n`);
      }
      const unsub = subscribe((ev) => {
        if (ev.projectId !== projectId) return;
        send(`data: ${JSON.stringify(ev)}\n\n`);
      });
      const heartbeat = setInterval(() => {
        send(`: ping ${Date.now()}\n\n`);
      }, 20000);
      // cleanup hook when the client disconnects
      const close = () => {
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
