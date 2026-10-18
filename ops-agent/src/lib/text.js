// Pure text helpers (no I/O) so they can be unit-tested.

export const hasCJK = (t) => /[㐀-鿿]/.test(t || "");

// A translation is accepted only if it is made of Hebrew, plain ASCII (identifiers, numbers) and ordinary
// punctuation. This rejects Chinese, Japanese, Thai, Korean, Cyrillic, replacement characters and the
// "Hebrew letter glued to a Latin word" garbage that small models produce.
const ALLOWED = /^[\u0009\u000A\u000D\u0020-\u007E\u00A0\u0590-\u05FF\u200E\u200F\u2010-\u2027\u2030-\u205E]*$/;
const GLUED = /[\u05D0-\u05EA][A-Za-z]|[A-Za-z][\u05D0-\u05EA]/;
// Code-like leftovers from a confused model: ');  {}  <>  backslash  pipe  backtick  $  ^  ~
const JUNK = /[;{}<>|`$^~]|[\\]|'\)|\)'/;
export function isCleanHebrew(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (!ALLOWED.test(t)) return false;
  if (GLUED.test(t)) return false;
  if (JUNK.test(t)) return false;
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return false;
  const hebrew = (t.match(/[\u05D0-\u05EA]/g) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (hebrew === 0 && latin > 12) return false; // returned in English instead of Hebrew
  return true;
}

export const SECTIONS = [
  ["What was checked", "מה נבדק"],
  ["Evidence", "ראיות"],
  ["Root cause", "שורש התקלה"],
  ["Recommended action", "פעולה מומלצת"],
];

// Split an English report into its 4 named sections. Returns null when fewer than 2 headings are found.
export function splitEnglish(text) {
  const re = /^\s*(?:\d+[.)]\s*)?(What was checked|Evidence|Root cause|Recommended action)\s*:?\s*(.*)$/gim;
  const marks = [...String(text || "").matchAll(re)];
  if (marks.length < 2) return null;
  return marks.map((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : undefined;
    const rest = text.slice(m.index + m[0].length, end);
    return { en: m[1].toLowerCase(), body: (m[2] + "\n" + rest).trim() };
  });
}

// Extract the reviewer's JSON verdict. Never throws: unparseable output is treated as "approved" with a note,
// so a small model that cannot produce JSON never blocks the pipeline.
export function parseVerdict(text) {
  const raw = String(text || "");
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const verdict = String(obj.verdict || "").toLowerCase() === "challenge" ? "challenge" : "approved";
      const issues = Array.isArray(obj.issues) ? obj.issues.map(String).filter(Boolean).slice(0, 5) : [];
      return { verdict: issues.length === 0 && verdict === "challenge" ? "approved" : verdict, issues, parsed: true };
    } catch {
      /* fall through */
    }
  }
  return { verdict: "approved", issues: [], parsed: false };
}

// Parse the remediation planner output. Small models vary the format, so this is tolerant:
// "1. Restart X | Risk: LOW | Approval: yes", "1) **Restart X** (Risk: low, Approval: no)", etc.
// Missing risk defaults to MEDIUM and missing approval defaults to "required" (the safe side).
export function parsePlan(text) {
  const steps = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/[*`]/g, "").trim();
    const m = line.match(/^(\d+)\s*[.)]\s*(.+)$/);
    if (!m) continue;
    const body = m[2];
    const action = body.split(/\s*[|(]\s*|\s+-\s+Risk|\s*,?\s*Risk\b/i)[0].trim().replace(/[.;:,]+$/, "");
    if (action.length < 3) continue;
    const risk = (body.match(/risk\W*(low|medium|high)/i)?.[1] || "MEDIUM").toUpperCase();
    const approvalWord = body.match(/approval\W*(yes|no)/i)?.[1]?.toLowerCase();
    const step = {
      n: Number(m[1]),
      action,
      risk,
      // Anything that is not explicitly "no" requires a human, and HIGH risk always does.
      approval: approvalWord !== "no" || risk === "HIGH",
    };
    steps.push(applyRiskRules(step));
  }
  return steps.slice(0, 5);
}

// The model's own risk labels are inconsistent on small models (a "check" marked HIGH, an "edit" marked LOW),
// so the safety-relevant part is decided by code: changing something always needs a human,
// and a pure read-only check never does.
const MUTATING = /\b(restart|reboot|redeploy|deploy|scale|scaling|rollback|roll back|edit|modify|change|update|apply|delete|remove|drop|reset|failover|kill|stop|start|enable|disable|increase|decrease|implement|reconfigure|patch|migrate|clear|purge|flush|replace|rotate)\b/i;
const READ_ONLY = /^(check|verify|review|inspect|monitor|look|examine|investigate|confirm|test|validate|read|observe|watch|audit|analy[sz]e|ping|query|view|collect|gather)\b/i;
const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function applyRiskRules(step) {
  if (MUTATING.test(step.action)) {
    const risk = RANK[step.risk] >= RANK.MEDIUM ? step.risk : "MEDIUM";
    return { ...step, risk, approval: true };
  }
  if (READ_ONLY.test(step.action)) return { ...step, risk: "LOW", approval: false };
  return step;
}
