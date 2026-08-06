/* eslint-disable no-restricted-syntax --
 * This file is the one place the gallery is allowed to write a measurement as a
 * literal, because here the measurements ARE the content: each string is prose
 * transcribed from the matching `.prompt.md` in packages/design-system/components,
 * printed beside the specimen so a reader can check what they are looking at
 * against what was specified. Nothing here is ever applied as a style — every
 * actual value in the gallery comes from a token via a Tailwind utility, and the
 * adherence rule stays on everywhere else.
 */

export const BLURBS = {
  foundations:
    "Dark only — there is no light mode and no toggle. Every value here resolves from packages/design-system/tokens through Tailwind's theme layer; nothing restates a hex or a measurement.",
  core: "Button, Badge, Card, Icon, Label and Toggle. Hover makes a fill lighter, never darker; press swaps the lift for a subtle inset and nothing moves.",
  forms:
    "Input, Select, Checkbox and Switch render controls only — compose a Label and your own message text around them, exactly as shadcn's Form does. Focus swaps the border to the accent and adds the ring.",
  navigation:
    "Tabs are the only navigation pattern in the app — never a pill group or a segmented control. The active trigger is semibold with a 2px accent rule; inactive triggers are muted.",
  feedback:
    "Dialog, Toast and Tooltip. Dialogs fade up 6px from scale(.98) behind a blurred scrim; toasts slide 10px in from the right; tooltips appear and disappear in one frame, with no arrow and no delay.",
} as const;

export const NOTES = {
  surfaces: "depth = surface lightness + a black shadow, never a light fill",
  radii: "6px controls · 4px badges · 12px cards · 14px dialogs",
  elevation: "black, and heavier than a light theme needs",

  buttonVariants: "38px tall · 6px radius · 13px medium",
  buttonSizes: "sm 32 · default 38 · lg 44 · icon 38",
  buttonOnRaised: "outline, ghost and link inherit colour, so they adapt to the surface",
  badgeVariants: "4px radius · 12px medium · sentence case",
  icon: "16 inline with body text · 18 in controls · 20 in navigation · 24+ empty states",
  label: "13px medium · required companion to Input and Select",
  toggleSizes: "30 · 36 · 42 · pill, 1px border",

  input: "38px tall · 6px radius · focus = accent border + ring",
  select: "matches Input · the open list is an 8px popover on shadow-3",
  checkbox: "18px square · 4px radius · solid accent fill when on",
  switch: "40×22 · a pill track with a knob that glides on ease-out",

  tabs: "36px triggers · 13px medium · 2px accent underline",

  dialog: "14px radius · shadow-3 · scrim + 3px blur · ≤520px wide",
  toast: "340 wide · a filled glyph strip down the left edge · stacks three deep, hover to fan out",
  tooltip: "no arrow, no fade, no delay · always pass a shortcut",
} as const;
