import { useEffect, useState } from "react";
import { api, SpriteResult } from "../api";

/**
 * Renders a user-provided sprite (data/sprites/<SPECIES>.png, served as a
 * data URL by the backend) or nothing — the card falls back to its text
 * badges. Sprites are optional; a missing one is not an error state.
 */

const cache = new Map<string, SpriteResult | "pending" | "missing">();
const waiters = new Map<string, Array<(r: SpriteResult | "missing") => void>>();

function fetchSprite(species: string): Promise<SpriteResult | "missing"> {
  const key = species.toUpperCase();
  return new Promise((resolve) => {
    const waiters_ = waiters.get(key) ?? [];
    if (cache.get(key) === "pending") {
      waiters_.push(resolve);
      waiters.set(key, waiters_);
      return;
    }
    cache.set(key, "pending");
    api
      .getPokemonSprite(key)
      .then((res) => {
        cache.set(key, res.found ? res : "missing");
        resolve(res.found ? res : "missing");
        for (const w of waiters.get(key) ?? []) w(res.found ? res : "missing");
      })
      .catch(() => {
        cache.set(key, "missing");
        resolve("missing");
        for (const w of waiters.get(key) ?? []) w("missing");
      })
      .finally(() => waiters.delete(key));
  });
}

export function PokeSprite({ species, size = 36 }: { species: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(
    () => {
      const c = cache.get(species.toUpperCase());
      return c && c !== "pending" && c !== "missing" ? c.data_url ?? null : null;
    }
  );

  useEffect(() => {
    let cancelled = false;
    if (!species) return;
    fetchSprite(species).then((res) => {
      if (cancelled) return;
      setDataUrl(res === "missing" ? null : res.data_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [species]);

  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt={species}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}
