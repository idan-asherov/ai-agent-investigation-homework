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
          setError(event.error || event.message);
        } else if (event.type === "tool_called") {
          setEvents((prev) => [...prev, `${event.tool} tool started 🔧`]);
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: "40px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        direction: "rtl",
      }}
    >
      <div style={{ width: "100%", maxWidth: "900px" }}>
        
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: "20px",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.2)",
              color: "#38bdf8",
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}
          >
            DevOps SRE Autonomous Agent
          </div>
          <h1
            style={{
              fontSize: "36px",
              fontWeight: "800",
              color: "#ffffff",
              margin: "0 0 8px 0",
              letterSpacing: "-0.5px",
            }}
          >
            Ops Agent
          </h1>
          <p style={{ color: "#8b949e", fontSize: "15px", margin: 0 }}>
            סוכן בינה מלאכותית אוטונומי לתחקור תקלות, דגימת לוגים וניתוח סיבת שורש (RCA)
          </p>
        </div>

        {/* Action Button */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
          <button
            onClick={investigate}
            disabled={running}
            style={{
              backgroundColor: running ? "#21262d" : "#238636",
              color: "#ffffff",
              border: "1px solid rgba(240, 246, 252, 0.1)",
              borderRadius: "8px",
              padding: "12px 28px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: running ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {running ? "⌛ הסוכן מתחקר את המערכת..." : "🚀 התחל תחקור שירות"}
          </button>
        </div>

        {/* Diagnostic Events Card */}
        {events.length > 0 && (
          <div
            style={{
              backgroundColor: "#161b22",
              border: "1px solid #30363d",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "24px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: "700",
                color: "#58a6ff",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#3fb950",
                  display: "inline-block",
                }}
              />
              פעולות אבחון שבוצעו
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", direction: "ltr" }}>
              {events.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "#0d1117",
                    border: "1px solid #21262d",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    color: "#7ee787",
                  }}
                >
                  {ev}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RCA Report Card */}
        {report && (
          <div
            style={{
              backgroundColor: "#161b22",
              border: "1px solid #30363d",
              borderRadius: "12px",
              padding: "28px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid #21262d",
                paddingBottom: "16px",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#f0f6fc", margin: 0 }}>
                📋 דו"ח חקירת תקלה (RCA Report)
              </h2>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "12px",
                  backgroundColor: "#21262d",
                  color: "#8b949e",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #30363d",
                }}
              >
                payment-service
              </span>
            </div>

            <div
              style={{
                textAlign: "right",
                lineHeight: "1.8",
                fontSize: "15px",
                color: "#e6edf3",
                whiteSpace: "pre-wrap",
                letterSpacing: "0.2px",
              }}
            >
              {report}
            </div>
          </div>
        )}

        {/* Error Card */}
        {error && (
          <div
            style={{
              backgroundColor: "rgba(248, 81, 73, 0.1)",
              border: "1px solid rgba(248, 81, 73, 0.4)",
              borderRadius: "8px",
              padding: "16px",
              color: "#ff7b72",
              fontSize: "14px",
              marginBottom: "24px",
            }}
          >
            ⚠️ שגיאה: {error}
          </div>
        )}

      </div>
    </main>
  );
}
