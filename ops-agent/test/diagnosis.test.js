import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, matchesDiagnosis } from "../src/lib/diagnosis.js";

const check = (health, payment) => [{ tool: "check_service_health", output: JSON.stringify({ health, payment }) }];
const ok = { status: 200, body: { status: "ok" }, durationMs: 20 };

test("healthy service", () => {
  assert.equal(classify(check(ok, { ...ok, body: { status: "success" } })).scenario, "none");
});

test("db_down: health 503", () => {
  const r = classify(check({ status: 503, body: { db: "disconnected" } }, { status: 503, body: { message: "Database transaction failed" } }));
  assert.equal(r.scenario, "db_down");
  assert.equal(r.severity, "critical");
});

test("ext_down: payment 502 while health is ok", () => {
  assert.equal(classify(check(ok, { status: 502, body: {} })).scenario, "ext_down");
});

test("latency: 200 but slow payment", () => {
  assert.equal(classify(check(ok, { status: 200, body: {}, durationMs: 4100 })).scenario, "latency");
});

test("unreachable: both calls failed to connect", () => {
  const dead = { status: 500, body: { error: "Failed to connect to /health: fetch failed" } };
  assert.equal(classify(check(dead, dead)).scenario, "unreachable");
});

test("unknown when the check tool never ran", () => {
  assert.equal(classify([]).scenario, "unknown");
});

test("accepts tool output that is already an object", () => {
  const out = classify([{ tool: "check_service_health", output: { health: ok, payment: { status: 502, body: {} } } }]);
  assert.equal(out.scenario, "ext_down");
});

test("matchesDiagnosis agrees with a correct report", () => {
  assert.equal(matchesDiagnosis("ext_down", "Root cause: bank gateway returned 502"), true);
  assert.equal(matchesDiagnosis("latency", "Payments take 4 seconds, high latency"), true);
});

test("matchesDiagnosis rejects a wrong report", () => {
  assert.equal(matchesDiagnosis("ext_down", "The database is down (503)"), false);
});

test("a healthy report must not claim a 5xx error", () => {
  assert.equal(matchesDiagnosis("none", "Service healthy"), true);
  assert.equal(matchesDiagnosis("none", "Service healthy but 502 seen"), false);
});
