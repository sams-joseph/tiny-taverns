import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * Switch, shadcn/ui-shaped: the control only, `checked` + `onCheckedChange`.
 * Square track and square knob; the knob travels in stepped time so it snaps
 * between positions instead of gliding.
 */
export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}
export declare function Switch(props: SwitchProps): JSX.Element;
