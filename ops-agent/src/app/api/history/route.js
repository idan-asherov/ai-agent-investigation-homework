import { listInvestigations } from "@/lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ ok: true, items: await listInvestigations(20) });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, items: [] }, { status: 503 });
  }
}
