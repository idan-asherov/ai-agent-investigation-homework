import { realDeps } from "@/lib/runner.js";
import { reviewPrompt } from "@/lib/orchestrator.js";
import { parseVerdict } from "@/lib/text.js";

export const dynamic = "force-dynamic";

// Used by scripts/eval.mjs to check that the reviewer really catches a wrong report.
// Body: { toolResults: [{tool, output}], report: "..." }
export async function POST(req) {
  try {
    const { toolResults, report } = await req.json();
    const out = await realDeps().review(reviewPrompt(toolResults, report));
    return Response.json(parseVerdict(out));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
