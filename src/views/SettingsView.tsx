import {
  ButtonItem,
  Dropdown,
  Focusable,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
} from "@decky/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, SaveBackupInfo, SaveFileCandidate, SavePathResult } from "../api";
import { applySettingsPatch, refreshMoves, retryRefreshStatic, useStore } from "../store";

function fmtTime(epoch: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function shortenPath(p: string, max = 60): string {
  if (p.length <= max) return p;
  const parts = p.split("/");
  if (parts.length <= 3) return "…" + p.slice(-max + 1);
  return parts.slice(0, 2).join("/") + "/…/" + parts.slice(-2).join("/");
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const movesDb = useStore((s) => s.movesDatabase);
  const theme = useStore((s) => s.theme);
  // themes list is fetched once via the API but cached locally so the
  // Dropdown doesn't unmount when the active theme changes.
  const [resolved, setResolved] = useState<SavePathResult | null>(null);
  const [candidates, setCandidates] = useState<SaveFileCandidate[]>([]);
  const [overrideInput, setOverrideInput] = useState<string>("");
  const [pbsInput, setPbsInput] = useState<string>("");
  const [scanIntervalInput, setScanIntervalInput] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [pbsBusy, setPbsBusy] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [themes, setThemes] = useState<
    { id: string; name: string; description: string }[]
  >([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const [r, c] = await Promise.all([api.findSavePath(), api.listSaveFiles()]);
      setResolved(r);
      setCandidates(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([api.findSavePath(), api.listSaveFiles()])
      .then(([r, c]) => { if (!cancelled) { setResolved(r); setCandidates(c); } })
      .catch((e: Error) => { if (!cancelled) setStatusError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);

  // Fetch the themes list once on mount.
  useEffect(() => {
    let cancelled = false;
    if (themes.length > 0) return;
    api.getThemes()
      .then((r) => { if (!cancelled) setThemes(r.themes); })
      .catch((e: Error) => console.error("themes", e));
    return () => { cancelled = true; };
  }, []);

  // Initialize input fields from settings/movesDb ONCE (not on every change
  // — that would clobber the user's in-progress typing).
  const overrideInit = useRef(false);
  const pbsInit = useRef(false);
  const scanInit = useRef(false);
  useEffect(() => {
    if (settings && !overrideInit.current) {
      setOverrideInput(settings.save_path_override ?? "");
      overrideInit.current = true;
    }
  }, [settings]);
  useEffect(() => {
    if (movesDb && !pbsInit.current) {
      setPbsInput(movesDb.pbs_source ?? "");
      pbsInit.current = true;
    }
  }, [movesDb]);
  useEffect(() => {
    if (settings && !scanInit.current) {
      setScanIntervalInput(String(settings.scan_interval_seconds));
      scanInit.current = true;
    }
  }, [settings]);

  const reloadPbsAuto = useCallback(async () => {
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api.autoLoadPbs();
      await refreshMoves();
      if (r.loaded) {
        setStatusMsg(
          `Auto-loaded ${r.database.pbs_count} moves from PBS: ${shortenPath(r.source ?? "")}`
        );
      } else {
        setStatusMsg("No PBS/moves.txt found in common locations.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, []);

  const applyPbsPath = useCallback(async () => {
    if (!pbsInput.trim()) return;
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api.loadPbsMoves(pbsInput.trim());
      await refreshMoves();
      if (r.loaded) {
        setStatusMsg(`Loaded ${r.count} moves from PBS file.`);
      } else {
        setStatusError("Failed to load PBS file (file not readable or malformed).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, [pbsInput]);

  const clearPbs = useCallback(async () => {
    setPbsInput("");
    setPbsBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await api.clearPbs();
      await refreshMoves();
      setStatusMsg("PBS override cleared. Static moves database only.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setPbsBusy(false);
    }
  }, []);

  const applyOverride = useCallback(async () => {
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const next = overrideInput.trim() === "" ? null : overrideInput.trim();
      await applySettingsPatch({ save_path_override: next });
      setStatusMsg(next ? "Override saved." : "Override cleared.");
      const r = await api.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, [overrideInput]);

  const clearOverride = useCallback(async () => {
    setOverrideInput("");
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await applySettingsPatch({ save_path_override: null });
      setStatusMsg("Override cleared.");
      const r = await api.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const useCandidate = useCallback(async (path: string) => {
    setOverrideInput(path);
    setBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      await applySettingsPatch({ save_path_override: path });
      setStatusMsg(`Override set: ${path}`);
      const r = await api.findSavePath();
      setResolved(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const setAutoScan = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ auto_scan_enabled: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const setTouchmenu = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ touchmenu_enabled: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const scanDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear a pending debounce on unmount so it can't fire after the user
  // has left the Settings view.
  useEffect(() => {
    return () => {
      if (scanDebounce.current) clearTimeout(scanDebounce.current);
    };
  }, []);
  const setScanInterval = useCallback((v: number) => {
    const clamped = Math.max(5, v);
    if (scanDebounce.current) clearTimeout(scanDebounce.current);
    scanDebounce.current = setTimeout(() => {
      applySettingsPatch({ scan_interval_seconds: clamped }).catch((e: Error) =>
        setStatusError(e.message)
      );
    }, 500);
  }, []);

  const setCompactMode = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ compact_mode: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const setTheme = useCallback(async (v: string) => {
    try {
      await applySettingsPatch({ theme: v });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const setWatcherEnabled = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ watcher_enabled: v });
      setStatusMsg(v ? "Live save watcher enabled." : "Live save watcher disabled.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const setTypeChartGen = useCallback(async (v: number) => {
    try {
      await applySettingsPatch({ type_chart_gen: v });
      setStatusMsg(`Type chart set to Gen ${v === 9 ? "6+ (Modern)" : "5 (Classic)"}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const setLiveMemory = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ live_memory_enabled: v });
      setStatusMsg(
        v
          ? "Live memory reading enabled. Updates come from game process memory; the disk watcher is kept as fallback."
          : "Live memory reading disabled. Updates come from the save file only."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const [backups, setBackups] = useState<SaveBackupInfo[] | null>(null);
  const [backupDir, setBackupDir] = useState<string>("");
  const [backupBusy, setBackupBusy] = useState<boolean>(false);

  const refreshBackups = useCallback(async () => {
    setBackupBusy(true);
    try {
      const r = await api.getSaveBackups();
      setBackups(r.backups);
      setBackupDir(r.dir);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  useEffect(() => {
    refreshBackups();
  }, [refreshBackups]);

  const setBackupsEnabled = useCallback(async (v: boolean) => {
    try {
      await applySettingsPatch({ backups_enabled: v });
      setStatusMsg(v ? "Save backups enabled." : "Save backups disabled.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
  }, []);

  const restoreBackup = useCallback(async (name: string) => {
    setBackupBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api.restoreSaveBackup(name);
      if (r.ok) {
        setStatusMsg(`Backup restored: ${name}`);
      } else {
        setStatusError(r.error ?? "Restore failed.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const exportSave = useCallback(async () => {
    setBackupBusy(true);
    setStatusMsg(null);
    setStatusError(null);
    try {
      const r = await api.exportSaveSummary();
      if (r.ok && r.path) {
        setStatusMsg(`Save exported (${fmtSize(r.bytes ?? 0)}): ${shortenPath(r.path, 80)}`);
      } else {
        setStatusError(r.error ?? "Export failed (is a save loaded?).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const clearNuzlocke = useCallback(async () => {
    setBackupBusy(true);
    try {
      await api.clearNuzlockeLog();
      setStatusMsg("Nuzlocke log cleared.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  if (!settings) {
    return (
      <PanelSection title="Settings">
        <PanelSectionRow>
          <Focusable
            style={{
              color: "var(--theme-hp-warn, #e0a458)",
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            Settings aren't loaded yet. The Decky Loader may be
            reloading the plugin in the background.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable style={{ fontSize: 12, color: "var(--theme-text-muted, #969696)", padding: "4px 0" }}>
            Loading…
            <span
              style={{
                fontSize: 11,
                color: "var(--theme-info, #56b4e9)",
                cursor: "pointer",
                textDecoration: "underline",
                marginLeft: 8,
              }}
              onClick={() => {
                retryRefreshStatic();
              }}
            >
              Reload
            </span>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="Save resolution">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #969696)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active save
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable style={{ fontSize: 12, color: resolved?.path ? "var(--theme-accent, #5eba7d)" : "var(--theme-hp-warn, #e0a458)", wordBreak: "break-all" }}>
            {resolved?.path || "— no save found —"}
          </Focusable>
        </PanelSectionRow>
        {resolved?.using_override && (
          <PanelSectionRow>
            <Focusable style={{ fontSize: 10, color: "var(--theme-text-faint, #777)" }}>
              (using manual override)
            </Focusable>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={refresh} disabled={busy}>
            {busy ? "Scanning…" : "Rescan saves"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Manual override">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #888)", lineHeight: 1.4 }}>
            If auto-detection fails, paste the full path to a save file here. Leave blank to use auto-detection.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Path to save file"
            value={overrideInput}
            onChange={(e) => setOverrideInput(e.target.value)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={applyOverride} disabled={busy}>
            Apply override
          </ButtonItem>
        </PanelSectionRow>
        {settings.save_path_override && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={clearOverride} disabled={busy}>
              Clear override
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="Auto-detect options">
        <PanelSectionRow>
          <ToggleField
            label="Auto-scan running processes and Wine prefixes"
            checked={settings.auto_scan_enabled}
            onChange={setAutoScan}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Display">
        <PanelSectionRow>
          <ToggleField
            label="Compact mode (auto-hide empty sections)"
            checked={settings.compact_mode}
            onChange={setCompactMode}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Dropdown
            menuLabel="Type Chart Generation"
            selectedOption={settings.type_chart_gen ?? 9}
            onChange={(opt) => setTypeChartGen(opt.data as number)}
            rgOptions={[
              { data: 9, label: "Gen 6+ (Modern: Fairy, Steel nerfed)" },
              { data: 5, label: "Gen 2-5 (Classic: No Fairy, Steel resists Dark/Ghost)" },
            ]}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Theme">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #969696)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active theme
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable style={{ fontSize: 12, color: theme ? theme.palette.accent : "var(--theme-text-muted, #888)" }}>
            {theme ? theme.name : "Loading…"}
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Dropdown
            menuLabel="Theme"
            selectedOption={settings.theme || "default"}
            onChange={(opt) => setTheme(opt.data)}
            rgOptions={themes.map((t) => ({ data: t.id, label: t.name }))}
            disabled={themes.length === 0}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="PBS moves database">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #969696)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active PBS source
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: movesDb?.pbs_source ? "var(--theme-accent, #5eba7d)" : "var(--theme-text-muted, #888)", wordBreak: "break-all" }}>
            {movesDb?.pbs_source ? shortenPath(movesDb.pbs_source, 80) : "— not loaded (using static DB) —"}
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable style={{ fontSize: 10, color: "var(--theme-text-faint, #777)" }}>
            {movesDb ? `${movesDb.merged_count} moves total · ${movesDb.static_count} static · ${movesDb.pbs_count} from game PBS` : "Loading…"}
          </Focusable>
        </PanelSectionRow>
        {Object.keys(settings.pbs_profiles ?? {}).length > 0 && (
          <PanelSectionRow>
            <Focusable style={{ fontSize: 10, color: "var(--theme-text-muted, #888)", lineHeight: 1.4 }}>
              Saved per-game PBS profiles:{" "}
              {Object.entries(settings.pbs_profiles ?? {})
                .map(([game, path]) => `${game} → ${shortenPath(path, 40)}`)
                .join(" · ")}
            </Focusable>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={reloadPbsAuto} disabled={pbsBusy}>
            {pbsBusy ? "Scanning…" : "Auto-discover PBS"}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Manual PBS path (moves.txt)"
            value={pbsInput}
            onChange={(e) => setPbsInput(e.target.value)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={applyPbsPath} disabled={pbsBusy || !pbsInput.trim()}>
            Load PBS from path
          </ButtonItem>
        </PanelSectionRow>
        {movesDb?.pbs_source && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={clearPbs} disabled={pbsBusy}>
              Clear PBS (use static only)
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="TouchMenu overlay">
        <PanelSectionRow>
          <ToggleField
            label="Enable in-game touch menu"
            checked={settings.touchmenu_enabled}
            onChange={setTouchmenu}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Live memory reading">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #888)", lineHeight: 1.4 }}>
            When the game is running, read party state directly from the
            game's process memory. Updates arrive every ~1s without waiting
            for the game to save to disk. Opt-in: the disk watcher still
            runs as a fallback if memory reading fails.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Read live data from game process memory"
            checked={Boolean(settings?.live_memory_enabled)}
            onChange={setLiveMemory}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Polling">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #888)" }}>
            The backend save watcher checks the disk every 2–5 seconds
            (derived from the interval below). UI updates arrive within
            seconds of any save.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Interval (seconds)"
            value={scanIntervalInput}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setScanIntervalInput(e.target.value);
              if (!isNaN(n)) setScanInterval(n);
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Live save watcher (sub-second updates)"
            checked={settings.watcher_enabled ?? true}
            onChange={setWatcherEnabled}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Safety & data">
        <PanelSectionRow>
          <Focusable style={{ fontSize: 11, color: "var(--theme-text-muted, #888)", lineHeight: 1.4 }}>
            Every time the game saves, the plugin can keep a copy of the
            save file. If the save ever gets corrupted, restore one of the
            backups below.
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Rolling save backups"
            checked={settings.backups_enabled ?? true}
            onChange={setBackupsEnabled}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={exportSave} disabled={backupBusy}>
            Export save summary (JSON)
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={clearNuzlocke} disabled={backupBusy}>
            Clear Nuzlocke log
          </ButtonItem>
        </PanelSectionRow>
        {backups && backups.length > 0 && (
          <>
            <PanelSectionRow>
              <Focusable style={{ fontSize: 10, color: "var(--theme-text-faint, #777)", wordBreak: "break-all" }}>
                {backups.length} backup(s) in {shortenPath(backupDir, 70)}
              </Focusable>
            </PanelSectionRow>
            {backups.slice(0, 5).map((b) => (
              <PanelSectionRow key={b.name}>
                <Focusable style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text-secondary, #ddd)", wordBreak: "break-all" }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--theme-text-faint, #777)" }}>
                    {fmtSize(b.size)} · {fmtTime(b.modified)}
                  </div>
                </Focusable>
                <ButtonItem layout="inline" onClick={() => restoreBackup(b.name)} disabled={backupBusy}>
                  Restore
                </ButtonItem>
              </PanelSectionRow>
            ))}
          </>
        )}
      </PanelSection>

      {candidates.length > 0 && (
        <PanelSection title={`Discovered saves (${candidates.length})`}>
          {candidates.slice(0, 20).map((c) => (
            <PanelSectionRow key={c.path}>
              <Focusable style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, color: "var(--theme-text-secondary, #ddd)", wordBreak: "break-all" }}>
                  {c.path}
                </div>
                <div style={{ fontSize: 10, color: "var(--theme-text-faint, #777)" }}>
                  {fmtSize(c.size)} · modified {fmtTime(c.modified)}
                </div>
              </Focusable>
              <ButtonItem layout="inline" onClick={() => useCandidate(c.path)}>
                Use this save
              </ButtonItem>
            </PanelSectionRow>
          ))}
          {candidates.length > 20 && (
            <PanelSectionRow>
              <Focusable style={{ fontSize: 11, color: "var(--theme-text-faint, #777)", fontStyle: "italic" }}>
                …and {candidates.length - 20} more. Use override to select specific file.
              </Focusable>
            </PanelSectionRow>
          )}
        </PanelSection>
      )}

      {(statusMsg || statusError) && (
        <PanelSection title="Status">
          {statusMsg && (
            <PanelSectionRow>
              <Focusable style={{ fontSize: 12, color: "var(--theme-accent, #5eba7d)" }}><div>{statusMsg}</div></Focusable>
            </PanelSectionRow>
          )}
          {statusError && (
            <PanelSectionRow>
              <Focusable style={{ fontSize: 12, color: "var(--theme-danger, #e87b7b)" }}><div>{statusError}</div></Focusable>
            </PanelSectionRow>
          )}
        </PanelSection>
      )}
    </>
  );
}
