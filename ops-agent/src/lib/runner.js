// Real dependencies for the orchestrator: Ollama-backed agents and MongoDB.
import { run } from "@openai/agents";
import opsAgent, { reviewer, planner, translator, translatorRetry } from "./agent.js";
import { hasCJK } from "./text.js";
import { saveInvestigation } from "./db.js";

const TURN_TIMEOUT = 90000;

async function translate(text) {
  for (const agent of [translator, translatorRetry]) {
    try {
      const out = (await run(agent, text, { maxTurns: 2, signal: AbortSignal.timeout(60000) })).finalOutput;
      if (out && !hasCJK(out)) return out.trim();
      console.warn("Translation rejected:", String(out).slice(0, 120));
    } catch (err) {
      console.warn("Translation error:", err.message);
    }
  }
  return null;
}

async function investigate(prompt, onTool) {
  const toolResults = [];
  let currentTool = "";
  const result = await run(opsAgent, prompt, { stream: true, maxTurns: 6, signal: AbortSignal.timeout(TURN_TIMEOUT) });
  for await (const event of result) {
    if (event.name === "tool_called" || event.type === "tool_called") {
      currentTool = event.item?.rawItem?.name || event.tool || "unknown_tool";
      onTool({ type: "tool_called", tool: currentTool });
    }
    if (event.name === "tool_output" || event.type === "tool_output") {
      const output = event.item?.output || event.output;
      onTool({ type: "tool_output", tool: currentTool, output });
      toolResults.push({ tool: currentTool, output });
    }
  }
  await result.completed;
  if (result.cancelled) throw new Error("החקירה נעצרה עקב חריגת זמן");
  return { text: result.finalOutput || "", toolResults };
}

const ask = (agent) => async (prompt) =>
  (await run(agent, prompt, { maxTurns: 2, signal: AbortSignal.timeout(TURN_TIMEOUT) })).finalOutput || "";

export function realDeps() {
  return { investigate, review: ask(reviewer), plan: ask(planner), translate, save: saveInvestigation };
}
