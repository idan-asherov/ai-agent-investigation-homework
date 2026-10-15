import { run } from "@openai/agents";
import opsAgent, { translator } from "@/lib/agent.js";
import { saveInvestigation } from "@/lib/db.js";

const PROMPT = "Investigate payment-service and determine its current state.";
const hasCJK = (t) => /[\u3400-\u9fff]/.test(t || "");

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
        const result = await run(opsAgent, PROMPT, {
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

        const english = result.finalOutput || "";
        let report = english || "לא התקבל דו\"ח מסכם.";

        // Stage 2: translate to Hebrew; retry once if the model drifts into Chinese
        if (english) {
          send({ type: "tool_called", tool: "translate_to_hebrew" });
          let hebrew = (await run(translator, english, { maxTurns: 2, signal: AbortSignal.timeout(60000) })).finalOutput;
          if (!hebrew || hasCJK(hebrew)) {
            hebrew = (await run(translator, "Translate to Hebrew ONLY, no Chinese:\n\n" + english, { maxTurns: 2, signal: AbortSignal.timeout(60000) })).finalOutput;
          }
          report = hebrew && !hasCJK(hebrew)
            ? hebrew
            : "⚠️ התרגום לעברית נכשל. הדוח באנגלית:\n\n" + english;
        }

        send({ type: "report", report });

        if (typeof saveInvestigation === "function") {
          await saveInvestigation({
            createdAt: new Date(),
            toolsResults,
            report,
          }).catch((err) => console.error("DB Save Error:", err.message));
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
      "Connection": "keep-alive",
    },
  });
}
