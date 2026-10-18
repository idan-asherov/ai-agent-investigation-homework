import { classify, matchesDiagnosis } from "./diagnosis.js";
import { parseVerdict, parsePlan, splitEnglish, SECTIONS } from "./text.js";

export const BASE_PROMPT = "Investigate payment-service and determine its current state.";
export const MAX_REVIEW_ROUNDS = 2;

const clip = (v, n) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export function reviewPrompt(toolResults, report) {
  const raw = toolResults.map((r) => `[${r.tool}] ${clip(r.output, 1500)}`).join("\n");
  return `RAW TOOL OUTPUT:\n${raw}\n\nREPORT:\n${report}`;
}

export function revisionPrompt(report, issues) {
  return `${BASE_PROMPT}\n\nA reviewer challenged your previous report.\nPREVIOUS REPORT:\n${report}\n\nISSUES:\n${issues
    .map((i) => `- ${i}`)
    .join("\n")}\n\nThe current /health and /api/pay status codes override anything in the logs.\nRe-check with the tools if needed and write a corrected report in the same 4-section format.`;
}

const CURRENT_STATE = {
  none: "healthy: everything returns 200 and is fast; old log errors are past events",
  ext_down: "an external bank gateway failure (payment returns 502)",
  db_down: "a database outage (503 or database errors on the current checks)",
  latency: "slow payments (200 but slower than 3 seconds)",
  unreachable: "the service is unreachable (connection failures)",
  unknown: "unknown",
};

// Last resort when the report still contradicts the rule engine: give the investigator the engine's ruling.
export function refereePrompt(report, classification) {
  return `${BASE_PROMPT}\n\nA deterministic rule engine that reads only the CURRENT status codes classified the state as: ${
    CURRENT_STATE[classification.scenario] || classification.scenario
  } (${(classification.evidence || []).join("; ")}).\nYour previous report contradicts that.\nPREVIOUS REPORT:\n${report}\n\nLogs are history, not the current state. Re-check with the tools and write a corrected report in the same 4-section format that is consistent with the current status codes.`;
}

// Translate a full report section by section (one bad section never discards the others).
export async function translateReport(english, translate) {
  const parts = splitEnglish(english);
  if (!parts) {
    const whole = await translate(english);
    return whole ?? "⚠️ התרגום לעברית נכשל. הדוח באנגלית:\n\n" + english;
  }
  const out = [];
  for (const [i, [en, he]] of SECTIONS.entries()) {
    const part = parts.find((p) => p.en === en.toLowerCase());
    if (!part) continue;
    const hebrew = await translate(part.body);
    out.push(`${i + 1}. ${he}\n${hebrew ?? "(התרגום נכשל, המקור באנגלית)\n" + part.body}`);
  }
  return out.join("\n\n");
}

// Await a promise while yielding events that were queued meanwhile, so tool steps reach the UI live.
async function* drive(promise, queue) {
  let done = false, value, error;
  promise.then((v) => { value = v; done = true; }, (e) => { error = e; done = true; });
  while (!done) {
    while (queue.length) yield queue.shift();
    await new Promise((r) => setTimeout(r, 40));
  }
  while (queue.length) yield queue.shift();
  if (error) throw error;
  return value;
}

/**
 * The multi-agent pipeline as an async generator of UI events.
 * All I/O (LLM calls, DB) comes in through `deps`, so tests can run it with fakes.
 *
 * deps.investigate(prompt, onTool) -> { text, toolResults }   (agent 1, with tools)
 * deps.review(prompt)  -> text                                 (agent 2)
 * deps.plan(prompt)    -> text                                 (agent 3)
 * deps.translate(text) -> string | null                        (translator)
 * deps.save(doc)       -> { ok, id?, error? }
 */
export async function* orchestrate(deps) {
  const started = Date.now();
  const toolResults = [];
  const queue = [];
  const onTool = (ev) => queue.push({ ...ev, agent: "investigator" });

  yield { type: "agent", agent: "investigator", status: "start", round: 0 };
  const first = yield* drive(deps.investigate(BASE_PROMPT, onTool), queue);
  let report = first.text;
  toolResults.push(...first.toolResults);
  yield { type: "agent", agent: "investigator", status: "done", round: 0 };

  const classification = classify(toolResults);
  yield { type: "classification", ...classification };

  const reviews = [];
  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    yield { type: "agent", agent: "reviewer", status: "start", round };
    const verdict = parseVerdict(await deps.review(reviewPrompt(toolResults, report)));
    reviews.push({ round, ...verdict });
    yield { type: "review", round, ...verdict };
    yield { type: "agent", agent: "reviewer", status: "done", round };
    if (verdict.verdict === "approved" || round === MAX_REVIEW_ROUNDS) break;

    yield { type: "agent", agent: "investigator", status: "start", round };
    const revised = yield* drive(deps.investigate(revisionPrompt(report, verdict.issues), onTool), queue);
    toolResults.push(...revised.toolResults);
    if (revised.text) report = revised.text;
    yield { type: "agent", agent: "investigator", status: "done", round };
  }

  let agrees = matchesDiagnosis(classification.scenario, report);
  let refereed = false;
  if (!agrees && report && classification.scenario !== "unknown") {
    refereed = true;
    yield { type: "agent", agent: "investigator", status: "start", round: MAX_REVIEW_ROUNDS + 1, referee: true };
    const ruled = yield* drive(deps.investigate(refereePrompt(report, classification), onTool), queue);
    toolResults.push(...ruled.toolResults);
    if (ruled.text) report = ruled.text;
    yield { type: "agent", agent: "investigator", status: "done", round: MAX_REVIEW_ROUNDS + 1, referee: true };
    agrees = matchesDiagnosis(classification.scenario, report);
  }

  const verification = { expected: classification.scenario, agrees, refereed };
  yield { type: "verification", ...verification };

  yield { type: "agent", agent: "planner", status: "start" };
  const planPrompt = `INCIDENT REPORT:\n${report}`;
  let planEn = parsePlan(await deps.plan(planPrompt));
  if (!planEn.length) {
    // One retry with a stricter reminder: small models sometimes ignore the output format.
    planEn = parsePlan(
      await deps.plan(`${planPrompt}\n\nREMINDER: output ONLY numbered lines, each exactly: N. <action> | Risk: <LOW|MEDIUM|HIGH> | Approval: <yes|no>`)
    );
  }
  yield { type: "agent", agent: "planner", status: "done" };

  yield { type: "agent", agent: "translator", status: "start" };
  const reportHe = report ? await translateReport(report, deps.translate) : "לא התקבל דו\"ח מסכם.";
  const plan = [];
  for (const step of planEn) {
    plan.push({ ...step, actionHe: (await deps.translate(step.action)) ?? step.action });
  }
  yield { type: "agent", agent: "translator", status: "done" };

  yield { type: "report", report: reportHe, plan };

  const saved = await deps.save({
    createdAt: new Date(),
    durationMs: Date.now() - started,
    classification,
    verification,
    reviews,
    toolResults,
    reportEn: report,
    report: reportHe,
    plan,
  });
  yield { type: "saved", ...saved };
  yield { type: "done", durationMs: Date.now() - started };
}
