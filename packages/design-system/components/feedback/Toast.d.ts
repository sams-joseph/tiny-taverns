import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Transient notice, composed like shadcn/ui — `Toast` > `ToastTitle` /
 * `ToastDescription`, with `ToastAction` and `ToastClose`. The previous version
 * took `title`/`detail`/`action` props and a `tone`; replaced by children and
 * shadcn's `variant`.
 *
 * `success` and `magic` are this system's semantic extensions.
 */
export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive" | "success" | "magic";
  children?: ReactNode;
  style?: CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
export declare function ToastTitle(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function ToastDescription(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function ToastAction(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function ToastClose(props: { onClick?: () => void }): JSX.Element;
