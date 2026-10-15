#!/usr/bin/env bash
# Usage: scripts/fault.sh none|ext_down|db_down|latency
set -euo pipefail
cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
case "$SCENARIO" in
  none|ext_down|db_down|latency) ;;
  *) echo "Usage: $0 none|ext_down|db_down|latency"; exit 1 ;;
esac

ENV_FILE="backend/payment-service/.env"
touch "$ENV_FILE"
grep -v '^SCENARIO=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
echo "SCENARIO=$SCENARIO" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

docker compose up -d --force-recreate backend
echo "payment-service is now running with SCENARIO=$SCENARIO"
