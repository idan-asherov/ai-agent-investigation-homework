import { Agent, setDefaultOpenAIClient } from "@openai/agents";
import OpenAI from "openai";
import {
  checkServiceHealth,
  getRecentLogs,
  getProductionInfo,
} from "./tools.js";

const client = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});

setDefaultOpenAIClient(client);

const agent = new Agent({
  name: "Payment Incident Investigator",
  model: "qwen2.5:7b",
  tools: [checkServiceHealth, getRecentLogs, getProductionInfo],
  instructions: `
You are an expert DevOps on-call engineer investigating incidents on payment-service.
Your goal is to identify the root cause using the available tools.

Flow:
1. Use check_service_health to check status.
2. If degraded or failing, use get_recent_logs to find errors.
3. Use get_production_info to inspect the runtime environment.
4. Output your analysis strictly in Hebrew with 4 sections:
1. מה נבדק
2. ראיות
3. שורש התקלה
4. פעולה מומלצת
`,
});

export default agent;
