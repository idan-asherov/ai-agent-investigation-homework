# AI Agent Investigation Homework

An AI agent (Ollama qwen2.5:7b via the OpenAI Agents SDK) that investigates incidents in `payment-service` and writes a Hebrew RCA report.

- `backend/payment-service` – Express service with 3 injectable faults (`SCENARIO=db_down | ext_down | latency`)
- `ops-agent` – Next.js UI + agent + tools (`/health`, `/api/pay`, `/logs`, `/version`)

## Run with Docker
1. Start Ollama on the host: `ollama run qwen2.5:7b`
2. Copy `backend/payment-service/.env.example` and `ops-agent/.env.example` to `.env` in the same folders and fill in values (never commit `.env`).
3. `docker compose up --build`
4. Open http://localhost:3000 and press **Investigate**.

To inject a fault: set `SCENARIO=ext_down` in `backend/payment-service/.env`, then `docker compose up -d --force-recreate backend`.
