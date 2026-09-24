import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * One heading recipe: `SectionHeading` in `@taverns/ui`.
 *
 * Every section heading goes through the component, and anything else that
 * wants heading type (a card's name that is not a heading element, an editable
 * title) takes `sectionHeadingVariants`.
 */

const src = dirname(fileURLToPath(import.meta.url));

/**
 * The display face outside the recipe, and why each is not a heading. Counts
 * are exact so an entry cannot outlive the use it excuses.
 */
const displayFaceElsewhere: Readonly<Record<string, number>> = {
  // Figures: a roll total, a level, a modifier, a score. The delivery draws
  // numbers in the display face at `leading-none`, which no heading is.
  "characters/AbilityFields.tsx": 1,
  "characters/CharacterSheetScreen.tsx": 2,
  "characters/SheetParts.tsx": 3,
  "run/RunScreen.tsx": 1,
  // Monograms: initials on an NPC's plate, and on a character's plate and
  // roster card, under the portrait when there is one.
  "cast/NpcAvatar.tsx": 1,
  "characters/CharacterPortrait.tsx": 2,
  // Prose in the display face: the kit's one decorative line, and a draft's notes.
  "characters/CharacterCreateScreen.tsx": 1,
  "characters/DraftAside.tsx": 1,
  "characters/DraftCard.tsx": 1,
  // The wordmark, and the landing page's `h1`.
  "marketing/MarketingScreen.tsx": 2,
  // The shell's wordmark, and the campaign name inside the row's `BackLink`:
  // chrome labels, not headings. The page title is `PageHeader`'s.
  "shell/AppShell.tsx": 2,
};

function sources(dir: string): { path: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [{ path: relative(src, full), source: readFileSync(full, "utf8") }];
  });
}

describe("one heading recipe", () => {
  const files = sources(src);

  it("draws no raw h2–h6: section headings are SectionHeading", () => {
    const raw = files.flatMap(({ path, source }) =>
      [...source.matchAll(/<h[2-6][\s>]/g)].map((match) => `${path}: ${match[0].trim()}`),
    );
    expect(raw).toEqual([]);
  });

  it("uses the display face only through the recipe, or where the list above says why", () => {
    const found = Object.fromEntries(
      files
        .map(({ path, source }) => [path, source.match(/\bfont-display\b/g)?.length ?? 0] as const)
        .filter(([, count]) => count > 0),
    );
    expect(found).toEqual(displayFaceElsewhere);
  });
});
