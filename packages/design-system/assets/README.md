# Assets

## App icon — the captain's mark, and the delivered one it replaced

`assets/icon/` holds the app icon. **Two of its files are the captain's artwork and the
rest are the designers' superseded delivery.** Read that split before touching anything
here, because the folder no longer depicts one thing.

**The mark the product shows** is a full-colour **illustrated wooden tankard** — staved
barrel body with iron bands and rivets, a thick cream froth head spilling over the rim with
loose bubbles beside it, a curled handle, and a **d20**, a **d4** and a small stack of
**coins** at its foot — drawn with a heavy dark outline on a **transparent background**.
It is illustration, not the flat geometry it replaced.

**The delivered mark it replaced** was option **P2** of the "App icon — pint + die"
exploration: a flat **tankard on a deep-slate tile, with a hexagonal die as negative space
in the body**, a bumped froth crown and one fleck of foam off the rim. Every file below
marked *(delivered)* still depicts that, and **nothing imports any of them.**

| File | Use |
| --- | --- |
| `mark-on-dark-256.png` | **The in-layout mark**, and one of only two files the product imports. Captain's illustration, transparent. Used at 18–44px in the app rail, Hob's chat parts and the marketing header and footer. **Despite the name it is 512×512**, and the art is not dark-specific — its own outline carries it on any surface. |
| `favicon-32.png` | **The browser tab**, and the other imported file. Captain's illustration, downscaled to 32. See the legibility note below. |
| `apple-touch-icon-180.png` | Captain's illustration at 180. **Wired to nothing** — no `apple-touch-icon` is declared anywhere. Kept so the source survives in the repo; see the open questions. |
| `tiny-taverns-icon-master-1024.png` | *(delivered)* Store / iOS master. Full-bleed square, no corner rounding. |
| `tiny-taverns-icon-rounded-1024.png` | *(delivered)* Preview only, squircle applied. Do not ship. |
| `tiny-taverns-icon-warm-1024.png` | *(delivered)* Amber variant. Off-palette. |
| `android-adaptive-foreground-432.png` | *(delivered)* Android adaptive foreground. |
| `android-adaptive-background-432.png` | *(delivered)* Android adaptive background, flat `--slate-950`. |
| `preview-{180,120,76,48,29}.png` | *(delivered)* Rendered-size checks of the old art. |
| `mark-on-light-256.png` | *(delivered)* Light-surface variant of the old flat mark. Unused. |

**Lockup rule** (unchanged). The mark sits left of the wordmark with a 10px gap: 22px in the
app rail, 34px on the marketing site. The tagline is indented to align with the wordmark,
not the mark.

**The illustration does not survive 16px, and barely survives 32.** At tab size the staves,
the froth and the dice collapse into a brown-and-purple smudge; the old flat mark held its
silhouette at 16 because it was drawn for that size. This is the ordinary cost of an
illustration in a favicon slot and is the captain's call to accept or fix — the fix is a
simplified 32px glyph, not a different downscale.

**Three things about the family are unresolved**, and are deliberately left rather than
guessed at:

1. **No `apple-touch-icon` is declared.** 180 is the standard size and one is now in the
   folder, but the art is transparent and iOS composites touch icons onto a background
   rather than honouring alpha — shipped bare it would land on white or black. Flattening it
   onto the brand's dark tile first is the safe form.
2. **There is no new 1024 master, no Android adaptive pair and no light variant.** The
   delivered ones are still here and depict the old artwork.
3. **The old previews measure the old mark.** They are not checks of anything that ships.

**The amber question is closed by the new art.** It asked whether the cool palette made the
tankard read as teal fluid rather than ale; the illustration is warm wood and cream froth
and does not pose it. `#E8A33A` is still not a token and the warm 1024 variant is still
off-palette.

**These two files are overwritten by a design-system delivery.** `assets/` is inside
PORT-NOTES' `rsync --delete`, so the next update silently restores the flat mark. See
PORT-NOTES' deviation list.

Contact sheet for the delivered icon: `brand/app-icon-final.html`. Earlier explorations are
in `brand/app-icon-options.html`, `app-icon-d20-options.html`,
`app-icon-pint-options.html` and `app-icon-mug-options.html`.

**The icon is artwork, not a typeset logo**, and there is still no wordmark lockup — see
below.

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
