const esbuild = require("esbuild");
const path = require("path");
const { dependencies, peerDependencies } = require("./package.json");

const watch = process.argv.includes("--watch");

const externals = [
  ...Object.keys(dependencies || {}),
  ...Object.keys(peerDependencies || {}),
  "decky-frontend-lib",
  "@decky/api",
  "@decky/manifest",
  "typescript-transform-paths"
];

const config = {
  entryPoints: [path.join(__dirname, "src", "index.tsx")],
  bundle: true,
  platform: "browser",
  target: "es2020",
  format: "iife",
  outfile: path.join(__dirname, "dist", "index.js"),
  external: externals,
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
