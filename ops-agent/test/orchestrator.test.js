import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestrate, MAX_REVIEW_ROUNDS } from "../src/lib/orchestrator.js";

const REPORT = "1. What was checked\nhealth\n2. Evidence\n502\n3. Root cause\nbank gateway 502\n4. Recommended action\ncheck gateway";
const TOOL = {
  tool: "check_service_health",
  output: JSON.stringify({ health: { status: 200, body: {} }, payment: { status: 502, body: {} } }),
};

function fakeDeps({ verdicts, saveResult = { ok: true, id: "abc" } }) {
  const calls = { investigate: 0, review: 0, plan: 0 };
  return {
    calls,
    investigate: async (_p, onTool) => {
      calls.investigate++;
      onTool({ type: "tool_called", tool: TOOL.tool });
      onTool({ type: "tool_output", tool: TOOL.tool, output: TOOL.output });
      return { text: REPORT, toolResults: [TOOL] };
    },
    review: async () => verdicts[Math.min(calls.review++, verdicts.length - 1)],
    plan: async () => {
      calls.plan++;
      return "1. Check the bank gateway | Risk: LOW | Approval: no\n2. Restart the service | Risk: HIGH | Approval: no";
    },
    translate: async (t) => "HE:" + t,
    save: async () => saveResult,
  };
}

async function collect(deps) {
  const events = [];
  for await (const e of orchestrate(deps)) events.push(e);
  return events;
}

test("approved on the first review: one investigation, full event sequence", async () => {
  const deps = fakeDeps({ verdicts: ['{"verdict":"approved","issues":[]}'] });
  const events = await collect(deps);
  assert.equal(deps.calls.investigate, 1);
  const types = events.map((e) => e.type);
  for (const t of ["classification", "review", "verification", "report", "saved", "done"]) assert.ok(types.includes(t), t);
  assert.equal(events.find((e) => e.type === "classification").scenario, "ext_down");
  assert.equal(events.find((e) => e.type === "verification").agrees, true);
});

test("a challenge triggers a second investigation, then approval ends the loop", async () => {
  const deps = fakeDeps({
    verdicts: ['{"verdict":"challenge","issues":["root cause unsupported"]}', '{"verdict":"approved","issues":[]}'],
  });
  const events = await collect(deps);
  assert.equal(deps.calls.investigate, 2);
  assert.equal(events.filter((e) => e.type === "review").length, 2);
});

test("a reviewer that always challenges is stopped after the maximum rounds", async () => {
  const deps = fakeDeps({ verdicts: ['{"verdict":"challenge","issues":["x"]}'] });
  const events = await collect(deps);
  assert.equal(events.filter((e) => e.type === "review").length, MAX_REVIEW_ROUNDS);
  assert.equal(deps.calls.investigate, MAX_REVIEW_ROUNDS);
  assert.ok(events.some((e) => e.type === "report"));
});

test("tool events are forwarded with the agent name", async () => {
  const events = await collect(fakeDeps({ verdicts: ['{"verdict":"approved","issues":[]}'] }));
  const t = events.find((e) => e.type === "tool_called");
  assert.equal(t.agent, "investigator");
});

test("plan steps are translated and HIGH risk requires approval", async () => {
  const events = await collect(fakeDeps({ verdicts: ['{"verdict":"approved","issues":[]}'] }));
  const { plan } = events.find((e) => e.type === "report");
  assert.equal(plan.length, 2);
  assert.match(plan[0].actionHe, /^HE:/);
  assert.equal(plan[1].approval, true);
});

test("a failed DB save is reported, not swallowed", async () => {
  const deps = fakeDeps({ verdicts: ['{"verdict":"approved","issues":[]}'], saveResult: { ok: false, error: "connect ECONNREFUSED" } });
  const saved = (await collect(deps)).find((e) => e.type === "saved");
  assert.equal(saved.ok, false);
  assert.match(saved.error, /ECONNREFUSED/);
});

test("an investigator failure propagates so the route can report an error", async () => {
  const deps = fakeDeps({ verdicts: ["{}"] });
  deps.investigate = async () => {
    throw new Error("ollama down");
  };
  await assert.rejects(collect(deps), /ollama down/);
});
