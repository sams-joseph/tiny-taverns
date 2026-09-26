import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * One content top edge for every campaign screen, so sibling tabs line up: the
 * same `main` top, the same `h1` y and — from `PageHeader`'s wrap breakpoint
 * (896px) up, where its row does not wrap — the same header height, so
 * whatever follows the header starts at one y too.
 *
 * The Overviews, the creator's and a player's, are exempt from the last two:
 * they have no tab header, and the `h1` is the campaign's name in the hero,
 * over the cover when there is one (`campaign/CampaignHero.tsx`), so it lands
 * where the cover puts it.
 *
 * The runner, a fight's and a scene's, is exempt from the `h1`'s y alone. It is no tab, and the redesign
 * draws its header on a card (`PageHeader`'s `framed`), so the title sits inside
 * the card's border and padding; the header's row is still the one height.
 */

const HEROED = new Set(["overview", "player-overview"]);
const FRAMED = new Set(["run", "run-social", "run-challenge", "run-hazard"]);
const campaignScreens = screens.filter((screen) => screen.path.startsWith("/campaigns/"));

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("every campaign screen's content starts at one y", async ({ app, page }) => {
      const measured: Array<{ name: string; mainTop: number; h1: number; header: number }> = [];
      let scenario: string | undefined;
      for (const screen of campaignScreens) {
        // In the page, as a DM changing tab would; from cold only when the
        // account changes.
        if (screen.scenario === scenario) await app.go(screen.path);
        else await app.open(screen);
        scenario = screen.scenario;
        const heading = page.locator('main [data-slot="page-heading"]');
        const headed = !HEROED.has(screen.name);
        measured.push({
          name: screen.name,
          mainTop: (await box(page.locator("main"))).y,
          h1: headed ? (await box(heading.locator("h1"))).y : NaN,
          header: headed ? (await box(heading.locator("> *").first())).height : NaN,
        });
      }
      const [reference] = measured;
      const headed = measured.filter((row) => !HEROED.has(row.name));
      for (const row of measured)
        expect.soft(row.mainTop, `${row.name}: main's top`).toBeCloseTo(reference!.mainTop, 1);
      for (const row of headed) {
        if (!FRAMED.has(row.name))
          expect.soft(row.h1, `${row.name}: the h1's y`).toBeCloseTo(headed[0]!.h1, 1);
        if (width >= 896) expect.soft(row.header, `${row.name}: header height`).toBeCloseTo(48, 0);
      }
    });
  });
}
