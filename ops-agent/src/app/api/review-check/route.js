import { run } from "@openai/agents";
import { reviewer } from "@/lib/agent.js";
import { reviewPrompt } from "@/lib/orchestrator.js";
import { parseVerdict } from "@/lib/text.js";

export const dynamic = "force-dynamic";

// Used by scripts/eval.mjs to check that the reviewer really catches a wrong report.
// Body: { toolResults: [{tool, output}], report: "..." }
export async function POST(req) {
  try {
    const { toolResults, report } = await req.json();
    const out = (await run(reviewer, reviewPrompt(toolResults, report), { maxTurns: 2, signal: AbortSignal.timeout(90000) })).finalOutput;
    return Response.json(parseVerdict(out));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
