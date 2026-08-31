#!/bin/sh
# Launch the MCP server, building it first if needed.
#
# `dist/` and `node_modules/` are gitignored, so a fresh clone has neither and
# `node dist/index.js` dies with MODULE_NOT_FOUND before the MCP client ever
# completes a handshake. Doing the install/build here keeps that from being a
# setup step anyone has to remember.
#
# stdout is the JSON-RPC channel for stdio transport, so every byte of setup
# output goes to stderr, where the MCP client logs it.
set -e

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "telegram-mcp-server: installing dependencies..." >&2
  npm install --no-audit --no-fund >&2
fi

# Rebuild when dist/ is missing or any source file is newer than the output.
if [ ! -f dist/index.js ] || [ -n "$(find src -newer dist/index.js -print -quit)" ]; then
  echo "telegram-mcp-server: building..." >&2
  npm run build >&2
fi

exec node dist/index.js
