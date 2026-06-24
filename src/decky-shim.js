// Runtime shim for @decky/api on the Steam Deck.
//
// The Decky Loader exposes its bridge via the global
//   window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit
// This shim wraps that global as a normal ESM module so the rest of the
// frontend can `import { call, definePlugin } from "./decky-shim"` and the
// esbuild bundle doesn't try to dynamic-require("@decky/api") at runtime.

const INTERNAL = "__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit";

function ensureConnection() {
  const conn = typeof window !== "undefined" ? window[INTERNAL] : undefined;
  if (!conn) {
    throw new Error(
      "[@decky/api shim] Failed to connect to loader — " + INTERNAL + " missing."
    );
  }
  return conn;
}

let _api = null;
function api() {
  if (_api) return _api;
  const conn = ensureConnection();
  const API_VERSION = 2;
  const manifest = { name: "SD Poké Stat Tracker" };
  try {
    _api = conn.connect(API_VERSION, manifest.name);
  } catch {
    _api = conn.connect(1, manifest.name);
  }
  return _api;
}

export async function call(method, ...args) {
  return api().call(method, ...args);
}

export function definePlugin(fn) {
  return fn;
}

export const toaster = {
  toast(msg) {
    if (api().toaster && typeof api().toaster.toast === "function") {
      api().toaster.toast(msg);
    } else if (api().toast) {
      api().toast(msg);
    }
  },
};

export function routerHook(routes, legacy) {
  if (api().routerHook) return api().routerHook(routes, legacy);
  return () => {};
}