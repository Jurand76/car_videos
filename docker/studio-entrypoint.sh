#!/bin/sh
set -e

export NODE_ENV=development

node /app/scripts/patch-remotion-content-length.js
node /app/scripts/patch-remotion-node-env.js
node /app/scripts/patch-remotion-process-update.js
node /app/scripts/patch-remotion-index-html.js
rm -rf /app/node_modules/.cache/webpack 2>/dev/null || true

exec npx remotion studio --ipv4 --port 3000
