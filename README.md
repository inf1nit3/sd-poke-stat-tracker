# SD Poké Stat Tracker

A Decky plugin for the Steam Deck that brings a live **party stat tracker**, interactive type chart, and a draggable touch menu to **Pokémon Essentials** fan games (RPG Maker XP / MV / MZ, run via Proton).

GitHub: https://github.com/inf1nit3/sd-poke-stat-tracker

## Features

### QAM (Quick Access Menu)
- **Type chart** — full 18-type chart (Gen 6 values) with interactive Defender and Attacker lookup modes
- **Party status** — trainer info (money, badges, location, play time) plus all 6 party members with HP bars, status overlays, type badges, gender symbols, shiny markers, moves, IVs/EVs/happiness (when available)
- **Settings** — manual save-path override, list of all discovered saves, PBS moves DB loader (auto + manual), auto-scan toggle, polling interval, live save watcher toggle, theme picker, display compact-mode toggle, TouchMenu on/off
- **Detected features** — the UI only shows sections that have data from the save (no empty placeholders)

### TouchMenu (in-game overlay)
- **Party HP at a glance** — 6 compact party member rows, each with HP bar, status, types, gender, shiny indicator, move type badges
- **Type Lookup** — quick attacker-type effectiveness check while in battle
- **Move Lookup** — tap a move from the party to see its type, category, power, accuracy, PP, description, and effectiveness against all types
- **Two-finger tap** opens the menu overlay over the running game
- **Position is draggable** via Steam's native touch menu handles

### Live updates
- **Save file watcher** — sub-second updates when the game saves (mtime polling, ~1s latency, near-zero CPU)
- **Polling fallback** — configurable interval (default 30s, minimum 5s) for systems where the watcher doesn't trigger
- **Game process detection** — shows whether a Pokémon Essentials game is currently running
- **PBS auto-load** — discovers the game's PBS/moves.txt from the save folder and loads it on first run, including all custom moves

### Themes
- **Default Dark** — dark theme tuned for Steam Deck OLED
- **Light** — for daytime / bright environments
- **Solarized** — high-contrast, easy on the eyes
- **Colorblind (Wong palette)** — distinguishable for all common color-vision deficiency types

## Project status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation, settings persistence, plugin lifecycle | done |
| 2 | Static type chart + QAM lookup (defense + offense mode) | done |
| 3 | Save-path auto-detection, `.rxdata` parser, PartyView, SettingsView | done |
| 4 | TouchMenu overlay (Party + Type Lookup) + global store with polling | done |
| 5a | Live PBS moves (custom moves, auto-discovery) | done |
| 5b | IV/EV/Happiness display with totals | done |
| 5c | Dynamic UI — only show sections that have data | done |
| 5d | Multi-theme support (4 themes) | done |
| 5e | Live save watcher + process detection | done |

## Project structure

```
sd-poke-stat-tracker/
├── main.py                # Python backend (Plugin class, lifecycle, settings, glue)
├── package.json           # Frontend package + scripts
├── plugin.json            # Decky plugin manifest
├── pyproject.toml         # Python dependencies
├── tsconfig.json          # TypeScript config
├── rollup.config.js       # Rollup bundler config
├── install.sh             # Deploy-to-Steam-Deck script (rsync + setup)
├── rebuild.sh             # Rebuild frontend bundle (dev only)
├── setup.sh               # Fast installer run on the Steam Deck
├── data/
│   ├── type_chart.json    # Static type chart (Gen 6, 18 types)
│   ├── moves.json         # Static moves DB (Gen 1-6, ~260 moves)
│   └── themes.json        # 4 built-in themes
├── py_modules/            # Backend modules (importable as `py_modules.*`)
│   ├── _marshal_compat.py # Ruby Marshal forward-ref patch (TYPE_LINK)
│   ├── typechart.py       # Static type chart (Gen 6) + lookup helpers
│   ├── saveparser.py      # Ruby Marshal v4.8 parser for .rxdata
│   ├── savepath.py        # Save-file path resolver (Wine + native Steam)
│   ├── pbsparser.py       # PBS file parser (moves, pokemon, types)
│   ├── pbsfinder.py       # PBS file finder (Wine prefixes + Steam library)
│   ├── moves.py           # Merged moves DB (static + PBS + heuristic fallback)
│   ├── themes.py          # Theme manager + palette loader
│   ├── steampaths.py      # Steam install / Wine prefix path helpers
│   └── livewatch.py       # Save-file watcher + process detection + stream server
├── game-mod/              # Ruby plugin installed into the game's Plugins/
│   ├── meta.txt
│   └── stream.rb          # Live state streamer (TCP → 127.0.0.1:9988)
├── scripts/
│   └── install_game_mod.py # Installs game-mod into a Pokémon Essentials game dir
├── tools/                 # Test save/PBS generators (Ruby)
├── tests/                 # pytest smoke tests
├── dist/
│   └── index.js           # Built frontend bundle
└── src/
    ├── index.tsx          # definePlugin entry, tab routing, theme variables
    ├── api.ts             # Typed @decky/api wrapper
    ├── store.ts           # Global state via useSyncExternalStore + polling
    ├── theme.ts           # Theme palette + CSS variable conversion
    ├── decky.d.ts         # Type declarations for external Decky modules
    ├── utils/
    │   └── normalize.ts   # Name normalization helpers
    ├── components/
    │   ├── ErrorBoundary.tsx
    │   ├── HealthBar.tsx
    │   ├── PokeballIcon.tsx
    │   ├── PokemonCard.tsx       # Capability-aware conditional rendering
    │   ├── TabBar.tsx
    │   ├── TypeBadge.tsx
    │   └── TypeChartGrid.tsx
    ├── touchmenu/
    │   ├── index.tsx                  # register/unregister via PatchTouchMenu
    │   ├── TouchMenuContent.tsx       # 3-tab switcher
    │   ├── PartyTouchMenu.tsx         # in-game party HP display
    │   ├── TypeLookupTouchMenu.tsx    # in-game type chart quick lookup
    │   └── MoveLookupTouchMenu.tsx    # in-game per-move effectiveness
    └── views/
        ├── HomeView.tsx       # Status tab
        ├── TypeChartView.tsx  # Type Chart tab
        ├── PartyView.tsx      # Party tab
        ├── BattleAnalyzerView.tsx  # Battle Analyzer (live stream)
        └── SettingsView.tsx   # Settings tab
```

## Development

```bash
# Install dependencies
pnpm install

# Watch & rebuild frontend on change
pnpm run watch

# Production build
pnpm run build

# Run the plugin (for remote debugging on Steam Deck)
pnpm run decky
```

## Testing the parser

A Ruby-based test save generator is included in the `tools/` directory (or see the
git history). You can generate a synthetic `.rxdata` and exercise the parser:

```bash
ruby tools/gen_test_save.rb
python3 -c "from saveparser import parse_save_file; print(parse_save_file('test_save.rxdata').to_dict())"
```

## Architecture notes

### Dynamic UI

`SaveData` includes a `features` map computed at parse time that tells the
frontend which data is actually available. Each `PokemonSummary` also has
per-Pokemon capability flags. The UI conditionally renders sections so
empty placeholders never appear. Toggle auto-detection in
**Settings → Display → Compact mode**.

### Live PBS moves

`moves.py` loads from three sources in priority order:
1. **PBS** (game's own `PBS/moves.txt`, parsed live from the install directory) — most accurate, includes custom fan-game moves
2. **Static** (`data/moves.json`, Gen 1-6, ~260 moves) — fallback for standard moves
3. **Heuristic** (substring matching on the move name) — last-resort guess

The PBS file is auto-discovered from the save folder on first run. The user can also set a manual path in Settings. Reload after editing `PBS/moves.txt` to pick up changes.

### Live save watcher

A background thread (`livewatch.py`) polls the save file's mtime at ~1Hz. When a change is detected, the save is re-parsed and the in-memory cache is updated. The frontend can fetch the latest data via `get_live_save_data()` or watch `last_live_event` in `get_live_state()`.

Proton's Wine filesystem layer can swallow `inotify` events, so mtime polling is the most reliable approach. Disable the watcher in Settings for battery savings; the periodic polling fallback will still keep data fresh.

## Backend contract

### Plugin info
| Method | Returns | Description |
|---|---|---|
| `get_plugin_info` | `PluginInfo` | Name, version, init status, type-chart stats |
| `get_settings` | `PluginSettings` | Current settings dict |
| `update_settings` | `PluginSettings` | Merge patch, persist, return updated dict |

### Type chart
| Method | Returns | Description |
|---|---|---|
| `get_type_chart` | `TypeChartData` | Types, colors, multipliers, generation |
| `get_matchup` | `MatchupResult` | STAB-aware multiplier for attacker vs. 1-2 defender types |
| `get_defense_summary` | `DefenseSummary` | All 18 attacking types bucketed by effectiveness |
| `get_offense_summary` | `OffenseSummary` | What an attacking type is super/resist/immune against |

### Save data
| Method | Returns | Description |
|---|---|---|
| `find_save_path` | `SavePathResult` | Resolve active save path |
| `list_save_files` | `SaveFileCandidate[]` | All discoverable saves with size/mtime |
| `get_save_data` | `SaveData` | Parse active save (cached); `force_reload=True` to bypass cache. Includes `features` map and per-Pokemon capability flags |
| `get_save_data_from_path` | `SaveData` | Parse arbitrary path (bypasses cache and override) |

### PBS / Moves
| Method | Returns | Description |
|---|---|---|
| `get_moves_database` | `MovesDatabase` | Merged static + PBS moves; includes per-move source |
| `get_move_info` | `MoveInfo \| null` | Single move lookup |
| `lookup_moves` | `Record<string, MoveInfo \| null>` | Batch lookup |
| `find_pbs_files` | `Record<string, string>` | Locate PBS files |
| `load_pbs_moves` | `PbsLoadResult` | Force-load a specific PBS file |
| `auto_load_pbs` | `PbsAutoLoadResult` | Re-attempt auto-discovery |

### Themes
| Method | Returns | Description |
|---|---|---|
| `get_themes` | `ThemesResponse` | All themes + currently active one with full palette |
| `get_active_theme` | `Theme` | Just the active theme |

### Live
| Method | Returns | Description |
|---|---|---|
| `get_live_state` | `LiveState` | Game-process detection, watcher status, last live event |
| `get_live_save_data` | `SaveData \| null` | Most recent in-memory save data (from watcher) |
| `set_watcher_enabled` | `{watcher_active: boolean}` | Enable/disable the save watcher |
| `find_process_by_save` | `GameProcess \| null` | Find the process that has a given save open |
| `get_process_memory_regions` | `MemoryRegion[]` | Memory map for a given PID (best effort) |

Settings are persisted to `data/settings.json` (atomic write via temp file + `os.replace`).

## Tested against

- Pokémon Essentials v17+ and v16 save structures (RGSS2 / RPG Maker XP, `.rxdata` files)
- Ruby Marshal v4.8 binary format
- Gen 6 type chart (18 types × 18 types = 324 matchup entries)
- Custom fan-game moves (PBS-parsed, including non-standard types)
- Realistic Wine-prefix game installation paths
- Empty / minimal / corrupted save files (graceful errors)
- Multiple type-matchup edge cases (Garchomp 4× Ice, Shedinja 6× immunities, Dragon/Fairy 0×)

## Known limitations

- **No live memory reading of Pokémon objects** — the plugin reads the on-disk save. The watcher provides sub-second updates after the game saves. Direct memory reading of Wine/Proton processes is theoretically possible but currently impractical due to ASLR and Wine's virtual address translation.
- **Auto-detection requires the game to have been run at least once** with the same Steam install (so the Wine prefix exists). Manual override available in Settings.
- **Wine prefix path detection is best-effort.** Standard locations scanned: `~/.steam/steam/steamapps/compatdata/*/pfx/drive_c/users/steamuser/Documents/` and the Flatpak variant.
- **TouchMenu position is controlled by Steam**, not by this plugin. The user can drag the menu via Steam's native touch menu handles.

## License

MIT
