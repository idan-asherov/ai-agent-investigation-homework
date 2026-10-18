import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 5900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

const setScenario = (scenario) =>
  fetch(`${BASE}/admin/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });

before(async () => {
  proc = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: String(PORT), SCENARIO: "none", ENABLE_ADMIN: "true" },
    stdio: "ignore",
  });
  await waitUp();
});
after(() => proc.kill());

test("none: health ok and payment succeeds", async () => {
  await setScenario("none");
  assert.equal((await fetch(`${BASE}/health`)).status, 200);
  const pay = await fetch(`${BASE}/api/pay`, { method: "POST" });
  assert.equal(pay.status, 200);
  assert.equal((await pay.json()).status, "success");
});

test("ext_down: payment returns 502, health stays ok", async () => {
  await setScenario("ext_down");
  assert.equal((await fetch(`${BASE}/health`)).status, 200);
  assert.equal((await fetch(`${BASE}/api/pay`, { method: "POST" })).status, 502);
});

test("db_down: health and payment return 503", async () => {
  await setScenario("db_down");
  assert.equal((await fetch(`${BASE}/health`)).status, 503);
  assert.equal((await fetch(`${BASE}/api/pay`, { method: "POST" })).status, 503);
});

test("latency: payment succeeds but takes at least 3.5 seconds", async () => {
  await setScenario("latency");
  const t = Date.now();
  const pay = await fetch(`${BASE}/api/pay`, { method: "POST" });
  assert.equal(pay.status, 200);
  assert.ok(Date.now() - t >= 3500);
});

test("admin endpoint rejects an unknown scenario", async () => {
  const r = await setScenario("nonsense");
  assert.equal(r.status, 400);
});

test("logs record the errors of the active scenario", async () => {
  await setScenario("db_down");
  await fetch(`${BASE}/api/pay`, { method: "POST" });
  const logs = await (await fetch(`${BASE}/logs`)).json();
  assert.ok(logs.some((l) => l.level === "ERROR"));
});
