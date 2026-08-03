import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Status marker. shadcn/ui's four variants plus three semantic extensions this
 * product needs mid-combat (`success`, `magic`, `info`) — documented as an
 * intentional addition in readme.md.
 */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "magic" | "info";
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;
