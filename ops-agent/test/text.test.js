import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCJK, splitEnglish, parseVerdict, parsePlan } from "../src/lib/text.js";

test("hasCJK detects Chinese and ignores Hebrew/English", () => {
  assert.equal(hasCJK("服务不可用"), true);
  assert.equal(hasCJK("השירות תקין"), false);
  assert.equal(hasCJK("service ok"), false);
  assert.equal(hasCJK(undefined), false);
});

const REPORT = `1. What was checked
Health and payment.
2. Evidence
/health 200
3. Root cause
None.
4. Recommended action
Monitor.`;

test("splitEnglish returns the four sections in order", () => {
  const parts = splitEnglish(REPORT);
  assert.deepEqual(parts.map((p) => p.en), ["what was checked", "evidence", "root cause", "recommended action"]);
  assert.match(parts[1].body, /200/);
});

test("splitEnglish returns null for text without headings", () => {
  assert.equal(splitEnglish("just a paragraph"), null);
});

test("parseVerdict reads a clean JSON verdict", () => {
  const v = parseVerdict('{"verdict":"challenge","issues":["claims 500 but status was 502"]}');
  assert.equal(v.verdict, "challenge");
  assert.equal(v.issues.length, 1);
  assert.equal(v.parsed, true);
});

test("parseVerdict extracts JSON wrapped in prose or code fences", () => {
  const v = parseVerdict('Sure!\n```json\n{"verdict":"approved","issues":[]}\n```');
  assert.equal(v.verdict, "approved");
});

test("parseVerdict never blocks the pipeline on garbage", () => {
  const v = parseVerdict("I think it is fine");
  assert.equal(v.verdict, "approved");
  assert.equal(v.parsed, false);
});

test("parseVerdict treats a challenge without issues as approved", () => {
  assert.equal(parseVerdict('{"verdict":"challenge","issues":[]}').verdict, "approved");
});

test("parsePlan parses steps and forces approval for HIGH risk", () => {
  const steps = parsePlan(
    "1. Check the bank gateway DNS | Risk: LOW | Approval: no\n2. Restart payment-service | Risk: HIGH | Approval: no\nnoise line"
  );
  assert.equal(steps.length, 2);
  assert.equal(steps[0].approval, false);
  assert.equal(steps[1].approval, true);
});

test("parsePlan limits the plan to five steps", () => {
  const many = Array.from({ length: 9 }, (_, i) => `${i + 1}. step | Risk: LOW | Approval: no`).join("\n");
  assert.equal(parsePlan(many).length, 5);
});
