import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCJK, isCleanHebrew, applyRiskRules, splitEnglish, parseVerdict, parsePlan } from "../src/lib/text.js";

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

test("parsePlan tolerates markdown, parentheses and lowercase", () => {
  const steps = parsePlan("1) **Check bank gateway DNS** (Risk: low, Approval: no)\n2. `Restart service` - Risk: medium");
  assert.equal(steps.length, 2);
  assert.equal(steps[0].action, "Check bank gateway DNS");
  assert.equal(steps[0].risk, "LOW");
  assert.equal(steps[0].approval, false);
  assert.equal(steps[1].risk, "MEDIUM");
  assert.equal(steps[1].approval, true);
});

test("parsePlan defaults to the safe side when risk and approval are missing", () => {
  const [s] = parsePlan("1. Escalate to the bank provider");
  assert.equal(s.risk, "MEDIUM");
  assert.equal(s.approval, true);
});

test("a read-only check never needs approval, even if the model labelled it HIGH", () => {
  const [s] = parsePlan("1. Check database connectivity | Risk: HIGH | Approval: yes");
  assert.equal(s.risk, "LOW");
  assert.equal(s.approval, false);
});

test("a change always needs approval, even if the model labelled it LOW", () => {
  const [s] = parsePlan("1. Edit the database connection settings | Risk: LOW | Approval: no");
  assert.equal(s.risk, "MEDIUM");
  assert.equal(s.approval, true);
});

test("mutation wins over a leading read-only verb", () => {
  assert.equal(applyRiskRules({ action: "Check and restart the service", risk: "LOW", approval: false }).approval, true);
});

test("isCleanHebrew accepts clean Hebrew with identifiers", () => {
  assert.equal(isCleanHebrew("מצב בריאות של payment-service דרך /health, קוד 503."), true);
  assert.equal(isCleanHebrew("בדוק את החיבור ל-Mongo בפורט 27017"), true);
});

test("isCleanHebrew rejects the garbage seen in real model output", () => {
  assert.equal(isCleanHebrew("רגעים אחרונים מהגדרות ה로그ים"), false); // Korean
  assert.equal(isCleanHebrew("לタイム Outs של כתיבת הנתונים"), false); // Japanese
  assert.equal(isCleanHebrew("בדוק את מצבשרתฐาน הנתונים"), false); // Thai
  assert.equal(isCleanHebrew("בעיה בתETHER של בסיס הנתונים"), false); // Hebrew glued to Latin
  assert.equal(isCleanHebrew("טקסט עם תו שבור \uFFFD"), false);
});

test("isCleanHebrew rejects an answer returned in English and empty output", () => {
  assert.equal(isCleanHebrew("The service is unavailable because of a database failure"), false);
  assert.equal(isCleanHebrew(""), false);
  assert.equal(isCleanHebrew(undefined), false);
});

test("parsePlan returns nothing for prose without numbered steps", () => {
  assert.deepEqual(parsePlan("You should restart the service and check logs."), []);
});

test("isCleanHebrew rejects code-like junk and unbalanced parentheses", () => {
  assert.equal(isCleanHebrew("בדוק עבור שגיאות או ירידות ב ');"), false);
  assert.equal(isCleanHebrew("בדוק את השירות (payment-service"), false);
  assert.equal(isCleanHebrew("בדוק את השירות (payment-service) עכשיו."), true);
});
