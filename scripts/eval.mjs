#!/usr/bin/env node
// End-to-end evaluation of the multi-agent pipeline against the running compose stack.
// Usage: node scripts/eval.mjs [--runs 2] [--url http://localhost:3000]
// For every fault scenario it switches the backend, runs a full investigation and scores the result.
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const URL_BASE = arg("url", "http://localhost:3000");
const RUNS = Number(arg("runs", "1"));
const SCENARIOS = ["none", "ext_down", "db_down", "latency"];
const hasCJK = (t) => /[㐀-鿿]/.test(t || "");

async function setScenario(scenario) {
  const r = await fetch(`${URL_BASE}/api/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!r.ok) throw new Error(`cannot switch scenario (${r.status}): is the stack up with ENABLE_ADMIN=true?`);
}

async function investigate() {
  const started = Date.now();
  const res = await fetch(`${URL_BASE}/api/investigation`, { method: "POST" });
  const events = [];
  let buf = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) if (l.trim()) events.push(JSON.parse(l));
  }
  return { events, ms: Date.now() - started };
}

function score(expected, events, ms) {
  const get = (t) => events.find((e) => e.type === t);
  const reviews = events.filter((e) => e.type === "review");
  const report = get("report");
  const checks = {
    classified: get("classification")?.scenario === expected,
    agentsAgree: get("verification")?.agrees === true,
    hebrewClean: !!report && !hasCJK(report.report),
    hasPlan: (report?.plan?.length ?? 0) > 0,
    noRawHighRisk: (report?.plan ?? []).every((s) => s.risk !== "HIGH" || s.approval),
    saved: get("saved")?.ok === true,
    noError: !events.some((e) => e.type === "error"),
  };
  return { expected, checks, passed: Object.values(checks).every(Boolean), reviewRounds: reviews.length, challenged: reviews.filter((r) => r.verdict === "challenge").length, ms };
}

const results = [];
try {
  for (const scenario of SCENARIOS) {
    for (let run = 1; run <= RUNS; run++) {
      process.stdout.write(`${scenario} (run ${run}/${RUNS}) ... `);
      await setScenario(scenario);
      const { events, ms } = await investigate();
      const r = score(scenario, events, ms);
      results.push(r);
      const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
      console.log(r.passed ? `PASS  ${(ms / 1000).toFixed(1)}s` : `FAIL  ${failed.join(", ")}`);
    }
  }
} finally {
  await setScenario("none").catch(() => {});
}

// Reviewer sanity: does the reviewer challenge a deliberately wrong report, and approve a correct one?
const toolOut = (health, payment) => [
  { tool: "check_service_health", output: JSON.stringify({ health, payment }) },
];
const OK = { status: 200, body: { status: "ok" }, durationMs: 25 };
const REVIEW_CASES = [
  {
    name: "wrong: blames the database while the bank gateway failed",
    expect: "challenge",
    tools: toolOut(OK, { status: 502, body: { error: "Bad Gateway" }, durationMs: 30 }),
    report: "1. What was checked\nHealth and payment.\n2. Evidence\n/health 503, database disconnected.\n3. Root cause\nThe database is down.\n4. Recommended action\nRestart the database.",
  },
  {
    name: "wrong: claims an outage while everything is 200",
    expect: "challenge",
    tools: toolOut(OK, { status: 200, body: { status: "success" }, durationMs: 30 }),
    report: "1. What was checked\nHealth and payment.\n2. Evidence\nPayment returned 502 Bad Gateway.\n3. Root cause\nThe external bank gateway is down.\n4. Recommended action\nEscalate to the bank.",
  },
  {
    name: "correct: bank gateway 502",
    expect: "approved",
    tools: toolOut(OK, { status: 502, body: { error: "Bad Gateway" }, durationMs: 30 }),
    report: "1. What was checked\nHealth and payment.\n2. Evidence\n/health returned 200. /api/pay returned 502 Bad Gateway.\n3. Root cause\nThe external bank gateway is unavailable.\n4. Recommended action\nCheck connectivity to the bank gateway.",
  },
];
const reviewResults = [];
for (const c of REVIEW_CASES) {
  process.stdout.write(`reviewer: ${c.name} ... `);
  try {
    const r = await fetch(`${URL_BASE}/api/review-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolResults: c.tools, report: c.report }),
    });
    const v = await r.json();
    const ok = v.verdict === c.expect;
    reviewResults.push({ name: c.name, expect: c.expect, got: v.verdict, parsed: v.parsed, ok });
    console.log(ok ? "PASS" : `FAIL (got ${v.verdict})`);
  } catch (e) {
    reviewResults.push({ name: c.name, expect: c.expect, got: "error", ok: false });
    console.log("FAIL (" + e.message + ")");
  }
}
const reviewPassed = reviewResults.filter((r) => r.ok).length;

const passed = results.filter((r) => r.passed).length;
const pct = Math.round((passed / results.length) * 100);
console.log(`\nAccuracy: ${passed}/${results.length} (${pct}%)`);

const checkNames = Object.keys(results[0].checks);
let md = `# Eval report\n\nModel run at ${new Date().toISOString()}\n\n**Accuracy: ${passed}/${results.length} (${pct}%)**\n\n`;
md += `| scenario | result | time | review rounds | ${checkNames.join(" | ")} |\n|${"---|".repeat(4 + checkNames.length)}\n`;
for (const r of results) {
  md += `| ${r.expected} | ${r.passed ? "PASS" : "FAIL"} | ${(r.ms / 1000).toFixed(1)}s | ${r.reviewRounds} | ${checkNames.map((k) => (r.checks[k] ? "✓" : "✗")).join(" | ")} |\n`;
}
md += `\n## Reviewer sanity\n\n**${reviewPassed}/${reviewResults.length}** correct verdicts\n\n| case | expected | got | result |\n|---|---|---|---|\n`;
for (const r of reviewResults) md += `| ${r.name} | ${r.expect} | ${r.got} | ${r.ok ? "PASS" : "FAIL"} |\n`;
mkdirSync("eval-results", { recursive: true });
writeFileSync("eval-results/latest.md", md);
writeFileSync("eval-results/latest.json", JSON.stringify({ investigations: results, reviewer: reviewResults }, null, 2));
console.log("Saved eval-results/latest.md");
process.exit(passed === results.length && reviewPassed === reviewResults.length ? 0 : 1);
