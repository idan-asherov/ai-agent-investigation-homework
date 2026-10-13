"use client";

import { useState } from "react";
import { readEvents } from "./read-events";

export default function HomePage() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");

  async function investigate() {
    setRunning(true);
    setEvents([]);
    setReport("");
    setError("");

    try {
      const response = await fetch("/api/investigation", { method: "POST" });

      await readEvents(response, (event) => {
        if (event.type === "report") {
          setReport(event.report);
        } else if (event.type === "error") {
          setError(event.message);
        } else {
          setEvents((prev) => [...prev, event]);
        }
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#f8fafc", padding: "40px 24px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
        
        <h1 style={{ fontSize: "56px", fontWeight: "800", letterSpacing: "-1px", margin: "0 0 8px 0" }}>
          Ops Agent
        </h1>
        
        <p style={{ fontSize: "20px", color: "#94a3b8", margin: "0 0 24px 0" }}>
          Autonomous SRE & Root Cause Analysis Investigator
        </p>

        <button
          onClick={investigate}
          disabled={running}
          style={{
            backgroundColor: "#0f172a",
            color: "#ffffff",
            border: "1px solid #334155",
            borderRadius: "6px",
            padding: "8px 20px",
            fontSize: "15px",
            fontWeight: "600",
            cursor: running ? "not-allowed" : "pointer",
            opacity: running ? 0.6 : 1,
            transition: "all 0.2s"
          }}
        >
          {running ? "Investigating..." : "Investigate"}
        </button>

        <h2 style={{ fontSize: "24px", fontWeight: "700", marginTop: "36px", marginBottom: "16px" }}>
          פעולות אבחון שבוצעו
        </h2>

        <div style={{ display: "inline-block", textAlign: "center", minWidth: "320px", margin: "0 auto" }}>
          {events.length === 0 && <div style={{ color: "#64748b", fontSize: "14px" }}>ממתין להפעלת תחקיר...</div>}
          {events.map((event, i) => (
            <div key={i} style={{ fontSize: "15px", margin: "6px 0", fontFamily: "monospace", color: "#e2e8f0" }}>
              {event.type === "tool_called" ? `Tool Called: ${event.tool} 🔧` : null}
            </div>
          ))}
        </div>

        {report && (
          <div style={{ marginTop: "40px", textAlign: "right", direction: "rtl", padding: "10px 0" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#ffffff", marginBottom: "16px" }}>
              📋 דו"ח חקירת תקלה (RCA)
            </h2>
            <div style={{
              whiteSpace: "pre-wrap",
              fontSize: "15px",
              lineHeight: "1.8",
              color: "#e2e8f0",
              fontWeight: "400"
            }}>
              {report}
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: "24px", padding: "12px", backgroundColor: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5", borderRadius: "6px", textAlign: "right", direction: "rtl" }}>
            שגיאה: {error}
          </div>
        )}

      </div>
    </main>
  );
}
