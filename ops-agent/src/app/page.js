"use client";

import { useEffect, useState, useCallback } from "react";
import { readEvents } from "./read-events";

const STEP_LABELS = {
  check_service_health: "בדיקת בריאות ותשלום ניסיון",
  get_recent_logs: "קריאת הלוגים האחרונים",
  get_production_info: "פרטי סביבה וגרסה",
  translate_to_hebrew: "תרגום הדוח לעברית",
};
const AGENTS = [
  ["investigator", "חוקר", "אוסף ראיות בעזרת הכלים"],
  ["reviewer", "מבקר", "בודק כל טענה מול הנתונים"],
  ["planner", "מתכנן", "מציע תכנית תיקון, ללא ביצוע"],
  ["translator", "מתרגם", "מתרגם לעברית סעיף אחר סעיף"],
];
const SCENARIOS = [
  ["none", "תקין"],
  ["ext_down", "ספק חיצוני נפל"],
  ["db_down", "מסד נתונים נפל"],
  ["latency", "איטיות"],
];
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


function agentStates(events, running, done) {
  const state = Object.fromEntries(AGENTS.map(([id]) => [id, { status: "pending", rounds: 0 }]));
  for (const e of events) {
    if (e.type !== "agent") continue;
    const st = state[e.agent];
    if (!st) continue;
    if (e.status === "start") {
      st.status = "running";
      st.rounds += 1;
    } else {
      st.status = "done";
    }
  }
  if (!running && !done) {
    for (const st of Object.values(state)) if (st.status === "running") st.status = "failed";
  }
  return state;
}

function AgentRail({ states }) {
  return (
    <ol className="agents" aria-label="הסוכנים">
      {AGENTS.map(([id, name, desc]) => {
        const st = states[id];
        return (
          <li key={id} className={`agent agent-${st.status}`}>
            <span className="node" aria-hidden="true" />
            <div>
              <span className="agent-name">{name}</span>
              {st.rounds > 1 ? <span className="agent-rounds">{st.rounds} סבבים</span> : null}
              <p className="agent-desc">{desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Reviews({ reviews }) {
  if (!reviews.length) return null;
  return (
    <section className="panel" aria-label="הדיון בין הסוכנים">
      <h3 className="panel-title">הדיון בין הסוכנים</h3>
      {reviews.map((r) => (
        <div key={r.round} className={`review review-${r.verdict}`}>
          <strong>
            מבקר, סבב {r.round}: {r.verdict === "challenge" ? "הערות לחוקר" : "הדוח אושר"}
          </strong>
          {!r.parsed ? <p className="muted">תשובת המבקר לא הייתה בפורמט תקין, והדוח עבר כמות שהוא.</p> : null}
          {r.issues.length ? (
            <ul>
              {r.issues.map((x, i) => (
                <li key={i}>
                  <Inline text={x} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function Plan({ plan }) {
  if (!plan?.length) return null;
  return (
    <section className="slip-section plan">
      <h3>תכנית תיקון מוצעת</h3>
      <p className="muted">הסוכן מציע בלבד. שום פעולה לא בוצעה, ופעולות שמשנות את המערכת דורשות אישור אנושי.</p>
      <ol className="plan-list">
        {plan.map((s) => (
          <li key={s.n}>
            <span>
              <Inline text={s.actionHe || s.action} />
            </span>
            <span className={`chip risk-${s.risk}`}>סיכון {s.risk === "LOW" ? "נמוך" : s.risk === "MEDIUM" ? "בינוני" : "גבוה"}</span>
            <span className={`chip ${s.approval ? "chip-approve" : "chip-free"}`}>{s.approval ? "דורש אישור" : "קריאה בלבד"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Slip({ report, plan, classification, verification, saved, durationMs, codes, finishedAt }) {
  const sections = parseReport(report);
  const bad = classification ? classification.severity !== "ok" : false;
  return (
    <article className="slip">
      <header className="slip-head">
        <div>
          <h2>דוח חקירה</h2>
          <p className="slip-meta">
            שירות התשלומים · {finishedAt}
            {durationMs ? ` · ${(durationMs / 1000).toFixed(0)} שניות` : ""}
          </p>
        </div>
        {classification ? (
          <div className={`stamp ${bad ? "stamp-bad" : "stamp-ok"}`}>{classification.label}</div>
        ) : null}
      </header>

      {codes ? (
        <ul className="codes">
          {codes.map(([name, code]) => (
            <li key={name} className={typeof code === "number" && code < 400 ? "code-ok" : "code-bad"}>
              <span>{name}</span>
              <bdi className="code-num">{String(code)}</bdi>
            </li>
          ))}
        </ul>
      ) : null}

      {verification ? (
        <p className={`verify ${verification.agrees ? "verify-ok" : "verify-bad"}`}>
          {verification.agrees
            ? (verification.refereed ? "אימות כפול: הדוח תוקן אחרי שמנוע הכללים הכריע, והוא תואם כעת לקודי הסטטוס." : "אימות כפול: מסקנת הסוכנים תואמת את מנוע הכללים, שמסתכל רק על קודי הסטטוס.")
            : "אימות כפול: יש סתירה בין מסקנת הסוכנים לבין קודי הסטטוס. בדוק ידנית לפני שסומכים על הדוח."}
        </p>
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

      <Plan plan={plan} />

      {saved ? (
        <p className={`saved ${saved.ok ? "saved-ok" : "saved-bad"}`}>
          {saved.ok ? "החקירה נשמרה בהיסטוריה." : `השמירה ל-Mongo נכשלה: ${saved.error}`}
        </p>
      ) : null}
    </article>
  );
}

function StatusBar({ status }) {
  const chips = [
    ["Ollama", status?.ollama],
    ["payment-service", status?.backend],
    ["MongoDB", status?.mongo],
  ];
  return (
    <ul className="statusbar" aria-label="מצב המערכת">
      {chips.map(([name, s]) => (
        <li key={name} className={!status ? "chip-wait" : s?.ok ? "chip-up" : "chip-down"} title={s?.error || ""}>
          <span className="dot" aria-hidden="true" />
          <bdi dir="ltr">{name}</bdi>
          <span className="chip-state">{!status ? "בודק" : s?.ok ? "פעיל" : "לא זמין"}</span>
        </li>
      ))}
      {status?.model ? (
        <li className="model">
          מודל: <bdi dir="ltr">{status.model}</bdi>
        </li>
      ) : null}
    </ul>
  );
}

function FaultPicker({ current, onChange, disabled }) {
  return (
    <div className="fault">
      <label htmlFor="fault">הזרקת תקלה לשירות</label>
      <select id="fault" value={current ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled || current === null}>
        {current === null ? <option value="">לא זמין</option> : null}
        {SCENARIOS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function History({ data }) {
  if (!data) return null;
  return (
    <section className="history" aria-label="היסטוריית חקירות">
      <h2>היסטוריית חקירות</h2>
      {!data.ok ? (
        <p className="muted">לא ניתן לקרוא מ-Mongo: {data.error}</p>
      ) : data.items.length === 0 ? (
        <p className="muted">עדיין אין חקירות שמורות.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>זמן</th>
              <th>תוצאה</th>
              <th>אימות כפול</th>
              <th>סבבי ביקורת</th>
              <th>משך</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d._id}>
                <td>{new Date(d.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  <span className={`chip ${d.classification?.severity === "ok" ? "chip-up" : "chip-down"}`}>
                    {d.classification?.label ?? "לא ידוע"}
                  </span>
                </td>
                <td>{d.verification?.agrees ? "תואם" : "סתירה"}</td>
                <td>{d.reviews?.length ?? 0}</td>
                <td>{d.durationMs ? `${Math.round(d.durationMs / 1000)} ש׳` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function HomePage() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [status, setStatus] = useState(null);
  const [scenario, setScenario] = useState(undefined);
  const [history, setHistory] = useState(null);

  const loadHistory = useCallback(() => {
    fetch("/api/history").then((r) => r.json()).then(setHistory).catch((e) => setHistory({ ok: false, error: e.message, items: [] }));
  }, []);

  useEffect(() => {
    const poll = () => fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    poll();
    const id = setInterval(poll, 15000);
    fetch("/api/scenario").then((r) => (r.ok ? r.json() : null)).then((d) => setScenario(d?.scenario ?? null)).catch(() => setScenario(null));
    loadHistory();
    return () => clearInterval(id);
  }, [loadHistory]);

  async function changeScenario(next) {
    const r = await fetch("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: next }),
    });
    if (r.ok) setScenario(next);
  }

  async function investigate() {
    setRunning(true);
    setEvents([]);
    setResult(null);
    setError("");
    setFinishedAt("");

    try {
      const response = await fetch("/api/investigation", { method: "POST" });
      await readEvents(response, (event) => {
        if (event.type === "error") setError(event.message);
        else if (event.type === "report") {
          setFinishedAt(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
          setEvents((prev) => [...prev, event]);
        } else setEvents((prev) => [...prev, event]);
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
      loadHistory();
    }
  }

  const last = (type) => [...events].reverse().find((e) => e.type === type);
  const reportEv = last("report");
  const steps = buildSteps(events, running, Boolean(reportEv), Boolean(error));
  const verdict = getVerdict(steps);
  const reviews = events.filter((e) => e.type === "review");
  const states = agentStates(events, running, Boolean(reportEv));
  const shown = steps.length ? steps : EXPECTED_STEPS.map((tool) => ({ tool, status: "pending", output: null }));

  return (
    <main className="desk">
      <header className="masthead">
        <h1>חוקר תקלות</h1>
        <p>ארבעה סוכנים עובדים יחד: אחד חוקר, אחד מבקר, אחד מתכנן ואחד מתרגם. מנוע כללים נפרד בודק את מסקנתם.</p>
      </header>

      <StatusBar status={status} />

      <div className="board">
        <section className="trace" aria-label="מהלך החקירה">
          <button className="go" onClick={investigate} disabled={running}>
            {running ? "חוקר…" : reportEv || error ? "חקירה חדשה" : "התחל חקירה"}
          </button>
          <FaultPicker current={scenario === undefined ? null : scenario} onChange={changeScenario} disabled={running} />
          <h3 className="rail-title">הסוכנים</h3>
          <AgentRail states={states} />
          <h3 className="rail-title">הכלים</h3>
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

          <Reviews reviews={reviews} />

          {reportEv ? (
            <Slip
              report={reportEv.report}
              plan={reportEv.plan}
              classification={last("classification")}
              verification={last("verification")}
              saved={last("saved")}
              durationMs={last("done")?.durationMs}
              codes={verdict?.codes}
              finishedAt={finishedAt}
            />
          ) : !error ? (
            <p className="empty">
              {running
                ? "הסוכנים עובדים. הדוח יודפס כאן ברגע שהחקירה תסתיים."
                : "בחר תקלה להזרקה, ולחץ על ״התחל חקירה״. החוקר יאסוף ראיות, המבקר יבדוק אותן, והמתכנן יציע תיקון."}
            </p>
          ) : null}
        </section>
      </div>

      <History data={history} />
    </main>
  );
}
