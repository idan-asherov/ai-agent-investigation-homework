import { tool } from "@openai/agents";
import { z } from "zod";

const BASE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:5002";

async function callService(endpoint) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const status = res.status;
    const data = await res.json().catch(() => null);
    return { status, data };
  } catch (err) {
    return {
      status: 500,
      data: { error: `Failed to query ${endpoint}: ${err.message}` },
    };
  }
}

export const checkHealth = tool({
  name: "check_payment_service_health",
  description: "Checks payment service health endpoint and tests a transaction on /api/pay",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ Tool executed: check_payment_service_health");
    const health = await callService("/health");
    const payment = await callService("/api/pay");
    return { health, payment };
  },
});

export const getLogs = tool({
  name: "get_payment_logs",
  description: "Retrieves recent stdout/stderr error and warning logs",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ Tool executed: get_payment_logs");
    const result = await callService("/logs");
    return { logs: result.data };
  },
});

export const getVersion = tool({
  name: "get_service_version",
  description: "Fetches running service metadata and active environment version",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ Tool executed: get_service_version");
    const result = await callService("/version");
    return { versionInfo: result.data };
  },
});
