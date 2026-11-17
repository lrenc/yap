#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

mkdir -p dist
rm -f dist/cli.js

bun build src/cli/index.tsx \
  --target=node \
  --format=esm \
  --packages=external \
  --outfile=dist/cli.js \
  --banner='#!/usr/bin/env node'

chmod +x dist/cli.js
