import { run } from "@openai/agents";
import opsAgent from "@/lib/agent.js";
import { saveInvestigation } from "@/lib/db.js";

export async function POST(req) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      const toolsResults = [];
      let currentTool = "";

      try {
        const result = await run(opsAgent, "חקור את שירות ה-orders-api ובדוק מה מצבו.", {
          stream: true,
          maxTurns: 6,
          signal: AbortSignal.any([
            req.signal,
            AbortSignal.timeout(60000),
          ]),
        });

        for await (const event of result) {
          if (event.name === "tool_called" || event.type === "tool_called") {
            currentTool = event.item?.rawItem?.name || event.tool || "unknown_tool";
            send({ type: "tool_called", tool: currentTool });
          }

          if (event.name === "tool_output" || event.type === "tool_output") {
            const output = event.item?.output || event.output;
            send({ type: "tool_output", output });
            toolsResults.push({ tool: currentTool, output });
          }
        }

        await result.completed;

        if (result.cancelled) {
          throw new Error("החקירה נעצרה עקב ניתוק דפדפן או חריגת זמן");
        }

        const report = result.finalOutput || "לא התקבל דו\"ח מסכם.";
        send({ type: "report", report });

        if (typeof saveInvestigation === "function") {
          await saveInvestigation({
            createdAt: new Date(),
            toolsResults,
            report,
          }).catch((err) => console.error("DB Save Error:", err.message));
        }
      } catch (error) {
        send({ type: "error", error: error.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
