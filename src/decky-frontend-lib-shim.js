// Runtime shim for `decky-frontend-lib` on the Steam Deck.
//
// On SteamOS, the Decky Loader exposes Steam-UI React components via the
// `window.DFL` (Decky Frontend Lib) global. This shim wraps that global as
// an ESM module so the rest of the frontend can
//   import { PanelSection, Toggle, ... } from "./decky-frontend-lib-shim"
// without esbuild emitting a dynamic-require for "decky-frontend-lib".

const GLOBAL = "DFL";

function lib() {
  if (typeof window === "undefined") {
    throw new Error(
      "[decky-frontend-lib shim] window is not available"
    );
  }
  const l = window[GLOBAL];
  if (!l) {
    throw new Error(
      "[decky-frontend-lib shim] " + GLOBAL + " global not found"
    );
  }
  return l;
}

const proxy = new Proxy(
  {},
  {
    get(_t, prop) {
      const l = lib();
      const value = l[prop];
      return typeof value === "function" ? value.bind(l) : value;
    },
    has(_t, prop) {
      return prop in lib();
    },
  }
);

export const PanelSection = (...args) => lib().PanelSection(...args);
export const PanelSectionRow = (...args) => lib().PanelSectionRow(...args);
export const ButtonItem = (...args) => lib().ButtonItem(...args);
export const DialogButton = (...args) => lib().DialogButton(...args);
export const TextField = (...args) => lib().TextField(...args);
export const Dropdown = (...args) => lib().Dropdown(...args);
export const SingleDropdown = (...args) => lib().SingleDropdown(...args);
export const Toggle = (...args) => lib().Toggle(...args);
export const Slider = (...args) => lib().Slider(...args);
export const Spinner = (...args) => lib().Spinner(...args);
export const ConfirmModal = (...args) => lib().ConfirmModal(...args);
export const Modal = (...args) => lib().Modal(...args);
export const Tabs = (...args) => lib().Tabs(...args);
export const MenuItem = (...args) => lib().MenuItem(...args);
export const MenuGroup = (...args) => lib().MenuGroup(...args);
export const ReorderableEntry = (...args) => lib().ReorderableEntry(...args);
export const Focusable = (...args) => lib().Focusable(...args);
export const Navigation = (...args) => lib().Navigation(...args);
export const PatchTouchMenu = (...args) => lib().PatchTouchMenu(...args);
export const staticClasses = new Proxy(
  {},
  {
    get(_t, prop) {
      const c = lib().staticClasses;
      return c ? c[prop] : undefined;
    },
  }
);

export default proxy;