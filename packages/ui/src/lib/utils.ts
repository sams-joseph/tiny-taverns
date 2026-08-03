import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { twSpacing, twTheme } from "./tw-theme";

/**
 * The theme replaces Tailwind's scales rather than extending them, so
 * tailwind-merge is told the same names — otherwise it cannot tell a custom
 * `text-*` size from a custom `text-*` colour and drops one of the pair.
 */
const twMerge = extendTailwindMerge({
  override: { theme: { ...twTheme } },
  extend: { theme: { spacing: [...twSpacing] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
