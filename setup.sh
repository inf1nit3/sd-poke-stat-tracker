#!/usr/bin/env bash
# setup.sh — fast installer for the Steam Deck
#
# dist/index.js is pre-built and committed. This script does NOT run
# `pnpm install` (which would download 100+ npm packages and take
# minutes on Steam Deck). It only installs the Python dependencies
# needed at runtime.
#
# Total install time: ~5 seconds (just pip install of 3 small packages)

set -euo pipefail

PLUGIN_NAME="sd-poke-stat-tracker"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

banner() {
    echo
    blue "============================================================"
    blue "  $PLUGIN_NAME — fast installer"
    blue "============================================================"
    echo
}

check_requirements() {
    yellow "▶ Checking requirements…"
    local missing=()

    if ! command -v python3 >/dev/null 2>&1; then
        missing+=("python3")
    else
        local pyver
        pyver="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
        green "  ✓ python3 ($pyver)"
    fi

    # On SteamOS, pip is usually only available as `python3 -m pip`, not as a
    # standalone binary. Check both forms.
    if python3 -m pip --version >/dev/null 2>&1; then
        green "  ✓ pip (python3 -m pip)"
    elif command -v pip3 >/dev/null 2>&1; then
        green "  ✓ pip ($pipcmd)"
    elif command -v pip >/dev/null 2>&1; then
        green "  ✓ pip ($pipcmd)"
    else
        missing+=("pip")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        red "  ✗ Missing tools: ${missing[*]}"
        if [[ " ${missing[*]} " == *" pip "* ]]; then
            red "  Try: python3 -m ensurepip --user"
            red "  Or:   sudo steamos-readonly disable && sudo pacman -S python-pip"
        fi
        exit 1
    fi
}

check_plugin_layout() {
    yellow "▶ Verifying plugin layout…"
    local required=("plugin.json" "main.py" "dist/index.js" "pyproject.toml")
    for f in "${required[@]}"; do
        if [[ -f "$PLUGIN_DIR/$f" ]]; then
            green "  ✓ $f"
        else
            red "  ✗ Missing: $f"
            exit 1
        fi
    done
}

install_python_deps() {
    yellow "▶ Installing Python dependencies (2 small packages)…"

    # Prefer `python3 -m pip` (works on SteamOS where pip isn't on PATH).
    local pipcmd
    if python3 -m pip --version >/dev/null 2>&1; then
        pipcmd="python3 -m pip"
    elif command -v pip3 >/dev/null 2>&1; then
        pipcmd="pip3"
    elif command -v pip >/dev/null 2>&1; then
        pipcmd="pip"
    else
        red "  ✗ No pip available"
        red "  Try: python3 -m ensurepip --user"
        exit 1
    fi

    local installed=true
    for mod in psutil rubymarshal; do
        if python3 -c "import $mod" 2>/dev/null; then
            green "  ✓ $mod (already installed)"
        else
            installed=false
            break
        fi
    done

    if $installed; then
        green "  All deps present, skipping pip install"
        return
    fi

    $pipcmd install --user --quiet psutil rubymarshal 2>/dev/null || \
    $pipcmd install --user --quiet --break-system-packages psutil rubymarshal 2>/dev/null || {
        yellow "  --user failed, trying sudo…"
        sudo $pipcmd install --quiet psutil rubymarshal 2>/dev/null || {
            red "  ✗ Could not install Python deps"
            red "  Try: $pipcmd install --user --break-system-packages psutil rubymarshal"
            exit 1
        }
    }

    for mod in psutil rubymarshal; do
        if python3 -c "import $mod" 2>/dev/null; then
            green "  ✓ $mod"
        else
            red "  ✗ $mod still not importable"
            exit 1
        fi
    done
}

verify_plugin() {
    yellow "▶ Smoke-testing plugin…"
    (
        cd "$PLUGIN_DIR"
        PYTHONPATH="$PLUGIN_DIR:$PLUGIN_DIR/py_modules" python3 -c "
import sys, types
mock = types.ModuleType('decky')
class L:
    def info(self, *a, **kw): pass
    def warning(self, *a, **kw): pass
    def error(self, *a, **kw): pass
mock.logger = L()
sys.modules['decky'] = mock
dp = types.ModuleType('decky_plugin')
dp.DECKY_PLUGIN_SETTINGS_DIR = '$PLUGIN_DIR/data'
dp.DECKY_PLUGIN_RUNTIME_DIR = '$PLUGIN_DIR/data'
sys.modules['decky_plugin'] = dp

import main
print('  main.py imports OK')
from py_modules import typechart, saveparser, savepath, pbsparser, pbsfinder, moves, themes, livewatch
print('  All 8 py_modules import OK')
        " 2>&1
    )
    green "  ✓ Plugin ready"
}

check_decky_layout() {
    yellow "▶ Checking Decky layout…"
    if [[ "$PLUGIN_DIR" == */homebrew/plugins/* ]]; then
        green "  ✓ Plugin is in ~/homebrew/plugins/"
    else
        yellow "  ! Plugin folder is: $PLUGIN_DIR"
        yellow "  ! Move to ~/homebrew/plugins/$PLUGIN_NAME/ for Decky to load it"
    fi
}

final_instructions() {
    echo
    green "============================================================"
    green "  ✓ Install complete in seconds (no npm/pnpm download)"
    green "============================================================"
    echo
    blue "  Next: restart Decky (QAM → Decky → toggle plugin)"
    echo
}

main() {
    banner
    check_requirements
    check_plugin_layout
    install_python_deps
    verify_plugin
    check_decky_layout
    final_instructions
}

main "$@"
