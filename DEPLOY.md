# Deploy to Steam Deck

This guide walks through getting `pokemon-overlay-plugin` onto your Steam Deck.

## Prerequisites

- Decky Loader installed and running (QAM shows the Decky icon)
- SSH access to the Steam Deck OR a way to copy the plugin folder via USB/network share
- The Steam Deck must have run the Pokémon Essentials fan game at least once (so the Wine prefix exists for save-file detection). The plugin still works without this — it will just show a "no save found" message until you set a manual path.

## Option A: Direct copy (recommended)

The simplest path. From your computer:

1. **Extract the package** — either unzip `pokemon-overlay-plugin.zip` or untar `pokemon-overlay-plugin.tar.gz` into a folder. The folder name will be `pokemon-overlay-plugin` (the contents include `plugin.json`, `main.py`, `dist/`, `data/`, etc. directly at the top level).

2. **Copy to the Steam Deck** — using whichever method you prefer:
   - **SSH** (recommended):
     ```bash
     scp -r pokemon-overlay-plugin/ deck@steamdeck:/home/deck/homebrew/plugins/
     ```
   - **USB stick**: Copy the `pokemon-overlay-plugin/` folder to a USB stick, plug into the Steam Deck, then in Desktop Mode move it to `~/homebrew/plugins/`.
   - **Network share / Syncthing / etc.**: any sync method that lands the folder at `~/homebrew/plugins/pokemon-overlay-plugin/`.

3. **Verify the path** — the final layout must look like:
   ```
   ~/homebrew/plugins/pokemon-overlay-plugin/
   ├── plugin.json
   ├── main.py
   ├── package.json
   ├── pyproject.toml
   ├── README.md
   ├── dist/
   │   └── index.js          ← the built frontend
   ├── data/
   │   ├── type_chart.json   ← baked-in
   │   ├── moves.json        ← baked-in
   │   └── themes.json       ← baked-in
   ├── livewatch.py
   ├── moves.py
   ├── pbsfinder.py
   ├── pbsparser.py
   ├── saveparser.py
   ├── savepath.py
   ├── themes.py
   └── typechart.py
   ```

## Option B: Install via scp into Decky plugin path

```bash
# From your computer
scp pokemon-overlay-plugin.zip deck@steamdeck:/tmp/

# On the Steam Deck (via SSH or Desktop terminal)
ssh deck@steamdeck
cd ~/homebrew/plugins
unzip /tmp/pokemon-overlay-plugin.zip -d pokemon-overlay-plugin
ls pokemon-overlay-plugin/  # should show main.py, dist/, data/, etc.
```

## Post-install

### 1. Install Python dependencies (one-time)

The plugin needs `psutil`, `pyyaml`, and `rubymarshal` in addition to what Decky already provides (`python-decky`).

On the Steam Deck, in the plugin directory:

```bash
cd ~/homebrew/plugins/pokemon-overlay-plugin
pip install --user psutil pyyaml rubymarshal
```

If your Decky runs Decky in a venv (older versions), use that venv's pip:

```bash
sudo /opt/decky/bin/pip install psutil pyyaml rubymarshal
```

### 2. Restart Decky

In the Steam Deck's Game Mode, open QAM (the `...` button), scroll to the Decky section, and either:
- Toggle the plugin off and on again
- Or fully restart Decky (some installs need this)

### 3. Verify

Open QAM → look for "Pokémon Essentials Overlay" in the plugin list. Click it. You should see the **Status** tab with:
- "Backend ready" (green dot)
- "Type chart loaded (18 types)"
- "Moves DB: 261 static only" (until PBS auto-loads)

If the Pokémon game has been run, the **Party** tab will show the trainer info. Otherwise, configure a manual save path in **Settings → Save resolution**.

## Troubleshooting

### Plugin doesn't appear in QAM
- Check that `~/homebrew/plugins/pokemon-overlay-plugin/plugin.json` exists and is valid JSON
- Check Decky's log: `cat ~/.config/decky/loader.log` (or wherever your install writes logs)
- Make sure the plugin folder is **directly** under `homebrew/plugins/`, not nested in another folder

### "Module not found: psutil / rubymarshal"
- Run `pip install --user psutil pyyaml rubymarshal` again
- If using a venv install, use the venv's pip

### "No save file found" even though the game has saves
- The game must have been run **at least once** on this Steam Deck so the Wine prefix exists at `~/.steam/steam/steamapps/compatdata/<APPID>/pfx/`
- If the game is installed in a non-standard location, set the manual path in **Settings → Save resolution → Manual override**

### TouchMenu doesn't appear in-game
- Two-finger tap on the screen (some users need to do it twice)
- Make sure **Settings → TouchMenu overlay** is enabled
- If the menu overlaps with the game's UI elements, drag it to a less-obtrusive area

### PBS moves not loading
- **Settings → PBS moves database → Auto-discover PBS** to retry
- If the PBS file isn't where the plugin expects, set a manual path: e.g. `~/.steam/steam/steamapps/common/<GAME>/PBS/moves.txt`
- The plugin falls back to a static Gen 1-6 database (~260 moves) if PBS is unavailable

### Plugin loads but type chart / party are empty
- Check the **Status** tab for the "Backend ready" indicator
- If it shows "Backend not initialized", there's likely a Python error — check `~/.config/decky/loader.log` for stack traces

## Where to find logs

- Decky loader log: `~/.config/decky/loader.log` (or similar; check your install)
- Plugin logs: look for `[pokemon-overlay]` lines in the loader log

## Updating the plugin

To update to a new version:
1. Stop the plugin in QAM (or restart Decky)
2. Replace the contents of `~/homebrew/plugins/pokemon-overlay-plugin/`
3. Restart the plugin

The `data/settings.json` is created at runtime; you can keep it across updates to preserve your settings.

## Uninstalling

```bash
rm -rf ~/homebrew/plugins/pokemon-overlay-plugin
```

Then restart Decky.
