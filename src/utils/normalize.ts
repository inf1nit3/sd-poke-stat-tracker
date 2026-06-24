export function normalizeKey(name: string): string {
  return (name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
