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

// Stage 2: translate the English report to Hebrew (no tools, nothing to decide)
export const translator = new Agent({
  name: "Hebrew Translator",
  model: MODEL,
  modelSettings: { temperature: 0 },
  instructions: `
Translate the incident report you receive into clear, natural Hebrew (עברית).
Rules:
- Output ONLY the Hebrew translation. Never write Chinese (中文) or any other language.
- Keep exactly 4 numbered sections with these Hebrew headings:
  1. מה נבדק
  2. ראיות
  3. שורש התקלה
  4. פעולה מומלצת
- Keep technical identifiers, paths, status codes, numbers and timestamps exactly as written (e.g. /health, 200, 502, payment-service).
- Do not add, remove or invent facts.
`,
});

export default agent;
