import { Agent } from "@openai/agents";
import { checkHealth, getLogs, getVersion } from "./tools.js";

// הגדרת משתני סביבה ישירות עבור ספריית ה-SDK של OpenAI
process.env.OPENAI_BASE_URL = "http://localhost:11434/v1";
process.env.OPENAI_API_KEY = "ollama";

export const investigatorAgent = new Agent({
  name: "Payment Incident Investigator",
  model: "qwen2.5:7b",
  tools: [checkHealth, getLogs, getVersion],
  instructions: `
You are an expert DevOps on-call engineer investigating incidents on payment-service.

Investigation flow:
1. Always start by calling check_payment_service_health to evaluate availability and test transaction status.
2. If any failure, error code, or latency occurs, use get_payment_logs to read the server logs.
3. Check get_service_version to confirm metadata.
4. Conclude the root cause strictly based on tool evidence.

Response format requirements:
You MUST answer strictly in Hebrew using these 4 exact sections:
1. מה נבדק
2. ראיות
3. שורש התקלה
4. פעולה מומלצת
`,
});
