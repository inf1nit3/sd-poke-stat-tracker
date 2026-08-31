import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/frontend/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // The decky runtime only exists inside Steam's CEF; tests stub it.
      "@decky/api": path.resolve(rootDir, "tests/frontend/mocks/decky-api.ts"),
    },
  },
});
