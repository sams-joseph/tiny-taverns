import type { CSSProperties } from "react";

/**
 * A Lucide glyph, tinted with currentColor. Icons are never decorative-only in
 * Tiny Taverns — pair with a label or an accessible name on the parent control.
 */
export interface IconProps {
  /** Lucide icon slug, e.g. "dice-5", "swords", "heart-pulse". */
  name: string;
  /** Square size in px. 16 inline with body text, 18 in controls, 20 in nav. */
  size?: number;
  style?: CSSProperties;
  className?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
export declare const ICON_BASE: string;
