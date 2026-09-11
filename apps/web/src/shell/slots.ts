import { createContext, useContext } from "react";

/**
 * What the persistent layout publishes to the screen below it — the two points
 * where a screen reaches up into a shell it does not render.
 */

/**
 * The element the layout reserves for a screen's bar, or `null` before it has
 * mounted.
 *
 * **The bar belongs to the screen and its node belongs to the layout.** A screen
 * knows its own title, subtitle, tabs and actions, and nothing about them should
 * travel up through props; the layout owns the element so it never remounts
 * across navigation. `TopBar` portals into it, and that is the whole seam.
 *
 * The slot is the sticky element (`AppShell` gives it `sticky top-0 z-chrome`),
 * not the header inside it: a sticky box sticks within its parent, and a parent
 * exactly as tall as the header would give it no room to.
 */
export const TopBarSlot = createContext<HTMLElement | null>(null);

/**
 * *Open the panel*, for a screen with a control of its own that asks Hob — the
 * Shared World's Chronicle does. `show` rather than `toggle`: a press that says
 * "ask Hob" must not close a panel that is already open. `undefined` outside the
 * persistent layout, where there is no panel.
 */
export const ShowHob = createContext<(() => void) | undefined>(undefined);

export const useShowHob = (): (() => void) | undefined => useContext(ShowHob);
