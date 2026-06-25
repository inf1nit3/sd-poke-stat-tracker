const esbuild = require("esbuild");
const path = require("path");

const watch = process.argv.includes("--watch");

// Nothing should be external — everything is bundled so the plugin works
// without a Node-style require() at runtime.
//
// @decky/api and decky-frontend-lib are intentionally NOT here: they live in
// the global window namespace on the Steam Deck and are accessed via
// src/decky-shim.js and src/decky-frontend-lib-shim.js.
const config = {
  entryPoints: [path.join(__dirname, "src", "index.tsx")],
  bundle: true,
  platform: "browser",
  target: "es2020",
  format: "esm",
  outfile: path.join(__dirname, "dist", "index.js"),
  jsx: "automatic",
  loader: {
    ".png": "dataurl",
    ".svg": "dataurl",
    ".gif": "dataurl",
    ".jpg": "dataurl",
    ".ts": "tsx",
  },
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  define: {
    "process.env.NODE_ENV": watch ? '"development"' : '"production"'
  },
  logLevel: "info"
};

if (watch) {
  esbuild.context(config).then((ctx) => ctx.watch());
} else {
  esbuild.build(config);
}