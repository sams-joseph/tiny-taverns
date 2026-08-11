/**
 * The Hob chat surface — the designers' Option A, built from the shipped
 * components.
 *
 * A shell needs four names from here: `useHobPanel` for the open/inline state
 * and the ⌘K binding, `HobRegion` to be the positioned row the overlay covers,
 * `Hob` to mount, and `HOB_INLINE_MIN` only if it wants to say the number out
 * loud. `HobPanel`, `HobDock` and the parts are exported for the gallery and
 * the tests; a screen should not reach for them.
 *
 * There is no assistant behind any of it. `conversation.ts` is the seam, and
 * the only file that has to change when there is.
 */

export { Hob } from "./Hob";
export { HobDock, HobRegion, type HobDockProps } from "./HobDock";
export { HobPanel, type HobPanelProps } from "./HobPanel";
export { useHobPanel, HOB_INLINE_MIN, type HobPanelState } from "./useHobPanel";
export { useHobConversation, type HobConversation } from "./conversation";
export type { HobArtifact, HobArtifactKind, HobTurn } from "./transcript";
