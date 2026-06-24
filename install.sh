#!/usr/bin/env bash
# install.sh — runs from YOUR COMPUTER (not the Steam Deck)
# Copies the pokemon-overlay-plugin folder to ~/homebrew/plugins/ on the Steam Deck
# and runs the setup script there.
#
# Usage: ./install.sh [user@steamdeck-host]
# Default: deck@steamdeck

set -euo pipefail

DEST="${1:-deck@steamdeck}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="pokemon-overlay-plugin"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

blue "============================================================"
blue "  Pokémon Essentials Overlay — deploy to $DEST"
blue "============================================================"
echo

if [[ ! -d "$SCRIPT_DIR/dist" ]] || [[ ! -f "$SCRIPT_DIR/plugin.json" ]]; then
    red "ERROR: This script must be run from the pokemon-overlay-plugin/ folder."
    red "  Expected: $SCRIPT_DIR/dist/index.js and $SCRIPT_DIR/plugin.json"
    exit 1
fi

blue "▶ Testing SSH connection to $DEST…"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$DEST" true 2>/dev/null; then
    red "ERROR: Cannot SSH to $DEST"
    red "  Make sure:"
    red "    1. The Steam Deck is on and connected to the network"
    red "    2. SSH is enabled (Settings → System → Developer → Enable SSH)"
    red "    3. The hostname/user is correct"
    red "  Or use the 'USB transfer' method described in DEPLOY.md"
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
    chmod +x "$tmp/$PLUGIN_NAME/setup.sh"
    (cd "$tmp" && tar czf - "$PLUGIN_NAME/") | ssh "$DEST" "cd ~/homebrew/plugins && tar xzf -"
    rm -rf "$tmp"
    green "  ✓ Synced via tar"
fi

blue "▶ Running setup.sh on the Steam Deck…"
echo
ssh "$DEST" "chmod +x ~/homebrew/plugins/$PLUGIN_NAME/setup.sh && ~/homebrew/plugins/$PLUGIN_NAME/setup.sh"
SSH_STATUS=$?

echo
if [[ $SSH_STATUS -eq 0 ]]; then
    green "============================================================"
    green "  ✓ Deploy successful"
    green "============================================================"
    echo
    blue "  Plugin is now at: $DEST:~/homebrew/plugins/$PLUGIN_NAME/"
    blue "  Restart Decky (or toggle the plugin in QAM) to load it."
else
    red "============================================================"
    red "  ✗ Setup script reported errors"
    red "============================================================"
    red "  Check the output above."
    exit 1
fi
