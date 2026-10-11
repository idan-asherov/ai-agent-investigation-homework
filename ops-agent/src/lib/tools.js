import { tool } from "@openai/agents";

export const checkServiceHealth = tool({
  name: "check_service_health",
  description: "Check the health status of the payment service",
  parameters: {},
  execute: async () => {
    try {
      const res = await fetch("http://localhost:5002/health");
      const data = await res.json();
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ status: "error", message: err.message });
    }
  },
});

export const getRecentLogs = tool({
  name: "get_recent_logs",
  description: "Fetch recent logs from the payment service",
  parameters: {},
  execute: async () => {
    try {
      const res = await fetch("http://localhost:5002/logs");
      const data = await res.json();
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ status: "error", message: err.message });
    }
  },
});

export const getProductionInfo = tool({
  name: "get_production_info",
  description: "Get deployment and production environment metadata",
  parameters: {},
  execute: async () => {
    try {
      const res = await fetch("http://localhost:5002/production-info");
      const data = await res.json();
      return JSON.stringify(data);
    } catch (err) {
      return JSON.stringify({ status: "error", message: err.message });
    }
  },
});
