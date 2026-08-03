import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * Action control. **shadcn/ui-compatible API** — `variant` and `size` use shadcn's
 * exact value names so a consuming app can swap this for `@/components/ui/button`
 * without touching call sites.
 *
 * There is no `IconButton` in this system: use `size="icon"` with an `<Icon>` child
 * and an `aria-label`, exactly as shadcn does.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
export declare const buttonSizes: Record<string, { height: number; padding: string | number; fontSize: string; width?: number }>;
