import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import externalGlobals from "rollup-plugin-external-globals";

export default {
  input: "./src/index.tsx",
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: true,
    inlineDynamicImports: true,
  },
  external: ["react", "react-dom", "react/jsx-runtime", "@decky/ui", "@decky/manifest"],
  plugins: [
    externalGlobals({
      "react": "window.SP_REACT",
      "react-dom": "window.SP_REACTDOM",
      "react/jsx-runtime": "window.SP_JSX",
      "@decky/ui": "window.DFL",
      "@decky/manifest": "{name: 'SD Poké Stat Tracker'}",
    }),
    typescript({
      tsconfig: "./tsconfig.json",
    }),
    resolve({ browser: true }),
    commonjs(),
    json(),
  ],
};
