import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Container, composed exactly like shadcn/ui: `Card` > `CardHeader` >
 * `CardTitle` / `CardDescription`, then `CardContent` and `CardFooter`.
 * `tone` is this system's addition. All tones are dark.
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `default` card surface, `raised` one step lighter, `sunken` one step darker,
   *  `panel` for the live DM screen (same fill, stronger border and shadow).
   *  There is no light tone — this system is dark only. */
  tone?: "default" | "raised" | "sunken" | "panel";
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;
export declare function CardHeader(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export declare function CardTitle(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export declare function CardDescription(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export declare function CardContent(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
export declare function CardFooter(props: HTMLAttributes<HTMLDivElement>): JSX.Element;
