import { useState } from "react";
import { TOKEN_NAMES, type TokenNames } from "./tokens";

/**
 * Which tokens wear their name on the DM's board (`nameShown`): this browser's
 * preference, kept across fights and reloads, and nobody else's — no player
 * sees the DM's board, and the fight records nothing about how it was looked at.
 *
 * Storage can be refused (a private window, blocked site data), so every read
 * and write is guarded and the drawing's default, the active and selected
 * tokens, stands in when it is.
 */
const KEY = "taverns:run:token-names";

const read = (): TokenNames => {
  try {
    const stored = localStorage.getItem(KEY);
    return TOKEN_NAMES.find((names) => names === stored) ?? "active";
  } catch {
    return "active";
  }
};

export function useTokenNames(): readonly [TokenNames, (names: TokenNames) => void] {
  const [names, setNames] = useState<TokenNames>(read);
  const choose = (next: TokenNames) => {
    setNames(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Kept for this visit only.
    }
  };
  return [names, choose];
}
