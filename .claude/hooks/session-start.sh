#!/bin/bash
# Prepares telegram-mcp-server so the `telegram` MCP server can start in a fresh
# container: without node_modules/ and dist/ the server exits immediately and its
# tools are missing from the session.
set -euo pipefail

# Local checkouts keep their own node_modules; only remote sessions start empty.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/telegram-mcp-server"

npm install --no-audit --no-fund
npm run build
