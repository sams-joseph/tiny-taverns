import type { IconName } from "@taverns/ui";
import { type ReactNode, createContext, useContext } from "react";

/**
 * The canvas's drawers (`RunStage.tsx`): what one is, which is open, and the
 * way any button on the HUD opens one (`StageDrawerButton`, `hud.tsx`).
 */

/**
 * One of the canvas's drawers: a panel the right-hand rail opens over the
 * board, closed until the DM wants it. `rail: false` keeps it off the rail
 * for a drawer some other button opens (Hob's, from the controls).
 */
export interface StageDrawer {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly badge?: number | undefined;
  readonly rail?: boolean;
  /**
   * The content is its own surface (a card with its own header, as the
   * selected creature's is), so the drawer draws neither its panel nor its
   * title, only the way to close it.
   */
  readonly bare?: boolean;
  readonly content: ReactNode;
}

/** Which drawer is open, and the way to open one from anywhere on the HUD. */
export interface StageDrawerState {
  readonly open: string | undefined;
  readonly toggle: (key: string) => void;
  readonly show: (key: string) => void;
}

/** The selected creature's full card: the frame and the rail both open it. */
export const SHEET_DRAWER = "sheet";
/** Hob's switches and spends, which the controls open. */
export const HOB_DRAWER = "hob";

export const StageDrawers = createContext<StageDrawerState | null>(null);

/** The stage's drawers, or `null` off the canvas, where nothing opens one. */
export const useStageDrawers = (): StageDrawerState | null => useContext(StageDrawers);
