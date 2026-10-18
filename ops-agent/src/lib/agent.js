import { Agent, setDefaultOpenAIClient, setOpenAIAPI } from "@openai/agents";
import OpenAI from "openai";
import {
  checkServiceHealth,
  getRecentLogs,
  getProductionInfo,
} from "./tools.js";

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
});

setDefaultOpenAIClient(client);
// Ollama exposes the Chat Completions API, not the Responses API
setOpenAIAPI("chat_completions");

const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

// Stage 1: investigate in English (small models call tools and reason best in English)
const agent = new Agent({
  name: "Payment Incident Investigator",
  model: MODEL,
  modelSettings: { temperature: 0.2 },
  tools: [checkServiceHealth, getRecentLogs, getProductionInfo],
  instructions: `
You are an expert DevOps on-call engineer investigating incidents on payment-service.
Your goal is to identify the root cause using the available tools. Base every claim on tool output only.

Flow:
1. Use check_service_health to check /health and a test payment (/api/pay).
2. If degraded or failing, use get_recent_logs to find errors.
3. Use get_production_info to inspect the runtime environment.
4. Write the final report in ENGLISH, with exactly these 4 sections:
   1. What was checked
   2. Evidence
   3. Root cause
   4. Recommended action
`,
});

// Stage 2: translate English text to Hebrew (no tools). Called per report section.
function makeTranslator(temperature) {
  return new Agent({
    name: "Hebrew Translator",
    model: MODEL,
    modelSettings: { temperature },
    instructions: `
Translate the text you receive into clear, natural Hebrew (עברית).
Rules:
- Output ONLY the Hebrew translation. Never write Chinese (中文) or any other language.
- Keep technical identifiers, paths, status codes, numbers, timestamps and quoted values exactly as written (e.g. /health, 200, 502, payment-service, tx_123).
- Keep bullet points as bullet points (lines starting with "- ").
- Do not add, remove or invent facts. No introduction, no notes.
`,
  });
}

// Agent 2: skeptical reviewer. No tools: it only compares the report with the raw tool output.
export const reviewer = new Agent({
  name: "Skeptical Reviewer",
  model: MODEL,
  modelSettings: { temperature: 0 },
  instructions: `
You are a skeptical senior SRE reviewing an incident report written by a colleague.
You receive RAW TOOL OUTPUT and the REPORT. Check every claim in the report against the raw output.
Reply with ONLY one JSON object, no other text:
{"verdict":"approved"|"challenge","issues":["short issue 1","short issue 2"]}
Use "challenge" only if: a claim is not supported by the tool output, the root cause contradicts the status codes,
a failing status code or error log was ignored, or a required section is missing. Otherwise use "approved" with an empty issues list.
`,
});

// Agent 3: remediation planner. No tools: it proposes, a human approves. It never executes anything.
export const planner = new Agent({
  name: "Remediation Planner",
  model: MODEL,
  modelSettings: { temperature: 0.2 },
  instructions: `
You are a remediation planner for an on-call team. You receive an incident report.
Write at most 4 steps. Each step is ONE line in exactly this format:
N. <concrete action> | Risk: <LOW|MEDIUM|HIGH> | Approval: <yes|no>
Rules: any step that changes production needs Approval: yes. Read-only checks may use Approval: no.
You never claim to have executed anything. If the service is healthy, propose monitoring steps only.
Output only the numbered lines.
`,
});

export const translator = makeTranslator(0);
// Used for a retry: a different temperature gives a different sample than the first attempt
export const translatorRetry = makeTranslator(0.4);

export default agent;
