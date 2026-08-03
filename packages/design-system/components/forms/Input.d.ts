import type { CSSProperties, InputHTMLAttributes } from "react";

/**
 * Bare text input, matching shadcn/ui exactly: it renders **only** the input.
 * Compose `Label`, helper text and error text around it — the previous version
 * baked in `label`/`hint`/`error`/`icon`/`suffix` props, none of which have a
 * shadcn equivalent; all are removed.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Monospace value — dice notation, HP, modifiers. This system's one addition. */
  mono?: boolean;
  style?: CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
