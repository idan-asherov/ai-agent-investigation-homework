import { orchestrate } from "@/lib/orchestrator.js";
import { realDeps } from "@/lib/runner.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of orchestrate(realDeps())) {
          if (req.signal.aborted) break;
          send(event);
        }
      } catch (error) {
        send({ type: "error", message: error.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
