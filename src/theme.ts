import { ThemePalette } from "./api";

export const DEFAULT_PALETTE: ThemePalette = {
  bg: "#0e0e0e",
  bgSecondary: "rgba(255,255,255,0.04)",
  bgTertiary: "rgba(255,255,255,0.02)",
  border: "rgba(255,255,255,0.08)",
  text: "#fff",
  textSecondary: "#ccc",
  textMuted: "#888",
  textFaint: "#555",
  accent: "#5eba7d",
  accentBg: "rgba(94,186,125,0.15)",
  shiny: "#f7d02c",
  female: "#e87ba3",
  male: "#7ba3e8",
  genderless: "#888",
  hpGood: "#5eba7d",
  hpWarn: "#e0a458",
  hpBad: "#e87b7b",
  statusOK: "#5eba7d",
  statusPSN: "#a33ea1",
  statusPAR: "#e0a458",
  statusBRN: "#c22e28",
  statusSLP: "#969696",
  statusFRZ: "#96d9d6",
  statusFNT: "#888",
  typeBadgeText: "#fff",
  badgeShadow: "0 1px 2px rgba(0,0,0,0.5)",
};

export type CSSVarMap = Record<`--${string}`, string>;

export function paletteToCssVars(p: ThemePalette): CSSVarMap {
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    const varName = "--theme-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    map[varName] = String(v);
  }
  return map;
}

export function statusColor(p: ThemePalette, status: string): string {
  const key = ("status" + status) as keyof ThemePalette;
  const v = p[key];
  if (typeof v === "string") return v;
  return p.genderless;
}
