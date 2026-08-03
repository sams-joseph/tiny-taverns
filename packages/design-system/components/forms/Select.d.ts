import type { CSSProperties, ReactNode } from "react";

/**
 * Select, composed exactly like shadcn/ui — `Select` (value / onValueChange) >
 * `SelectTrigger` > `SelectValue`, with `SelectContent` > `SelectItem`.
 * The previous version took an `options` array and rendered a native
 * `<select>`; that has no shadcn equivalent and is removed.
 */
export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}
export declare function Select(props: SelectProps): JSX.Element;
export declare function SelectTrigger(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function SelectValue(props: { placeholder?: string }): JSX.Element;
export declare function SelectContent(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function SelectItem(props: { value: string; style?: CSSProperties; children?: ReactNode }): JSX.Element;
