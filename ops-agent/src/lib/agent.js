import { Agent, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
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
// Traces would be uploaded to OpenAI (401 without a key, and we do not want to send data out).
setTracingDisabled(true);

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
4. Status code guide: 200 = healthy (a slow 200 means latency); 502 = the external bank gateway failed;
   503 or database errors in the logs = the database is unavailable.
5. Logs are HISTORY: they can contain old errors from before the service recovered (for example a line saying the
   scenario or configuration was switched). The CURRENT state is decided only by the latest /health and /api/pay
   results. If both are 200 and fast, the service is healthy now: mention old errors as past events, never as the root cause.
6. Write the final report in ENGLISH. Use short, plain sentences (max 15 words each), one fact per bullet,
   with exactly these 4 sections:
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
Translate the text you receive into simple, natural Hebrew (עברית) written with Hebrew letters.
Rules:
- Output ONLY the Hebrew translation. Never write Chinese, Korean, Japanese or any other language.
- Use short sentences. Do not mix English letters into Hebrew words.
- Keep technical identifiers exactly as written, in English: /health, /api/pay, /logs, 200, 502, 503, payment-service, MongoDB, numbers, timestamps, quoted values.
- Keep bullet points as bullet points (lines starting with "- ").
- Do not add, remove or invent facts. No introduction, no notes.
Use this glossary:
database = מסד הנתונים; service = שירות; payment = תשלום; health check = בדיקת בריאות; logs = לוגים;
connection = חיבור; connection refused = החיבור נדחה; timeout = חריגת זמן; unavailable = לא זמין;
bank gateway / external provider = שער הבנק / הספק החיצוני; root cause = שורש התקלה; latency = השהיה;
restart = הפעלה מחדש; check = לבדוק; production = סביבת ייצור; error = שגיאה; version = גרסה.
Example:
English: The health check returned 503. The database connection was refused.
Hebrew: בדיקת הבריאות החזירה 503. החיבור למסד הנתונים נדחה.
`,
  });
}

const REVIEW_INSTRUCTIONS = `
You are a senior SRE reviewing an incident report written by a colleague.
You receive RAW TOOL OUTPUT and the REPORT. Compare the report's facts and root cause with the raw output.

How to read the raw output:
- status 200 and fast = healthy; 200 with a high durationMs = latency problem.
- status 502 = the external bank gateway failed (the service itself is fine).
- status 503 or "database" errors = the database is unavailable.

Reply with ONLY one JSON object, no other text:
{"verdict":"approved"|"challenge","issues":["short issue"]}

Choose "challenge" ONLY if the report states a status code or root cause that CONTRADICTS the raw output
(for example blames the database when the output shows 502, or reports an outage when everything is 200).
Choose "approved" with an empty issues list when the report's status codes and root cause match the raw output.
Do NOT challenge for style, brevity, missing extra details, or because more checks could have been done.

Example A: raw output shows payment 502 and health 200; report says the bank gateway is unavailable.
Answer: {"verdict":"approved","issues":[]}
Example B: raw output shows payment 502; report says the database is down.
Answer: {"verdict":"challenge","issues":["Report blames the database but the output shows a 502 from the bank gateway"]}
`;

// Agent 2: skeptical reviewer. No tools: it only compares the report with the raw tool output.
// Structured output (JSON schema) makes a small model return a parseable verdict.
export const reviewer = new Agent({
  name: "Skeptical Reviewer",
  model: MODEL,
  modelSettings: { temperature: 0 },
  outputType: z.object({ verdict: z.enum(["approved", "challenge"]), issues: z.array(z.string()) }),
  instructions: REVIEW_INSTRUCTIONS,
});

// Fallback when the server rejects structured output: same instructions, free text, parsed leniently.
export const reviewerPlain = new Agent({
  name: "Skeptical Reviewer (plain)",
  model: MODEL,
  modelSettings: { temperature: 0 },
  instructions: REVIEW_INSTRUCTIONS,
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
export const translatorRetry2 = makeTranslator(0.8);

export default agent;
