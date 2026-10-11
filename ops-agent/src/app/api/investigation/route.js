import OpenAI from "openai";
import { saveInvestigation } from "@/lib/db.js";

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
  apiKey: process.env.OPENAI_API_KEY || "ollama",
});

async function callTool(name) {
  try {
    if (name === "check_service_health") {
      const res = await fetch("http://localhost:5002/health");
      return await res.json();
    }
    if (name === "get_recent_logs") {
      const res = await fetch("http://localhost:5002/logs");
      return await res.json();
    }
    if (name === "get_production_info") {
      const res = await fetch("http://localhost:5002/production-info");
      return await res.json();
    }
  } catch (err) {
    return { error: `Failed to fetch tool ${name}: ${err.message}` };
  }
  return { status: "unknown_tool" };
}

function cleanChunk(text) {
  return text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u0400-\u04ff\u3000-\u303f\uff00-\uffef]/g, "");
}

export async function POST(req) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      const toolsResults = [];

      try {
        // 1. כלי בריאות
        send({ type: "tool_called", tool: "check_service_health" });
        const health = await callTool("check_service_health");
        send({ type: "tool_output", output: health });
        toolsResults.push({ tool: "check_service_health", output: health });

        // 2. כלי לוגים
        send({ type: "tool_called", tool: "get_recent_logs" });
        const logs = await callTool("get_recent_logs");
        send({ type: "tool_output", output: logs });
        toolsResults.push({ tool: "get_recent_logs", output: logs });

        // 3. כלי סביבה
        send({ type: "tool_called", tool: "get_production_info" });
        const prodInfo = await callTool("get_production_info");
        send({ type: "tool_output", output: prodInfo });
        toolsResults.push({ tool: "get_production_info", output: prodInfo });

        const prompt = `
אתה מהנדס DevOps ו-SRE בכיר בתורנות החוקר תקלה ב-payment-service.
להלן הממצאים הטכניים שנאספו במערכת:

1. בדיקת בריאות (Health Check):
${JSON.stringify(health)}

2. לוגים אחרונים (Logs):
${JSON.stringify(logs)}

3. פרטי סביבה (Production Info):
${JSON.stringify(prodInfo)}

עליך להפיק דו"ח מקצועי, קריא וברור בעברית רהוטה בלבד (ללא שום תו בסינית או ברוסית).
חובה להשתמש במבנה Markdown עם כותרות מודגשות, ירידות שורה כפולות ותבליטים (•).
סכם את הנתונים במילים ברורות ואל תדביק מחרוזות JSON גולמיות.

השתמש בדיוק במבנה הבא:

### 1. מה נבדק
• בדיקת תקינות וזמינות שרת (Health Check).
• בדיקת לוגים אחרונים לזיהוי חריגות.
• שליפת מטא-דאטה ותצורת סביבת הייצור (Production Info).

### 2. ראיות וממצאים
• זמינות השירות ומסד הנתונים: (פרט)
• ניתוח הלוגים: (פרט)
• תצורת הייצור: (פרט את שגיאת ה-HTML/JSON בנתיב production-info)

### 3. שורש התקלה (Root Cause)
(הסבר טכני מדויק מדוע הקריאה ל-production-info החזירה דף HTML במקום JSON תקין)

### 4. פעולות מומלצות לפתרון
• צעד 1: ...
• צעד 2: ...
• צעד 3: ...
`;

        const responseStream = await client.chat.completions.create({
          model: "qwen2.5:7b",
          temperature: 0.2,
          stream: true,
          messages: [
            {
              role: "system",
              content: "You are an elite DevOps SRE on-call engineer. Write exclusively in clear, professional Hebrew. Use proper markdown spacing and bullet points. Never output Chinese or Cyrillic characters.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        let fullReport = "";
        for await (const chunk of responseStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullReport += cleanChunk(content);
            send({ type: "report", report: fullReport });
          }
        }

        // שמירה ל-MongoDB בסיום הפקת הדו"ח
        try {
          await saveInvestigation({
            createdAt: new Date(),
            service: "payment-service",
            toolsResults,
            report: fullReport,
          });
        } catch (dbErr) {
          console.error("Non-blocking DB save error:", dbErr.message);
        }

      } catch (err) {
        console.error("Investigation Error:", err);
        send({ type: "error", message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
