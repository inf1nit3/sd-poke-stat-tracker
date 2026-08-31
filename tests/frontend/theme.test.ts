import { describe, expect, it } from "vitest";

import { ThemePalette } from "../../src/api";
import {
  DEFAULT_PALETTE,
  paletteToCssVars,
  statusColor,
} from "../../src/theme";

describe("paletteToCssVars", () => {
  it("maps every default palette key to a CSS variable", () => {
    const vars = paletteToCssVars(DEFAULT_PALETTE);
    expect(Object.keys(vars).length).toBe(Object.keys(DEFAULT_PALETTE).length);
    for (const key of Object.keys(DEFAULT_PALETTE)) {
      const varName =
        "--theme-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
      expect(vars).toHaveProperty(varName);
    }
  });

  it("converts camelCase keys to kebab-case", () => {
    const vars = paletteToCssVars({
      bgSecondary: "rgba(1,2,3,0.4)",
      statusPSN: "#a33ea1",
      badgeShadow: "0 1px 2px black",
    } as ThemePalette);
    expect(vars["--theme-bg-secondary"]).toBe("rgba(1,2,3,0.4)");
    // Documented behavior: consecutive capitals each get their own dash.
    expect(vars["--theme-status-p-s-n"]).toBe("#a33ea1");
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
