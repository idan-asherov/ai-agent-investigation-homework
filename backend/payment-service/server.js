import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5002;
const VERSION = "1.0.0";
const SERVICE_NAME = "payment-service";

const memoryLogs = [];

function log(level, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    level: level.toUpperCase(),
    message,
  };
  console.log(JSON.stringify(entry));
  memoryLogs.unshift(entry);
  if (memoryLogs.length > 50) memoryLogs.pop();
}

log("INFO", `${SERVICE_NAME} v${VERSION} starting on port ${PORT}`);

// 1. כלי בריאות: GET /health
app.get("/health", (req, res) => {
  const scenario = process.env.SCENARIO || "none";

  if (scenario === "db_down") {
    log("ERROR", "Healthcheck failed: Database connection pool lost (Connection refused: 27017)");
    return res.status(503).json({
      status: "unhealthy",
      service: SERVICE_NAME,
      db: "disconnected",
      error: "Could not establish connection to persistence store",
    });
  }

  res.status(200).json({
    status: "ok",
    service: SERVICE_NAME,
    db: "connected",
    uptime: process.uptime(),
  });
});

// 2. כלי גרסה ומידע: GET /version
app.get("/version", (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    version: VERSION,
    environment: "production",
  });
});

// 3. כלי שליפת לוגים: GET /logs
app.get("/logs", (req, res) => {
  res.status(200).json(memoryLogs.slice(0, 20));
});

// 4. פעולת סליקה עם 3 תקלות יזומות: /api/pay
app.all("/api/pay", async (req, res) => {
  const scenario = process.env.SCENARIO || "none";

  // תקלה 1: תלות חיצונית לא עונה
  if (scenario === "ext_down") {
    try {
      log("INFO", "Initiating external bank gateway transaction via http://bank-gateway:8080/charge");
      await fetch("http://bank-gateway:8080/charge", { signal: AbortSignal.timeout(1500) });
    } catch (err) {
      log("ERROR", `Payment failed: External bank gateway unreachable (Error: ${err.message}, Host: bank-gateway)`);
      return res.status(502).json({
        error: "Bad Gateway",
        message: "External bank provider unavailable",
      });
    }
  }

  // תקלה 2: מסד נתונים מנותק
  if (scenario === "db_down") {
    log("ERROR", "Cannot process payment ledger: database write timeout");
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Database transaction failed",
    });
  }

  // תקלה 3: השהייה ממושכת (איטיות)
  if (scenario === "latency") {
    log("WARN", "High latency detected during transaction validation: artificial 4000ms delay active");
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  log("INFO", "Payment transaction processed successfully (200 OK)");
  return res.status(200).json({
    status: "success",
    transactionId: "tx_" + Date.now(),
    amount: 150,
    currency: "USD",
  });
});

app.get("/", (req, res) => {
  res.send(`${SERVICE_NAME} running. Active SCENARIO: ${process.env.SCENARIO || "none"}`);
});

app.listen(PORT, () => {
  console.log(`🚀 ${SERVICE_NAME} listening on http://localhost:${PORT}`);
});
