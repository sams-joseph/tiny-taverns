import type { CSSProperties, ReactNode } from "react";

/**
 * Tabs, composed exactly like shadcn/ui — `Tabs` (value / defaultValue /
 * onValueChange) > `TabsList` > `TabsTrigger`, with `TabsContent` per panel.
 * The previous version took a `tabs` array and an `onChange`; both are removed.
 */
export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  style?: CSSProperties;
  children?: ReactNode;
}
export declare function Tabs(props: TabsProps): JSX.Element;
export declare function TabsList(props: { style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function TabsTrigger(props: { value: string; style?: CSSProperties; children?: ReactNode }): JSX.Element;
export declare function TabsContent(props: { value: string; style?: CSSProperties; children?: ReactNode }): JSX.Element;
