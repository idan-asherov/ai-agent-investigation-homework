import { run } from "@openai/agents";
import { investigatorAgent } from "./lib/agent.js";

async function main() {
  console.log("🕵️  מתחיל חקירת סוכן מול שירות התשלומים (דרך Ollama Qwen 2.5)...\n");

  const result = await run(investigatorAgent, "חקור את שירות התשלומים payment-service וזהה אם יש תקלה פעילה.", {
    maxTurns: 6,
  });

  console.log("\n📋 דו\"ח חקירה סופי:");
  console.log("-----------------------------------------");
  console.log(result.text || result.finalOutput || result.output || JSON.stringify(result, null, 2));
  console.log("-----------------------------------------");
}

main().catch((err) => {
  console.error("❌ שגיאה בהרצת החקירה:", err);
});
