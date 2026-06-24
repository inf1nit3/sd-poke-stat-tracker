#!/usr/bin/env bash
# rebuild.sh — rebuild the frontend bundle from source
#
# Only needed when you're modifying TypeScript source. Normal users
# never need this — the pre-built dist/index.js is committed.
#
# Requires: Node.js 18+ and pnpm (only used during development)
# Time: ~2 minutes the first time (downloads build deps), ~5 seconds after

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

blue() { printf '\033[34m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

blue "============================================================"
blue "  Frontend rebuild (development only)"
blue "============================================================"
echo

if ! command -v pnpm >/dev/null 2>&1; then
    red "ERROR: pnpm is not installed"
    red "  Install: npm install -g pnpm"
    exit 1
fi

cd "$PLUGIN_DIR"

blue "▶ Installing build dependencies (one-time, ~2 minutes)…"
pnpm install 2>&1 | tail -3

blue "▶ Building frontend bundle…"
pnpm run build 2>&1 | tail -5

green ""
green "✓ Build complete — dist/index.js updated"
green "  Restart Decky to pick up the new bundle"
