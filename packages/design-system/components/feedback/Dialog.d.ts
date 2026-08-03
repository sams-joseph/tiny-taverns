import type { CSSProperties, ReactNode } from "react";

/**
 * Modal, composed exactly like shadcn/ui — `Dialog` (open / onOpenChange) >
 * `DialogContent` > `DialogHeader` > `DialogTitle` / `DialogDescription`, then
 * `DialogFooter`. The previous version took `title`/`description`/`footer` as
 * props; that is not shadcn's shape and is removed.
 *
 * Positions against the nearest positioned ancestor, so kit screens host it
 * without a portal.
 */
export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
export declare function DialogContent(props: { width?: number; style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function DialogHeader(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function DialogTitle(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function DialogDescription(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function DialogFooter(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function DialogClose(props: { onClick?: () => void }): JSX.Element;
