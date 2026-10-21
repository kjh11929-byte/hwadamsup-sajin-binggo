#!/bin/sh
# Starts the forest-bingo Vite dev server with a resolved absolute path
# so the Bolt/Replit jsh shell (which lacks node_modules/.bin on PATH)
# can launch it without typing a long command.
exec node "/home/project/artifacts/forest-bingo/node_modules/vite/bin/vite.js" \
  --config "/home/project/artifacts/forest-bingo/vite.config.ts" \
  --host 0.0.0.0 \
  --port 3000
