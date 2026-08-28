# Assets

## App icon — the captain's mark, and the delivered one it replaced

`assets/icon/` holds the app icon. **Three of its files are the captain's artwork and the
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
| `favicon-32.png` | **The browser tab**, and the second imported file. Captain's illustration, downscaled to 32. See the legibility note below. |
| `apple-touch-icon-180.png` | **The iOS home-screen icon**, and the third imported file. Captain's illustration at 180, **flattened onto `--slate-950`** — see the flattening note below. |
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

## The touch icon is flattened, and full-bleed

**`apple-touch-icon-180.png` is opaque**, unlike the other two captain files. iOS does not
honour alpha on a home-screen icon — it composites onto its own background — so shipped with
the transparent illustration it would land on white or black rather than the dark tile the
mark is drawn for. The captain approved the flatten on 2026-08-28; **the artwork itself is
untouched**, nothing redrawn, recoloured or cropped, and the background is exactly
`--slate-950` `#11111B` from `tokens/colors.css`.

**The transparent illustration is not lost.** `mark-on-dark-256.png` is the same art at 512
with alpha, and is the file to re-flatten from if the tile colour ever changes:

```
magick apple-touch-icon-180.png -background '#11111B' -alpha remove -alpha off \
  -define png:color-type=2 apple-touch-icon-180.png
```

**It is full-bleed, and that was measured rather than guessed.** iOS masks a touch icon with
a superellipse, so art near a corner is clipped — but **zero** of this illustration's pixels
fall outside that mask (checked against an `n = 5` superellipse at 180: 17,717 ink pixels,
none of them outside). So the captain's own framing already clears the mask, and adding
padding would only make the mark read smaller than every neighbouring icon on a home screen
while stacking a second margin on top of the one iOS already applies. It holds its silhouette
down to 60px, which is the smallest size iOS renders a touch icon at.

**Both icons are declared in `apps/web/src/main.tsx`**, not in `index.html` — imported so the
bundler fingerprints them and so the design system stays the one place the artwork lives.
They are wired together on purpose: an `apple-touch-icon` left behind by a favicon edit is
not a thing anybody notices until it is on somebody's home screen.

**Two things about the family are still unresolved**, and are deliberately left rather than
guessed at:

1. **There is no new 1024 master, no Android adaptive pair and no light variant.** The
   delivered ones are still here and depict the old artwork.
2. **The old previews measure the old mark.** They are not checks of anything that ships.

**The amber question is closed by the new art.** It asked whether the cool palette made the
tankard read as teal fluid rather than ale; the illustration is warm wood and cream froth
and does not pose it. `#E8A33A` is still not a token and the warm 1024 variant is still
off-palette.

**All three captain files are destroyed by a design-system delivery.** `assets/` is inside
PORT-NOTES' `rsync --delete` with no exclusion, so the next update silently restores the old
flat mark over `mark-on-dark-256.png` and `favicon-32.png` and **deletes**
`apple-touch-icon-180.png` outright — which breaks the build, since three source files import
them by package path. Re-copy all three after every delivery and confirm `git status` names
them. See PORT-NOTES' deviation list.

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
