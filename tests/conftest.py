"""
pytest config for deckyplugin smoke tests.

Makes the project root importable so `import main` resolves to the
plugin's main.py (not any other module of the same name on the path).
Mocks `decky` and `decky_plugin` so backend imports work without the
Decky Loader runtime.
"""
import sys
import types
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Add both the project root (for `import main`) and py_modules/
# (for `import saveparser`, `import savepath`, etc.) to the path.
# main.py does this itself at runtime, but tests may import
# submodules directly.
for p in [str(REPO_ROOT), str(REPO_ROOT / "py_modules")]:
    if p not in sys.path:
        sys.path.insert(0, p)

# Inject a fake `decky` module if the real one isn't installed (tests run
# outside the Decky Loader). Tests that need a different logger can
# override this in their own fixtures.
if "decky" not in sys.modules:
    _decky = types.ModuleType("decky")

    class _Logger:
        def info(self, *a, **kw): pass
        def warning(self, *a, **kw): pass
        def error(self, *a, **kw): pass
        def debug(self, *a, **kw): pass

    _decky.logger = _Logger()
    sys.modules["decky"] = _decky

# Inject a fake `decky_plugin` module. The Decky Loader provides this at
# runtime with constants like DECKY_PLUGIN_SETTINGS_DIR. Without it,
# `import main` fails in CI.
if "decky_plugin" not in sys.modules:
    _decky_plugin = types.ModuleType("decky_plugin")
    _decky_plugin.DECKY_PLUGIN_SETTINGS_DIR = str(REPO_ROOT / "data")
    _decky_plugin.DECKY_PLUGIN_RUNTIME_DIR = str(REPO_ROOT / "data")
    _decky_plugin.DECKY_PLUGIN_VERSION = "0.1.0-test"
    # Some modules (e.g. auto_installer) access decky_plugin.logger at
    # module top-level. The Decky Loader exposes a Logger object there;
    # we reuse the same _Logger class from the decky mock above.
    _decky_plugin.logger = _Logger()
    sys.modules["decky_plugin"] = _decky_plugin