// Deterministic "ground truth" classifier. It looks only at raw tool output, never at the LLM report,
// so it can be used to cross-check the agents and to score them in the eval.

export function toObject(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? value : null;
}

const LABELS = {
  none: { label: "השירות תקין", severity: "ok" },
  ext_down: { label: "ספק חיצוני לא זמין", severity: "critical" },
  db_down: { label: "מסד נתונים לא זמין", severity: "critical" },
  latency: { label: "איטיות בתשלום", severity: "warning" },
  unreachable: { label: "השירות לא נגיש", severity: "critical" },
  unknown: { label: "לא ניתן לסווג", severity: "warning" },
};

export function classify(toolResults) {
  const check = (toolResults || []).map((r) => ({ ...r, o: toObject(r.output) })).find((r) => r.o?.health || r.o?.payment);
  if (!check) return { scenario: "unknown", ...LABELS.unknown, evidence: ["no check_service_health output"] };

  const { health, payment } = check.o;
  const evidence = [];
  if (health) evidence.push(`/health → ${health.status}`);
  if (payment) evidence.push(`/api/pay → ${payment.status}${payment.durationMs != null ? ` (${payment.durationMs}ms)` : ""}`);

  const connectFail = (r) => r?.status === 500 && /failed to connect/i.test(r?.body?.error || "");
  let scenario = "unknown";
  if (connectFail(health) && connectFail(payment)) scenario = "unreachable";
  else if (health?.status === 503 || (payment?.status === 503 && /database/i.test(payment?.body?.message || ""))) scenario = "db_down";
  else if (payment?.status === 502) scenario = "ext_down";
  else if (payment?.status === 200 && (payment?.durationMs ?? 0) >= 3000) scenario = "latency";
  else if (health?.status === 200 && payment?.status === 200) scenario = "none";

  return { scenario, ...LABELS[scenario], evidence };
}

const KEYWORDS = {
  none: /healthy|operational|operating normally|normal|no (issues?|problems?|errors?)|success/i,
  ext_down: /502|bank|gateway|external/i,
  db_down: /503|database|\bdb\b/i,
  latency: /latency|slow|delay|4000|4 ?s\b|seconds|timeout/i,
  unreachable: /unreachable|connection|refused|not reachable|cannot connect/i,
};

// Does the LLM's English report agree with the rule-based classification?
export function matchesDiagnosis(scenario, report) {
  const re = KEYWORDS[scenario];
  if (!re) return false;
  const text = String(report || "");
  if (!re.test(text)) return false;
  // A report for a healthy service must not claim a 5xx error.
  if (scenario === "none" && /\b50[23]\b/.test(text)) return false;
  return true;
}
