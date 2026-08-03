import type { CSSProperties, ReactNode } from "react";

/**
 * Tooltip, composed like shadcn/ui — `TooltipProvider` > `Tooltip` >
 * `TooltipTrigger` + `TooltipContent`. The previous version took a `content`
 * prop; replaced by `TooltipContent` children.
 *
 * `shortcut` on `TooltipContent` is this system's addition — Tiny Taverns is a
 * keyboard-heavy tool, so include it wherever a key exists.
 */
export interface TooltipContentProps {
  side?: "top" | "bottom" | "left" | "right";
  /** Shortcut rendered as a kbd chip, e.g. "SPACE" or "R". */
  shortcut?: string;
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function TooltipProvider(props: { children?: ReactNode }): JSX.Element;
export declare function Tooltip(props: { children?: ReactNode }): JSX.Element;
export declare function TooltipTrigger(props: { children?: ReactNode }): JSX.Element;
export declare function TooltipContent(props: TooltipContentProps): JSX.Element | null;
