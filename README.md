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

## Multi-agent pipeline

```
Investigator (tools) → Reviewer (challenges, up to 2 rounds) → Rule engine cross-check
                     → Remediation Planner (proposes only) → Hebrew Translator → MongoDB
```

- **Investigator** calls `check_service_health`, `get_recent_logs`, `get_production_info` and writes an English report.
- **Reviewer** compares every claim with the raw tool output and replies with a JSON verdict. On `challenge` the investigator re-checks and rewrites (max 2 rounds).
- **Rule engine** (`src/lib/diagnosis.js`) classifies the incident from status codes and timing only, with no LLM. The UI shows whether the agents agree with it.
- **Planner** proposes up to 4 remediation steps with risk level. It never executes anything; steps that change production require human approval.
- **Translator** translates section by section, rejects output containing Chinese, retries at another temperature.
- **MongoDB** runs as a local container (`mongo` service). Every investigation is stored with reviews, classification and timings. The UI shows live status and history; a failed save is reported instead of swallowed.

## Fault injection

The backend runs with `ENABLE_ADMIN=true` in compose, so the UI dropdown (or `POST /api/scenario`) can switch the scenario without a restart.
`scripts/fault.sh` still works for the restart-based way. Do not enable `ENABLE_ADMIN` outside a demo.

## Tests

```bash
cd backend/payment-service && npm test     # 6 tests: every fault scenario, admin endpoint, logs
cd ops-agent && npm test                   # 26 tests: text helpers, rule engine, orchestrator with fake agents
docker compose up --build -d
node scripts/eval.mjs --runs 2             # end-to-end: all scenarios against the real model
```

The eval switches each scenario, runs a full investigation and checks: correct classification, agents agree with the
rule engine, Hebrew free of Chinese, a plan exists, HIGH-risk steps need approval, the save to Mongo succeeded.
The report is written to `eval-results/latest.md`.
