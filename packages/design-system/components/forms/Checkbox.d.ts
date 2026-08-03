import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * Checkbox, shadcn/ui-shaped: the **control only**, driven by `checked` +
 * `onCheckedChange`. Pair it with a `Label`. The previous version rendered its
 * own `label`/`hint` and used `onChange`; both are removed.
 */
export interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
