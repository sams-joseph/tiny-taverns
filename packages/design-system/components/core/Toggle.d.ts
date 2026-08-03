import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * Two-state pressable chip, matching shadcn/ui's `Toggle` (`pressed` +
 * `onPressedChange`). Use for filters and view switches.
 *
 * This replaces the previous `Tag` component, which had no shadcn counterpart:
 * for non-interactive metadata use `Badge variant="outline"` instead.
 */
export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Toggle(props: ToggleProps): JSX.Element;
