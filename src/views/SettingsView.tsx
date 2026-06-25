import {
  ButtonItem,
  Dropdown,
  PanelSection,
  PanelSectionRow,
  TextField,
  Toggle,
} from "@decky/ui";
import { useCallback, useEffect, useState } from "react";
import { api, SaveFileCandidate, SavePathResult } from "../api";
import { applySettingsPatch, refreshMoves, refreshTheme, useStore } from "../store";

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
  const [resolved, setResolved] = useState<SavePathResult | null>(null);
  const [candidates, setCandidates] = useState<SaveFileCandidate[]>([]);
  const [overrideInput, setOverrideInput] = useState<string>("");
  const [pbsInput, setPbsInput] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [pbsBusy, setPbsBusy] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [themes, setThemes] = useState<{ id: string; name: string; description: string }[]>([]);

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
    refresh();
  }, [refresh]);

  useEffect(() => {
    api
      .getThemes()
      .then((r) => setThemes(r.themes))
      .catch((e: Error) => console.error("themes", e));
  }, [theme?.id]);

  useEffect(() => {
    if (settings) setOverrideInput(settings.save_path_override ?? "");
  }, [settings?.save_path_override]);

  useEffect(() => {
    if (movesDb) setPbsInput(movesDb.pbs_source ?? "");
  }, [movesDb?.pbs_source]);

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

  const setScanInterval = useCallback(async (v: number) => {
    try {
      await applySettingsPatch({ scan_interval_seconds: Math.max(5, v) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusError(msg);
    }
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
      await refreshTheme();
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

  if (!settings) {
    return (
      <PanelSection title="Settings">
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: "#969696" }}>Loading…</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection title="Save resolution">
        <PanelSectionRow>
          <div style={{ fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active save
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: resolved?.path ? "#5eba7d" : "#e0a458", wordBreak: "break-all" }}>
            {resolved?.path || "— no save found —"}
          </div>
        </PanelSectionRow>
        {resolved?.using_override && (
          <PanelSectionRow>
            <div style={{ fontSize: 10, color: "#777" }}>
              (using manual override)
            </div>
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
          <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
            If auto-detection fails, paste the full path to a save file here. Leave blank to use auto-detection.
          </div>
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
          <Toggle value={settings.auto_scan_enabled} onChange={setAutoScan}>
            Auto-scan running processes and Wine prefixes
          </Toggle>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Display">
        <PanelSectionRow>
          <Toggle value={settings.compact_mode} onChange={setCompactMode}>
            Compact mode (auto-hide empty sections)
          </Toggle>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Theme">
        <PanelSectionRow>
          <div style={{ fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active theme
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: 12, color: theme ? theme.palette.accent : "#888" }}>
            {theme ? theme.name : "Loading…"}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <Dropdown
            menuLabel="Theme"
            selectedOption={settings.theme || "default"}
            onChange={(opt) => setTheme(opt.data)}
            options={themes.map((t) => ({ data: t.id, label: t.name }))}
            disabled={themes.length === 0}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="PBS moves database">
        <PanelSectionRow>
          <div style={{ fontSize: 11, color: "#969696", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Active PBS source
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: 11, color: movesDb?.pbs_source ? "#5eba7d" : "#888", wordBreak: "break-all" }}>
            {movesDb?.pbs_source ? shortenPath(movesDb.pbs_source, 80) : "— not loaded (using static DB) —"}
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ fontSize: 10, color: "#777" }}>
            {movesDb ? `${movesDb.merged_count} moves total · ${movesDb.static_count} static · ${movesDb.pbs_count} from game PBS` : "Loading…"}
          </div>
        </PanelSectionRow>
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
          <Toggle value={settings.touchmenu_enabled} onChange={setTouchmenu}>
            Enable in-game touch menu
          </Toggle>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Polling">
        <PanelSectionRow>
          <div style={{ fontSize: 11, color: "#888" }}>
            Backend live watcher checks the disk every{" "}
            <strong style={{ color: "#ccc" }}>{Math.max(5, settings.scan_interval_seconds)}</strong>
            {" "}units. The UI will always update instantly when changes occur.
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <TextField
            label="Interval (seconds)"
            value={String(settings.scan_interval_seconds)}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setScanInterval(n);
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Toggle value={settings.watcher_enabled ?? true} onChange={setWatcherEnabled}>
            Live save watcher (sub-second updates)
          </Toggle>
        </PanelSectionRow>
      </PanelSection>

      {candidates.length > 0 && (
        <PanelSection title={`Discovered saves (${candidates.length})`}>
          {candidates.slice(0, 20).map((c) => (
            <PanelSectionRow key={c.path}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, color: "#ddd", wordBreak: "break-all" }}>
                  {c.path}
                </div>
                <div style={{ fontSize: 10, color: "#777" }}>
                  {fmtSize(c.size)} · modified {fmtTime(c.modified)}
                </div>
              </div>
              <ButtonItem layout="inline" onClick={() => useCandidate(c.path)}>
                Use this save
              </ButtonItem>
            </PanelSectionRow>
          ))}
          {candidates.length > 20 && (
            <PanelSectionRow>
              <div style={{ fontSize: 11, color: "#777", fontStyle: "italic" }}>
                …and {candidates.length - 20} more. Use override to select specific file.
              </div>
            </PanelSectionRow>
          )}
        </PanelSection>
      )}

      {(statusMsg || statusError) && (
        <PanelSection title="Status">
          {statusMsg && (
            <PanelSectionRow>
              <div style={{ fontSize: 12, color: "#5eba7d" }}>{statusMsg}</div>
            </PanelSectionRow>
          )}
          {statusError && (
            <PanelSectionRow>
              <div style={{ fontSize: 12, color: "#e87b7b" }}>{statusError}</div>
            </PanelSectionRow>
          )}
        </PanelSection>
      )}
    </>
  );
}
