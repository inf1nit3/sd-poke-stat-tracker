#!/usr/bin/env bash
# install.sh — runs from YOUR COMPUTER (not the Steam Deck)
# Copies the plugin folder to ~/homebrew/plugins/ on the Steam Deck
# and runs the (fast) setup script there.
#
# Usage: ./install.sh [user@steamdeck-host]
# Default: deck@steamdeck

set -euo pipefail

DEST="${1:-deck@steamdeck}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="sd-poke-stat-tracker"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

blue "============================================================"
blue "  $PLUGIN_NAME — deploy to $DEST"
blue "============================================================"
echo

if [[ ! -f "$SCRIPT_DIR/plugin.json" ]] || [[ ! -f "$SCRIPT_DIR/dist/index.js" ]]; then
    red "ERROR: This script must be run from the plugin folder."
    red "  Expected: $SCRIPT_DIR/plugin.json and $SCRIPT_DIR/dist/index.js"
    exit 1
fi

blue "▶ Testing SSH connection to $DEST…"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$DEST" true 2>/dev/null; then
    red "ERROR: Cannot SSH to $DEST"
    red "  Make sure SSH is enabled on the Steam Deck and the user/host are correct."
    exit 1
fi
green "  ✓ SSH reachable"

blue "▶ Ensuring ~/homebrew/plugins/ exists on the Steam Deck…"
ssh "$DEST" 'mkdir -p "$HOME/homebrew/plugins"'
green "  ✓ Plugin directory ready"

blue "▶ Syncing plugin folder to Steam Deck…"
if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.DS_Store' \
        "$SCRIPT_DIR/" \
        "$DEST:~/homebrew/plugins/$PLUGIN_NAME/"
    green "  ✓ Synced via rsync"
else
    tmp="$(mktemp -d)"
    cp -r "$SCRIPT_DIR/." "$tmp/$PLUGIN_NAME/"
    chmod +x "$tmp/$PLUGIN_NAME/setup.sh" "$tmp/$PLUGIN_NAME/rebuild.sh"
    (cd "$tmp" && tar czf - "$PLUGIN_NAME/") | ssh "$DEST" "cd ~/homebrew/plugins && tar xzf -"
    rm -rf "$tmp"
    green "  ✓ Synced via tar"
fi

blue "▶ Running fast setup on the Steam Deck (no npm/pnpm download)…"
echo
ssh "$DEST" "chmod +x ~/homebrew/plugins/$PLUGIN_NAME/setup.sh && ~/homebrew/plugins/$PLUGIN_NAME/setup.sh"
SSH_STATUS=$?

echo
if [[ $SSH_STATUS -eq 0 ]]; then
    green "============================================================"
    green "  ✓ Deploy successful (took seconds, not minutes)"
    green "============================================================"
    echo
    blue "  Plugin at: $DEST:~/homebrew/plugins/$PLUGIN_NAME/"
    blue "  Restart Decky to load it (QAM → Decky → toggle plugin)."
else
    red "============================================================"
    red "  ✗ Setup script reported errors"
    red "============================================================"
    exit 1
fi
