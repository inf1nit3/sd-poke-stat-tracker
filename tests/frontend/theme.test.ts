import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ThemePalette } from "../../src/api";
import {
  DEFAULT_PALETTE,
  paletteToCssVars,
  paletteVarName,
  statusColor,
} from "../../src/theme";

describe("paletteToCssVars", () => {
  it("maps every default palette key to a CSS variable", () => {
    const vars = paletteToCssVars(DEFAULT_PALETTE);
    expect(Object.keys(vars).length).toBe(Object.keys(DEFAULT_PALETTE).length);
    for (const key of Object.keys(DEFAULT_PALETTE)) {
      expect(vars).toHaveProperty(paletteVarName(key));
    }
  });

  it("converts camelCase keys to kebab-case, collapsing acronym runs", () => {
    const vars = paletteToCssVars({
      bgSecondary: "rgba(1,2,3,0.4)",
      statusPSN: "#a33ea1",
      statusOK: "#5eba7d",
      badgeShadow: "0 1px 2px black",
    } as ThemePalette);
    expect(vars["--theme-bg-secondary"]).toBe("rgba(1,2,3,0.4)");
    expect(vars["--theme-status-psn"]).toBe("#a33ea1");
    expect(vars["--theme-status-ok"]).toBe("#5eba7d");
    expect(vars["--theme-badge-shadow"]).toBe("0 1px 2px black");
  });

  it("leaves lowercase keys untouched and coerces values to strings", () => {
    const vars = paletteToCssVars({ bg: "#101010", shiny: 5 } as unknown as ThemePalette);
    expect(vars["--theme-bg"]).toBe("#101010");
    expect(vars["--theme-shiny"]).toBe("5");
  });
});

describe("statusColor", () => {
  it("returns the palette entry for known statuses", () => {
    expect(statusColor(DEFAULT_PALETTE, "PSN")).toBe(DEFAULT_PALETTE.statusPSN);
    expect(statusColor(DEFAULT_PALETTE, "OK")).toBe(DEFAULT_PALETTE.statusOK);
  });

  it("falls back to the genderless color for unknown or empty statuses", () => {
    expect(statusColor(DEFAULT_PALETTE, "XXX")).toBe(DEFAULT_PALETTE.genderless);
    expect(statusColor(DEFAULT_PALETTE, "")).toBe(DEFAULT_PALETTE.genderless);
  });
});

// --- guard: every var() referenced in the UI must exist in the palette -------

function walkSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkSources(full));
    } else if (/\.(tsx?|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("theme var usage", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcDir = join(here, "..", "..", "src");
  const knownVars = new Set(Object.keys(paletteToCssVars(DEFAULT_PALETTE)));

  it("only references CSS variables defined by the palette", () => {
    const referenced = new Set<string>();
    for (const file of walkSources(srcDir)) {
      const text = readFileSync(file, "utf-8");
      for (const m of text.matchAll(/var\((--theme-[a-z0-9-]+)/g)) {
        referenced.add(m[1]);
      }
    }
    expect(referenced.size).toBeGreaterThan(20);
    const unknown = [...referenced].filter((v) => !knownVars.has(v));
    expect(unknown).toEqual([]);
  });

  it("actually uses the theme system across the UI", () => {
    let uses = 0;
    for (const file of walkSources(srcDir)) {
      uses += (readFileSync(file, "utf-8").match(/var\(--theme-/g) || []).length;
    }
    // Round 7 wired the palette into the components; if this drops back
    // to ~0, the theme system has become visually inert again.
    expect(uses).toBeGreaterThan(150);
  });
});

describe("shipped themes.json", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const themesJson = JSON.parse(
    readFileSync(join(here, "..", "..", "data", "themes.json"), "utf-8")
  );

  it("ships multiple selectable themes", () => {
    expect(Object.keys(themesJson.themes).length).toBeGreaterThanOrEqual(4);
  });

  it("has palettes that cover exactly the frontend palette keys", () => {
    const expected = Object.keys(DEFAULT_PALETTE).sort();
    for (const [tid, tdef] of Object.entries<{ palette: Record<string, string> }>(
      themesJson.themes
    )) {
      expect(Object.keys(tdef.palette).sort(), `theme "${tid}"`).toEqual(expected);
    }
  });

  it("matches the backend DEFAULT_PALETTE values for the default theme", () => {
    // The frontend falls back to DEFAULT_PALETTE while the backend falls
    // back to its own copy — they must stay in sync.
    const shipped = themesJson.themes.default.palette;
    for (const [key, value] of Object.entries(DEFAULT_PALETTE)) {
      expect(shipped[key], `key "${key}"`).toBe(value);
    }
  });
});
