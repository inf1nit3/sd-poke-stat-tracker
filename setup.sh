#!/usr/bin/env bash
# pokemon-overlay-plugin — installer for Steam Deck
# Run AFTER extracting the package into ~/homebrew/plugins/pokemon-overlay-plugin/

set -euo pipefail

PLUGIN_NAME="pokemon-overlay-plugin"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

banner() {
    echo
    blue "============================================================"
    blue "  Pokémon Essentials Overlay — Steam Deck installer"
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
        if [[ "$(printf '%s\n3.11' "$pyver" | sort -V | head -1)" != "3.11" ]]; then
            yellow "  ! python 3.11+ recommended (you have $pyver)"
        fi
    fi

    if ! command -v pip3 >/dev/null 2>&1 && ! command -v pip >/dev/null 2>&1; then
        missing+=("pip")
    else
        local pipcmd
        pipcmd="$(command -v pip3 || command -v pip)"
        green "  ✓ pip ($pipcmd)"
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        red "  ✗ Missing tools: ${missing[*]}"
        red ""
        red "  Install them with: sudo steamos-readonly disable && sudo pacman -S python-pip"
        red "  Then re-run this script."
        exit 1
    fi
}

check_plugin_layout() {
    yellow "▶ Verifying plugin layout…"
    local required=(
        "plugin.json"
        "main.py"
        "package.json"
        "pyproject.toml"
        "dist/index.js"
    )
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
    yellow "▶ Installing Python dependencies (psutil, pyyaml, rubymarshal)…"

    local pipcmd
    pipcmd="$(command -v pip3 || command -v pip)"

    if [[ -n "${VIRTUAL_ENV:-}" ]]; then
        yellow "  Detected active venv: $VIRTUAL_ENV"
        "$pipcmd" install --quiet psutil pyyaml rubymarshal
    else
        "$pipcmd" install --user --quiet psutil pyyaml rubymarshal 2>/dev/null || \
        "$pipcmd" install --user --quiet --break-system-packages psutil pyyaml rubymarshal 2>/dev/null || {
            yellow "  --user install failed, retrying with sudo (Decky venv path)…"
            sudo "$pipcmd" install --quiet psutil pyyaml rubymarshal 2>/dev/null || {
                red "  ✗ Could not install Python deps"
                red "  Try manually: $pipcmd install --user psutil pyyaml rubymarshal"
                exit 1
            }
        }
    fi

    local verif_ok=true
    for mod in psutil yaml rubymarshal; do
        if ! python3 -c "import $mod" 2>/dev/null; then
            red "  ✗ Module '$mod' still not importable after install"
            verif_ok=false
        else
            green "  ✓ $mod importable"
        fi
    done

    if ! $verif_ok; then
        red ""
        red "  Some Python modules could not be imported."
        red "  Try with --break-system-packages: $pipcmd install --user --break-system-packages psutil pyyaml rubymarshal"
        exit 1
    fi
}

verify_plugin_imports() {
    yellow "▶ Smoke-testing plugin imports…"
    (
        cd "$PLUGIN_DIR"
        PYTHONPATH="$PLUGIN_DIR" python3 -c "
import sys
sys.path.insert(0, '.')
import types
mock = types.ModuleType('decky')
class L:
    def info(self, *a, **kw): pass
    def warning(self, *a, **kw): pass
    def error(self, *a, **kw): pass
mock.logger = L()
sys.modules['decky'] = mock

import main
import typechart
import saveparser
import savepath
import pbsparser
import pbsfinder
import moves
import themes
import livewatch
print('  All modules import OK')
        "
    )
    green "  ✓ Plugin Python modules import cleanly"
}

check_decky_layout() {
    yellow "▶ Checking Decky plugin layout…"
    if [[ "$PLUGIN_DIR" == */homebrew/plugins/* ]]; then
        green "  ✓ Plugin is in ~/homebrew/plugins/"
    else
        yellow "  ! Plugin folder is: $PLUGIN_DIR"
        yellow "  ! Decky expects plugins under ~/homebrew/plugins/$PLUGIN_NAME/"
        yellow "  ! Move the folder there and re-run, or symlink it:"
        yellow "    ln -s \"$PLUGIN_DIR\" \"\$HOME/homebrew/plugins/$PLUGIN_NAME\""
    fi
}

final_instructions() {
    echo
    green "============================================================"
    green "  ✓ Install complete"
    green "============================================================"
    echo
    blue "  Next steps:"
    blue "  1. Restart Decky (or toggle the plugin off/on in QAM)"
    blue "     QAM → Decky → Pokémon Essentials Overlay"
    blue "  2. Open the plugin in QAM to see the Status tab"
    blue "  3. If save auto-detection fails, set a manual path in"
    blue "     Settings → Save resolution"
    echo
    blue "  Plugin folder: $PLUGIN_DIR"
    echo
    blue "  Logs: check Decky's loader log for '[pokemon-overlay]' lines"
    echo
}

main() {
    banner
    check_requirements
    check_plugin_layout
    install_python_deps
    verify_plugin_imports
    check_decky_layout
    final_instructions
}

main "$@"
