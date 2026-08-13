# Assets

## App icon — the one mark that exists

`assets/icon/` holds the app icon, chosen from the "App icon — pint + die" exploration
(option **P2**, tankard with handle) and refined for export. It is a **tankard in
peach on a deep-slate tile, with a hexagonal die as negative space in the body,
a bumped froth crown, and one fleck of foam breaking off the rim.**

| File | Use |
| --- | --- |
| `tiny-taverns-icon-master-1024.png` | Store / iOS master. Full-bleed square, **no corner rounding** — the OS masks it. |
| `tiny-taverns-icon-rounded-1024.png` | Preview only, squircle applied. Do not ship this. |
| `tiny-taverns-icon-warm-1024.png` | Amber variant. **Off-palette** — see the note below. |
| `android-adaptive-foreground-432.png` | Android adaptive foreground, art inside the safe circle. |
| `android-adaptive-background-432.png` | Android adaptive background, flat `--slate-950`. |
| `preview-{180,120,76,48,29}.png` | Rendered-size checks. |
| `mark-on-dark-256.png` | **In-layout mark**, transparent background, die knocked to `--slate-950`. For dark surfaces: the app rail, the marketing footer. |
| `mark-on-light-256.png` | Light-surface variant. **Currently unused** — the product is dark only. Kept for print and third-party placements. |
| `favicon-32.png` | Browser tab, 7px rounded tile. |

**Lockup rule.** The mark sits left of the wordmark with a 10px gap: 30px in the app
rail, 34px on the marketing site. The tagline is indented to align with the wordmark,
not the mark. Use `mark-on-dark-256.png` everywhere in product and marketing; the die is negative
space, so on a dark surface it reads through to the page.

Contact sheet: `brand/app-icon-final.html`. Earlier explorations are kept in
`brand/app-icon-options.html`, `app-icon-d20-options.html`,
`app-icon-pint-options.html` and `app-icon-mug-options.html`.

**The amber question is still open.** The system palette is entirely cool, so the
peach tankard reads as teal fluid rather than ale. The warm variant uses
`#E8A33A`, which exists nowhere else in the system. It is **not a token** — if the
warm route is chosen, it should be declared a brand-only accent (icon and marketing
moments), never a UI colour.

**The icon is drawn geometry, not a typeset logo**, and there is still no wordmark
lockup — see below.

## There is no logo

The attached source (`taverns/`) contains **no logo, wordmark, icon set, illustration
or photograph** — it is a Vite + Effect.ts boilerplate whose only UI is a placeholder
`Button` and an `<h1>Taverns</h1>`. Nothing was drawn or reconstructed here.

Wherever a mark would go, the brand name is set in plain type: **Instrument Sans 600** at
`--ls-display`, with the tagline "The DM's side kick" beneath it in the same face at
13px regular (`--peach-300` on dark, `--accent-ink` on light). See
`Wordmark` in `ui_kits/marketing/Site.jsx` and `Rail` in `ui_kits/dm-screen/AppShell.jsx`.

## Icons — Lucide, from CDN

No icon assets existed to copy, so the system standardises on **Lucide 0.469.0** and
links it from CDN rather than vendoring it:

```
https://unpkg.com/lucide-static@0.469.0/icons/<slug>.svg
```

`components/core/Icon.jsx` loads each glyph as a CSS mask so it inherits
`currentColor`. **This is a substitution** — replace `ICON_BASE` if you adopt a
different set.

## Imagery — none

No photography, illustration or texture files. Card surfaces get their warmth from
`--grain` (a CSS radial-dot pattern in `tokens/elevation.css`), not from an image.
**Please supply:** a logo/mark, one or two full-bleed hero photographs, and any
brand illustrations, and this folder will be wired up properly.
