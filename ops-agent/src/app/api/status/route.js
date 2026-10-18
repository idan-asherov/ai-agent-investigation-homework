import { pingDb } from "@/lib/db.js";

export const dynamic = "force-dynamic";

const BACKEND = process.env.PAYMENT_SERVICE_URL || "http://localhost:5002";
const OLLAMA = process.env.OPENAI_BASE_URL || "http://localhost:11434/v1";

async function probe(url) {
  const started = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { ok: r.ok, status: r.status, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function GET() {
  const [mongo, backend, ollama] = await Promise.all([
    pingDb(),
    probe(`${BACKEND}/health`),
    probe(`${OLLAMA}/models`),
  ]);
  return Response.json({ mongo, backend, ollama, model: process.env.OLLAMA_MODEL || "qwen2.5:7b" });
}
