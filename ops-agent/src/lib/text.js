// Pure text helpers (no I/O) so they can be unit-tested.

export const hasCJK = (t) => /[㐀-鿿]/.test(t || "");

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

// Parse the remediation planner output: lines like "1. Restart X | Risk: LOW | Approval: yes"
export function parsePlan(text) {
  const steps = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.+?)\s*\|\s*Risk:\s*(LOW|MEDIUM|HIGH)\s*\|\s*Approval:\s*(yes|no)/i);
    if (m) {
      steps.push({
        n: Number(m[1]),
        action: m[2].trim(),
        risk: m[3].toUpperCase(),
        // Anything that is not explicitly "no" requires a human, and HIGH risk always does.
        approval: m[4].toLowerCase() !== "no" || m[3].toUpperCase() === "HIGH",
      });
    }
  }
  return steps.slice(0, 5);
}
