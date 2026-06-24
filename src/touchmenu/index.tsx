import { PatchTouchMenu } from "../decky-frontend-lib-shim";
import { PokeballIcon } from "../components/PokeballIcon";
import { TouchMenuContent } from "./TouchMenuContent";

let unpatch: (() => void) | null = null;

export function registerTouchMenu() {
  if (unpatch) return;
  unpatch = PatchTouchMenu({
    menuLabel: "Pokémon Essentials",
    icon: <PokeballIcon />,
    content: <TouchMenuContent />,
    onMenuClose: () => {
      console.log("[pokemon-overlay] touch menu closed");
    },
  });
  console.log("[pokemon-overlay] touch menu registered");
}

export function unregisterTouchMenu() {
  if (unpatch) {
    try {
      unpatch();
    } catch (e) {
      console.error("[pokemon-overlay] unpatch error", e);
    }
    unpatch = null;
    console.log("[pokemon-overlay] touch menu unregistered");
  }
}
