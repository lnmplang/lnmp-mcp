#!/usr/bin/env bash
# Run the OpenAI agent demo using a .env file in the adapter folder
# Usage: Copy `.env.example` to `.env` and fill your OPENAI_API_KEY.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
else
  echo "Warning: $ENV_FILE not found; continuing with current env vars."
fi

cd "$ROOT_DIR" || exit 1
npx ts-node ./examples/demo/agent_mcp_openai.ts
