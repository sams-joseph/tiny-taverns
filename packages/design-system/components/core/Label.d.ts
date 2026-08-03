import type { CSSProperties, LabelHTMLAttributes, ReactNode } from "react";

/** Standalone form label, as in shadcn/ui. Pair with an `Input`/`Select` via
 *  `htmlFor` — controls in this system never render their own label. */
export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Label(props: LabelProps): JSX.Element;
