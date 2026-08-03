# Tiny Taverns — Design System

**Tiny Taverns: the dungeon master's side kick.** A tool a DM keeps open next to the
table — initiative, hit points, stat blocks, a bestiary, and the note you meant to
remember when the party opens the crate.

---

## ⚠️ Read this first: what was given vs. what was designed

**Source provided:** one read-only codebase, mounted at `taverns/` (a pnpm + Turborepo
monorepo — `apps/web` Vite + React 19 SPA, `apps/server` Effect.ts v4 beta,
`packages/ui`, `packages/tsconfig`, `packages/eslint-config`, and a vendored
`.repos/effect` reference tree). No Figma link, no deck, no brand guidelines, no assets.

**What the source actually contained, design-wise:**

| Thing | Found in source |
| --- | --- |
| Components | One `Button` (`packages/ui/src/Button.tsx`) with `primary` / `secondary` |
| Colours | `#4f46e5`, `#ffffff`, `#e5e7eb`, `#111827` — Tailwind's default indigo/greys |
| Type | `system-ui, sans-serif`. No font files. |
| Spacing / radius | `0.5rem 1rem` padding, `0.375rem` radius |
| Product copy | `<h1>Taverns</h1>` and "A pnpm + Turborepo starter…" |
| Logo, icons, imagery, screens, CSS files | **None** |

It is a boilerplate scaffold, not a product. Its Button values are framework defaults
(indigo-600 on gray-200), not brand decisions — so they were **not** adopted.

**Therefore everything below the "one Button" line is designed from the brand
description, not copied from a source.** Named explicitly so nobody mistakes it for
ground truth:

- The palette, type pairing, spacing scale, radii, shadows and motion are new.
- The two products (DM screen app, marketing site) are inferred from "the dungeon
  master's side kick" — the repo has no screens.
- The component inventory is the standard set (no source inventory existed to follow).
- Fonts are **Google Fonts substitutions** — see *Type* below.
- Icons are **Lucide, substituted** — see *Iconography*.
- **There is no logo.** Nothing was drawn. See `assets/README.md`.

**If you have the real brand, replace this system's foundations before shipping
anything from it.**

---

## Products

**1. DM screen (`ui_kits/dm-screen/`)** — the app. Laptop-sized, three surfaces:
campaign prep (light), the live encounter runner (dark), the bestiary (light).

**2. Marketing site (`ui_kits/marketing/`)** — one homepage: hero, features, quote,
pricing, signup, footer.

---

## Content fundamentals

**Voice: the friend at the table who already knows the rules.** Plain, quick, a little
dry. It never performs fantasy at you — the fantasy is what the DM is making, and the
app is the sidekick holding the notes.

- **Second person, and "you" is always the DM.** Never the players. "You haven't run
  this one yet." "Keep the hag's legendary actions to yourself."
- **Sentence case everywhere.** Buttons: "Roll initiative", "Add monster", "End
  session". The only uppercase is the 12.5px micro-label (`READ ALOUD`, `ENVIRONMENT`,
  `DAMAGE`) and ability abbreviations (`STR`, `DEX`).
- **Verb-first buttons, no articles, no "please".** "Start a campaign", not "Click to
  start your campaign".
- **Concrete over abstract, always.** "Six goblins are hiding in the reeds," not "a
  legendary horde of foes". Numbers over adjectives: "21/21 hp", "CR 1/4".
- **No exclamation marks in UI. No emoji, ever.** Not in empty states, not in toasts,
  not in marketing.
- **Empty states say what to do next**, in two short sentences: *"Nothing lives here.
  Loosen a filter, or add a creature of your own."* Never "No data available."
- **Errors are matter-of-fact and bounded.** "Must be 1–30." Not "Oops!"
- **Marketing headlines are a small joke with a real promise inside.** "Run the fight,
  not the spreadsheet." "Six things you stop doing by hand." "Pay when your table
  grows." Feature names too: pricing tiers are *Hedge tavern / Roadhouse / Guildhall*.
- **One register shift is allowed:** *read-aloud text*, the prose a DM speaks to the
  table. It gets italic Alegreya, longer sentences, present tense, and no UI voice at
  all: *"The reeds are taller than you are and they are not moving, even though there
  is a wind."* This is the only place the writing is atmospheric — and it's set in a
  different typeface so the distinction is visible, not just tonal.
- **Sign-offs are human, never corporate.** Footer: "Made by people who were late to
  their own session."

**Don't write:** "Unleash…", "Embark on…", "Seamlessly", "powerful", "Initiate Combat
Sequence", "Oops! Looks like…", "🎲".

---

## Visual foundations

### Dark only — there is no light mode

**Every surface in Tiny Taverns is dark, and nothing is ever set on a light
background.** A DM runs this at a lit table next to other people; a bright screen
lights up the room and wrecks night vision. This is the single most important visual
rule in the system, and it is not a user preference — there is no toggle.

Surfaces step through four near-blacks: `--surface-sunken` `#06090D` (wells, footers)
→ `--surface-page` `--slate-950` (the body) → `--surface-card` `--slate-900` (cards,
panels) → `--surface-raised` `--slate-800` (popovers, toasts, menus). **Depth comes
from surface lightness plus a black shadow**, never from a light fill.

`--mist` and `--frost` remain defined for the rare inverted element, but **must never
be used as a page or card fill.** If a design needs a light panel, the design is wrong.

### Colour

- **Verdigris (`--accent`, `#17798C`) is the only colour that carries an action.**
  Oxidised copper on a lantern. It is deliberately **deeper and less saturated than the
  semantic families**, so a primary button never competes with a damage number for the
  eye. **White sits on verdigris** (`--text-on-accent: #F5FBFC`, 4.9:1) — dark ink fails
  contrast on it, so never use it.
- **There is no warm grey and no true neutral grey.** Every neutral carries a blue cast
  (`--slate-950` `#0A0E13` → `--slate-50` `#F1F5F8`). Pure `#808080`, `#F5F5F5` or any
  browned neutral is a bug.
- **Four semantic families, vivid on purpose, each with a table meaning:** crimson
  `#C81E43` = damage / hostile / destructive, emerald `#0D9765` = healing / saved /
  success, violet `#6633CC` = magic / concentration, azure `#1470C6` = rules reference /
  cold. They are the loudest colours in the system because they are what a DM must read
  at a glance mid-combat. Violet is **flat** — never a gradient.
- **Backgrounds are flat colour.** The single exception is the hero's one radial verdigris
  glow at 20% (`radial-gradient(60% 90% at 22% 15%, rgba(23,121,140,.20), transparent)`) —
  a lit window at blue hour, not a gradient mesh.

### Type

Four faces, four jobs. All are **Google Fonts substitutions** (the source had no fonts). **Alegreya is self-hosted** from `fonts/` — the brand owner supplied both variable binaries; the other three are still CDN-delivered:

| Role | Face | Used for |
| --- | --- | --- |
| Display | **Instrument Sans** 600 | Headings, the wordmark, prices, dice results. `--font-display` and `--font-sans` are the *same family* — hierarchy comes from weight and size, not from a second face. |
| UI &amp; body | **Instrument Sans** 400/500 | Body copy, row detail, and every button, tab, badge and label. |
| Prose | **Alegreya** italic — **self-hosted** | Read-aloud text and creature type lines only. Variable `wght` 400–900, roman + italic, from `fonts/`. |
| Mono | **JetBrains Mono** 400/500 | Dice notation, HP, AC, modifiers, shortcuts. Numbers must column up. |

**Legibility first.** One neutral sans carries the whole interface; there is no display
face fighting it. Hierarchy is weight (400 / 500 / 600) and size, and only two other
families appear, each for a job the sans can't do.

| Where | Face | Size |
| --- | --- | --- |
| Display / headings | Instrument Sans 600, `-0.02em` | 48 / 34 / 26 / 20 / 18px, lh 1.08–1.3 |
| Body, row detail | Instrument Sans 400 | 16/1.55, 14/1.5 |
| Buttons, tabs, badges, labels | Instrument Sans 500 | `--fs-label` 13px / `--fs-label-s` 12px |
| Stats, dice notation, HP, AC | JetBrains Mono 500 | 13–15px |
| Read-aloud prose | Alegreya italic 400 (self-hosted) | 15–18px, lh 1.7 |

**Sentence case everywhere.** No uppercase tracking on labels — the previous versions
shouted in caps and it made scanning harder, not easier. The only remaining uppercase is
ability abbreviations (`STR`, `DEX`).

Type is antialiased normally (`-webkit-font-smoothing: antialiased`).

### Spacing & layout

2px-based, loosening as it climbs: 2 4 6 8 12 16 20 24 32 40 56 72 96. **6 and 20 are
load-bearing** — this is deliberately not a 4/8 grid. Fixed layout tokens: `--rail-w`
260px, `--aside-w` 340px, `--row-h` 44px (also the minimum hit target), `--control-h`
38px, `--pad-page` 32px, `--pad-card` 20px, `--measure` 66ch.

The app is a fixed shell: a **persistent dark left rail** (never collapses), a sticky
`TopBar`, and a scrolling body. The marketing header is sticky. Nothing else is fixed.

### Surfaces, cards & borders

- **Card:** `--surface-card` (`--slate-900`) on `--surface-page` (`--slate-950`), **1px
  `--border-hairline` on all four sides**, `--r-md` 8px, `--shadow-1`, 20px padding.
- **Never a card with a coloured left border only.** The one place a coloured left rail
  is correct is `Toast` (3px), where it's a status rail on a dark chip. Cards mark
  emphasis on the **top edge** (`accentEdge`, 3px verdigris).
- **Dark panel:** `--surface-panel` (`#111820`), `--r-lg` 12px, `--border-on-dark`
  `#2A3644`, `--shadow-dark`. No grain.
- **Grain:** light cards carry `--grain` — `radial-gradient(rgba(90,110,130,.055) 1px,
  transparent 1px)` at 4px. A cool paper tooth, barely visible; the only texture in the
  system. Never on dark.
- **Wells** (inputs, footers) are `--surface-sunken` with `--shadow-inset-well`.
- Borders are 1px, cool, and always visible — the system separates with a line, not
  with a shadow alone.

### Radii

Restrained curves — enough to feel soft, never a novelty. **6px controls** (buttons,
inputs, selects), **4px badges**, **8px popovers and menus**, **12px cards and panels**,
**14px dialogs**. Pills (`--r-tag`) are only for chips and toggles; containers are never
pill-shaped, and nothing is a squircle.

### Borders

**1px hairlines.** `--border-hairline` (`--slate-800`) separates and `--border-strong`
(`--slate-700`) outlines interactive controls — on dark, a border is a *lighter* line,
not a darker one. Solid-fill buttons carry no border at all —
the fill is the edge. Borders never do the work a shadow or a spacing change should.

### Shadows

**Black, and heavier than a light theme needs** — a cool-tinted shadow is invisible on a
near-black page, so shadows are `rgba(0,0,0,.40–.70)`. `--shadow-1` cards and buttons,
`--shadow-2` hover and raised surfaces, `--shadow-3` dialogs and popovers. Shadow alone
cannot carry depth here; pair it with a step up the surface stack.

### States

- **Hover:** fills get **lighter**, not darker (`--accent` → `--accent-hover`, which is
  the *300* step); secondary and ghost pick up a faint `rgba(166,179,192,.10)` wash.
  Never opacity. This is inverted from a light theme and easy to get wrong.
- **Press:** fill goes to `--accent-press` and a subtle `--shadow-inset-press` replaces
  the lift. **No transform** — nothing shifts position, nothing scales, nothing bounces.
- **Focus:** `--ring` is a 2px accent ring held off the control by a 2px halo of page
  colour, so it reads on both light and dark. Never a browser outline.
- **Disabled:** `opacity: .5`, `cursor: not-allowed`.
- **Selected:** soft `--accent-soft` fill with `--accent-ink` text and an `--accent`
  border (Toggle, SelectItem), or a 2px accent underline (TabsTrigger). Solid accent fill
  is reserved for genuine on/off controls (Checkbox, Switch).

### Motion

**Quick and smooth.** 80ms press, 140ms hover and focus, 200ms dialogs and toasts, 280ms
panels, 400ms page transitions. `--ease-out` `cubic-bezier(.16,1,.3,1)` does almost
everything; `--ease-in-out` for things that both enter and leave. **Nothing overshoots
and nothing steps** — no bounce, no spring, no sprite-style stepping.

Dialogs fade up 6px from `scale(.98)`; toasts slide 10px in from the right; the Switch
knob glides. `prefers-reduced-motion` zeroes every duration token.

### Texture & blur

**No texture.** Surfaces are flat colour — there is no grain, no scanline, no pattern
(`--grain` is `none`, kept only so old call sites resolve). Blur is used exactly twice,
both times to keep something readable over content beneath it: the dialog scrim
(`--scrim` + `blur(3px)`) and the marketing sticky header
(`rgba(245,248,250,.86)` + `blur(10px)`). No frosted cards, no glassmorphism.

### Imagery

**None exists.** The source shipped no photography, illustration or texture. In its
place, the hero shows a live component composition (a real initiative list) rather than
a picture — which is the better pattern for a tool anyway. If imagery is added, the
intended direction is **cool, low-key, slight grain, blue-hour rather than firelight** — but
that is a recommendation, not an observation. See `assets/README.md`.

---

## Iconography

- **Lucide 0.469.0, substituted and flagged.** The source had no icon font, sprite,
  SVGs or PNGs to copy, so nothing was vendored. Glyphs load from
  `https://unpkg.com/lucide-static@0.469.0/icons/<slug>.svg`.
- `components/core/Icon.jsx` renders each glyph as a **CSS mask on a `<span>` with
  `background-color: currentColor`**, so an icon inherits its parent's colour and needs
  no per-colour asset. Change `ICON_BASE` to swap the whole set.
- **Sizes:** 11px inside a Badge, 13px in a Tag, 15–16px in `sm` controls and list
  rows, 18–19px in `md` controls and nav, 22px in specimens, 28px in empty states.
  Lucide's 2px stroke reads correctly from 14px up; below that use a Badge instead.
- **Recurring glyphs and their fixed meanings:** `swords` combat, `dices`/`dice-5`
  rolling, `shield` a player character (and AC), `skull` a hostile creature or a
  destructive action, `heart-pulse` healing, `sparkles` magic, `scroll-text` notes,
  `map` maps, `users` party, `footprints` bestiary, `eye-off` hidden from players,
  `moon` dark mode, `clock` prep, `chevron-right` forward/next, `x` dismiss, `plus`
  add, `check` confirm.
- **Icons never appear alone without an accessible name** — `IconButton` requires
  `label`, which becomes both `aria-label` and the tooltip.
- **No emoji, anywhere.** No unicode characters used as icons (no `→`, `✓`, `★`); use
  Lucide. Typographic characters are used as characters only: `·` as a separator,
  `–` in ranges, `⌘K` inside a `kbd`.

---

## Intentional additions

- **`Icon`** — the source defined no icon system; a wrapper was needed so the whole set
  can be swapped in one place and so glyphs tint with `currentColor`.
- **`Badge` / `Toast` semantic variants** (`success`, `magic`, `info`) — shadcn ships
  four Badge variants; a DM needs healing, magic and rules-reference read at a glance.
- **`Card tone`** (`default` / `raised` / `sunken` / `panel`) — steps through the dark
  surface stack. There is no light tone.
- **`Input mono`** — dice notation and HP must set in the mono face.
- **`TooltipContent shortcut`** — this is a keyboard-heavy tool.
- **`Toggle`** is shadcn's own component, adopted to replace the invented `Tag`.

`outline` / `ghost` / `link` inherit `color`, so they adapt to whichever surface they
sit on without a parallel variant set. The old `onDark` props are gone — everything is
on dark now.

Everything else is the standard from-scratch primitive set, since no source inventory
existed to follow.

---

## Index

### Root
| File | What |
| --- | --- |
| `styles.css` | **Global entry point.** `@import` list only — link this one file. |
| `readme.md` | This guide. |
| `SKILL.md` | Agent-Skills front matter for use in Claude Code. |
| `thumbnail.html` | Homepage tile (wordmark + swatch strip). |

### `tokens/` — 183 custom properties
`fonts.css` (`@font-face` for self-hosted Alegreya + CDN notes for the rest) · `colors.css` (ramps + semantic aliases) ·
`typography.css` (faces, scale, composite roles) · `spacing.css` (scale + layout
tokens) · `radius.css` · `elevation.css` (shadows, insets, grain) · `motion.css`
(durations, easings, reduced-motion) · `base.css` (element defaults, link colours).

### `components/` — 13 primitives, on shadcn/ui APIs

**These components deliberately mirror shadcn/ui's prop and composition shapes**, so a
consuming app can swap any of them for the real `@/components/ui/*` and keep its call
sites. Variant names (`default` / `secondary` / `destructive` / `outline` / `ghost` /
`link`), sizes (`default` / `sm` / `lg` / `icon`) and handlers
(`onCheckedChange`, `onValueChange`, `onPressedChange`, `onOpenChange`) are shadcn's, not ours.

| Group | Components |
| --- | --- |
| `core/` | `Icon`, `Button`, `Badge`, `Toggle`, `Label`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) |
| `forms/` | `Input`, `Select` (+ `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`), `Checkbox`, `Switch` |
| `navigation/` | `Tabs` (+ `TabsList`, `TabsTrigger`, `TabsContent`) |
| `feedback/` | `Dialog` (+ `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`), `Toast` (+ `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`), `Tooltip` (+ `TooltipProvider`, `TooltipTrigger`, `TooltipContent`) |

**Removed, because shadcn has no counterpart:**
- `IconButton` → use `Button size="icon"` with an `<Icon>` child and an `aria-label`.
- `Tag` → use `Toggle` (shadcn's real component) for filter chips, or
  `Badge variant="outline"` for static metadata.

**Form controls render controls only.** `Input`, `Select`, `Checkbox` and `Switch` no
longer accept `label` / `hint` / `error` / `icon` / `options` props — compose `Label`
and your own message text around them, exactly as shadcn's `Form` does. This was the
single biggest incompatibility in the previous version.

Each has `<Name>.jsx`, `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (what &
when + usage). Each directory has one `@dsCard` HTML showing its states.

### `templates/` — starting folders for consuming projects
| Template | Entry |
| --- | --- |
| **Marketing homepage** | `templates/marketing-homepage/MarketingHomepage.dc.html` |
| **DM screen — live session** | `templates/dm-screen/DmScreen.dc.html` |

Each folder carries its own `ds-base.js` — one `base` line to repoint at the bound
`_ds/<folder>` tree in a consuming project. Both compose the published primitives via
`<x-import>` and expose section toggles as tweaks (`showQuote`, `showPricing`,
`showDiceTray`). These replace the old `@startingPoint` tags, which the picker no
longer offers.

### `ui_kits/`
- **`dm-screen/`** — `AppShell.jsx`, `CampaignHome.jsx`, `EncounterRunner.jsx`,
  `StatBlock.jsx`, `Bestiary.jsx`, `data.js`, `index.html`. Click-through: campaign →
  start session → damage a goblin → next turn → end session.
- **`marketing/`** — `Site.jsx`, `index.html`. Hero, features, quote, pricing, signup,
  footer.

### `fonts/`
`Alegreya-VariableFont_wght.ttf`, `Alegreya-Italic-VariableFont_wght.ttf` — supplied by
the brand owner and wired into `tokens/fonts.css`. Instrument Sans and JetBrains Mono still need
binaries; until then they load non-blocking from CDN.

### `guidelines/` — 20 specimen cards
Colours (slate neutrals, mist surfaces, verdigris primary, semantic families, aliases in use) · Type (display,
UI, read-aloud, serif weight axis, mono, pairing) · Spacing (scale, layout tokens) · Brand (radii,
elevation, states, motion, surfaces, iconography, voice do/don't).

### `assets/`
`icon/` holds the **app icon** (option P2 — tankard with a die, exported as an iOS
master, Android adaptive layers and rendered-size previews) plus a warm off-palette
variant. `README.md` documents every file and the open amber question. The mark is used in-layout as a **lockup**: `mark-on-dark-256.png` (transparent, die knocked through to the surface) beside the
wordmark — the light-surface variant is retained in `assets/icon/` but unused, since
no layout has a light background, in the app rail, the marketing header and footer, and as a favicon.
**There is still no standalone typeset wordmark** — "Tiny Taverns" is set live in
Instrument Sans 600 at `--ls-display`, not drawn.

### `brand/`
Icon explorations and the final contact sheet: `app-icon-options.html` (six first
directions), `app-icon-d20-options.html`, `app-icon-pint-options.html`,
`app-icon-mug-options.html`, and `app-icon-final.html`.

### Source
Mounted read-only at `taverns/`. Key files read: `README.md`, `AGENTS.md`,
`packages/ui/src/Button.tsx`, `apps/web/src/App.tsx`, `apps/web/index.html`.
No remote git origin was configured in that repo, so no URL can be recorded.
