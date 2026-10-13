import { tool } from "@openai/agents";
import { z } from "zod";

const BASE_URL = process.env.DEMO_SERVICE_URL || "http://backend:5002";

async function callDemoService(endpoint) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    const status = response.status;
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { rawResponse: text.slice(0, 150) };
    }

    return { status, body };
  } catch (error) {
    return {
      status: 500,
      body: { error: `Failed to connect to ${endpoint}: ${error.message}` },
    };
  }
}

export const checkServiceHealth = tool({
  name: "check_service_health",
  description: "Checks payment service health via /health endpoint",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ check_service_health executed");
    const health = await callDemoService("/health");
    return { health };
  },
});

export const getRecentLogs = tool({
  name: "get_recent_logs",
  description: "Returns recent log lines from /logs endpoint",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ get_recent_logs executed");
    const result = await callDemoService("/logs");

    if (!result.body || !Array.isArray(result.body)) {
      return result;
    }

    const trimmedLogs = result.body.map((line) => ({
      ...line,
      message: typeof line.message === "string" ? line.message.slice(0, 200) : line.message,
    }));

    return { status: result.status, logs: trimmedLogs };
  },
});

export const getProductionInfo = tool({
  name: "get_production_info",
  description: "Returns runtime and container configuration details from /version",
  parameters: z.object({}).optional(),
  async execute() {
    console.log("🛠️ get_production_info executed");
    const versionRes = await callDemoService("/version");

    return {
      environment: process.env.NODE_ENV || "production",
      runtime: "Node.js",
      version: versionRes.body?.version || "1.0.0",
      containerStatus: "running",
      serviceUrl: BASE_URL,
      details: versionRes.body,
    };
  },
});
