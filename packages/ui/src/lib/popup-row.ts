/**
 * The fill of a popup's row under the pointer or the keyboard — the dropdown
 * menu's, the select's, the combobox's and the navigation menu's panel's, so
 * every popup reads alike.
 *
 * It is one step up the ramp from the popup's own `--surface-raised`: on this
 * system a hover gets *lighter* (the delivery's readme, "States"), and a row
 * filled with the popup's own step shows nothing at all. That is how it was
 * lost once — the fifth delivery moved `--surface-raised` onto `--slate-700`,
 * the step every row highlighted with — so `popup-row.test.ts` resolves both
 * through the delivered tokens and fails when they meet again.
 *
 * Base UI's menus, select and combobox mark the row `data-highlighted` for the
 * pointer and the arrow keys alike; the navigation menu's rows are links in a
 * `<nav>`, reached with Tab, so they take the same fill on `hover` and
 * `focus-visible`.
 */
export const POPUP_ROW_HIGHLIGHTED = "data-highlighted:bg-slate-600";

export const POPUP_ROW_HOVERED = "hover:bg-slate-600 focus-visible:bg-slate-600";
