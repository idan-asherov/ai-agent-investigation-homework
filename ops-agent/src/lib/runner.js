// Real dependencies for the orchestrator: Ollama-backed agents and MongoDB.
import { run } from "@openai/agents";
import opsAgent, { reviewer, reviewerPlain, planner, translator, translatorRetry, translatorRetry2 } from "./agent.js";
import { isCleanHebrew } from "./text.js";
import { saveInvestigation } from "./db.js";

const TURN_TIMEOUT = 90000;

async function translate(text) {
  for (const agent of [translator, translatorRetry, translatorRetry2]) {
    try {
      const out = (await run(agent, text, { maxTurns: 2, signal: AbortSignal.timeout(60000) })).finalOutput;
      if (isCleanHebrew(out)) return out.trim();
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

async function review(prompt) {
  try {
    const out = (await run(reviewer, prompt, { maxTurns: 2, signal: AbortSignal.timeout(TURN_TIMEOUT) })).finalOutput;
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch (err) {
    console.warn("Structured review failed, falling back to plain text:", err.message);
    return ask(reviewerPlain)(prompt);
  }
}

export function realDeps() {
  return { investigate, review, plan: ask(planner), translate, save: saveInvestigation };
}
