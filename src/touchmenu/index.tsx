import { PatchTouchMenu } from "@decky/ui";
import { PokeballIcon } from "../components/PokeballIcon";
import { TouchMenuContent } from "./TouchMenuContent";

let unpatch: (() => void) | null = null;

export function registerTouchMenu() {
  if (unpatch) return;
  if (typeof PatchTouchMenu !== "function") {
    console.warn("[pokemon-overlay] PatchTouchMenu not available in this Decky version, skipping touch menu");
    return;
  }
  try {
    unpatch = PatchTouchMenu({
      menuLabel: "Pokémon Essentials",
      icon: <PokeballIcon />,
      content: <TouchMenuContent />,
      onMenuClose: () => {
        console.log("[pokemon-overlay] touch menu closed");
      },
    });
    console.log("[pokemon-overlay] touch menu registered");
  } catch (e) {
    console.warn("[pokemon-overlay] touch menu registration failed", e);
  }
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
