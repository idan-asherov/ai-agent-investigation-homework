export const dynamic = "force-dynamic";

const BACKEND = process.env.PAYMENT_SERVICE_URL || "http://localhost:5002";

// Thin proxy to the backend admin endpoint (only works when the backend runs with ENABLE_ADMIN=true).
export async function GET() {
  try {
    const r = await fetch(`${BACKEND}/admin/scenario`, { signal: AbortSignal.timeout(3000) });
    return Response.json(await r.json(), { status: r.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 503 });
  }
}

export async function POST(req) {
  try {
    const { scenario } = await req.json();
    const r = await fetch(`${BACKEND}/admin/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
      signal: AbortSignal.timeout(3000),
    });
    return Response.json(await r.json(), { status: r.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 503 });
  }
}
