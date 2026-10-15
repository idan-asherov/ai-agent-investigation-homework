"use client";

import { useState } from "react";
import { readEvents } from "./read-events";

const STEP_LABELS = {
  check_service_health: "בדיקת בריאות ותשלום ניסיון",
  get_recent_logs: "קריאת הלוגים האחרונים",
  get_production_info: "פרטי סביבה וגרסה",
  translate_to_hebrew: "תרגום הדוח לעברית",
};
const EXPECTED_STEPS = ["check_service_health", "get_recent_logs", "get_production_info"];

function toObject(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" ? value : null;
}

function buildSteps(events, running, hasReport, hasError) {
  const steps = [];
  for (const e of events) {
    if (e.type === "tool_called") {
      steps.push({ tool: e.tool, status: "running", output: null });
    } else if (e.type === "tool_output") {
      const open = [...steps].reverse().find((s) => s.status === "running");
      if (open) {
        open.status = "done";
        open.output = e.output;
      }
    }
  }
  const settled = hasReport || !running;
  return steps.map((s) =>
    s.status === "running" && settled
      ? { ...s, status: hasReport ? "done" : hasError ? "failed" : "done" }
      : s
  );
}

function getVerdict(steps) {
  const check = steps.find((s) => s.tool === "check_service_health" && s.output);
  const out = toObject(check?.output);
  if (!out) return null;
  const codes = [
    ["בריאות", out.health?.status],
    ["תשלום ניסיון", out.payment?.status],
  ].filter(([, code]) => code !== undefined);
  if (!codes.length) return null;
  const bad = codes.some(([, code]) => typeof code !== "number" || code >= 400);
  return { bad, codes };
}

function cleanText(text) {
  return text.replace(/```[a-z]*\n?/gi, "").replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
}

function parseReport(raw) {
  const text = cleanText(raw);
  const re = /^\s*(?:\d+[.)]\s*)?(מה נבדק|ראיות|שורש התקלה|פעולה מומלצת)\s*:?\s*(.*)$/gm;
  const marks = [...text.matchAll(re)];
  if (marks.length < 2) return null;
  return marks.map((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : undefined;
    const rest = text.slice(m.index + m[0].length, end);
    return { title: m[1], body: (m[2] + "\n" + rest).trim() };
  });
}

// Keep Latin identifiers (paths, codes, hostnames) intact inside Hebrew lines
function Inline({ text }) {
  const parts = text.split(/(\/?[A-Za-z0-9_](?:[A-Za-z0-9_.\/:-]*[A-Za-z0-9_\/])?(?: \/?[A-Za-z0-9_](?:[A-Za-z0-9_.\/:-]*[A-Za-z0-9_\/])?)*)/g);
  return parts.map((part, i) =>
    i % 2 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    )
  );
}

function Body({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((line) => {
    const t = line.trim();
    if (!t) {
      list = null;
      return;
    }
    const item = t.match(/^[-•*]\s+(.*)$/);
    if (item) {
      if (!list) {
        list = [];
        blocks.push({ list });
      }
      list.push(item[1]);
    } else {
      list = null;
      blocks.push({ p: t });
    }
  });
  return blocks.map((b, i) =>
    b.list ? (
      <ul key={i}>
        {b.list.map((li, j) => (
          <li key={j}>
            <Inline text={li} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i}>
        <Inline text={b.p} />
      </p>
    )
  );
}

function Step({ step }) {
  const out = toObject(step.output) ?? step.output;
  return (
    <li className={`step step-${step.status}`}>
      <span className="node" aria-hidden="true" />
      <div className="step-main">
        <span className="step-label">{STEP_LABELS[step.tool] || step.tool}</span>
        <span className="step-state">
          {step.status === "running" && "רץ עכשיו"}
          {step.status === "done" && "הושלם"}
          {step.status === "failed" && "נכשל"}
          {step.status === "pending" && "ממתין"}
        </span>
        {out ? (
          <details>
            <summary>הנתונים שחזרו</summary>
            <pre dir="ltr">{typeof out === "string" ? out : JSON.stringify(out, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}

function Slip({ report, verdict, finishedAt }) {
  const sections = parseReport(report);
  return (
    <article className="slip">
      <header className="slip-head">
        <div>
          <h2>דוח חקירה</h2>
          <p className="slip-meta">שירות התשלומים · {finishedAt}</p>
        </div>
        {verdict ? (
          <div className={`stamp ${verdict.bad ? "stamp-bad" : "stamp-ok"}`}>
            {verdict.bad ? "נמצאה תקלה" : "השירות תקין"}
          </div>
        ) : null}
      </header>

      {verdict ? (
        <ul className="codes">
          {verdict.codes.map(([name, code]) => (
            <li key={name} className={typeof code === "number" && code < 400 ? "code-ok" : "code-bad"}>
              <span>{name}</span>
              <bdi className="code-num">{String(code)}</bdi>
            </li>
          ))}
        </ul>
      ) : null}

      {sections ? (
        sections.map((s) => (
          <section key={s.title} className="slip-section">
            <h3>{s.title}</h3>
            <Body text={s.body} />
          </section>
        ))
      ) : (
        <div className="slip-section raw">
          <Body text={cleanText(report)} />
        </div>
      )}
    </article>
  );
}

export default function HomePage() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [finishedAt, setFinishedAt] = useState("");

  async function investigate() {
    setRunning(true);
    setEvents([]);
    setReport("");
    setError("");
    setFinishedAt("");

    try {
      const response = await fetch("/api/investigation", { method: "POST" });

      await readEvents(response, (event) => {
        if (event.type === "report") {
          setReport(event.report);
          setFinishedAt(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
        } else if (event.type === "error") {
          setError(event.message);
        } else {
          setEvents((prev) => [...prev, event]);
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const steps = buildSteps(events, running, Boolean(report), Boolean(error));
  const verdict = getVerdict(steps);
  const shown = steps.length
    ? steps
    : EXPECTED_STEPS.map((tool) => ({ tool, status: "pending", output: null }));

  return (
    <main className="desk">
      <header className="masthead">
        <h1>חוקר תקלות</h1>
        <p>סוכן שבודק את שירות התשלומים בעצמו, קורא את הלוגים ומסכם מה מצא.</p>
      </header>

      <div className="board">
        <section className="trace" aria-label="מהלך החקירה">
          <button className="go" onClick={investigate} disabled={running}>
            {running ? "חוקר…" : report || error ? "חקירה חדשה" : "התחל חקירה"}
          </button>
          <ol className="steps">
            {shown.map((s, i) => (
              <Step key={i} step={s} />
            ))}
          </ol>
        </section>

        <section className="output" aria-live="polite">
          {error ? (
            <div className="alert" role="alert">
              <strong>החקירה נעצרה</strong>
              <p>{error}</p>
              <p>בדוק שהמודל המקומי רץ ושהשירות עונה, ואז נסה שוב.</p>
            </div>
          ) : null}

          {report ? (
            <Slip report={report} verdict={verdict} finishedAt={finishedAt} />
          ) : !error ? (
            <p className="empty">
              {running
                ? "הסוכן עובד. הדוח יודפס כאן ברגע שהחקירה תסתיים."
                : "לחץ על ״התחל חקירה״. הסוכן יבדוק את השירות וידפיס כאן דוח קצר."}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
