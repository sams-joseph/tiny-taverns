import type { Page } from "@playwright/test";
import { COVER_PATH } from "../stub/stubApi";
import { HEIGHT, WIDTHS, box, expect, screens, test, type App } from "../support/app";

/**
 * The top of every Overview — a campaign's, a player's and a Shared World's —
 * is `OverviewHero` (`campaign/OverviewParts.tsx`). The stub draws each with a
 * pitch and a cover picture; each test then takes one of them away.
 *
 * - **The header overlaps the cover only while there is a picture.** With one,
 *   the name rises over its faded bottom; while Hob is drawing (a band, no
 *   picture) it sits flat under the band; when the picture fails to load the
 *   cover goes and nothing rises over the space it left.
 * - **The actions never sit on the picture.** Only the name and its meta line
 *   rise; the actions' top is at or below the cover's bottom.
 * - **The description's slot is never shorter than the actions** while the two
 *   share a row, with a pitch and without one, so the name's distance from the
 *   row below it does not depend on whether there is a pitch. Wrapped under the
 *   slot, the actions are themselves the space and an empty slot takes none.
 */

const heroed = ["overview", "player-overview", "world"].map((name) =>
  screens.find((screen) => screen.name === name)!,
);

/** Answer the Overview's own read with its cover changed. */
const withCover = (page: Page, change: Record<string, unknown>) =>
  page.route(
    (url) => /^\/stub\/(campaigns|worlds)\/[^/]+$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), ...change } });
    },
  );

/**
 * The description's slot against the actions beside it, as drawn and again
 * with the pitch taken out of the slot (and put back), so one fixture answers
 * both "with" and "without a description".
 */
async function descriptionReservesTheActions(app: App) {
  const states = await app.page.evaluate(() => {
    const hero = document.querySelector('[data-slot="overview-hero"]')!;
    const slot = hero.querySelector('[data-slot="overview-hero-description"]')!;
    const actions = hero.querySelector('[data-slot="overview-hero-actions"]')!;
    const read = (pitch: boolean) => {
      const s = slot.getBoundingClientRect();
      const a = actions.getBoundingClientRect();
      // Beside the slot rather than wrapped under it.
      return { pitch, slot: s.height, actions: a.height, beside: Math.abs(a.top - s.top) < 1 };
    };
    const pitch = slot.firstElementChild;
    const drawn = read(pitch !== null);
    if (pitch === null) return [drawn];
    slot.removeChild(pitch);
    const empty = read(false);
    slot.appendChild(pitch);
    return [drawn, empty];
  });
  expect(states[0]!.pitch, "the stub draws a pitch").toBe(true);
  for (const state of states)
    if (state.beside)
      expect
        .soft(state.slot, `the slot ${state.pitch ? "with" : "without"} a pitch`)
        .toBeGreaterThanOrEqual(state.actions - 0.5);
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const screen of heroed) {
      test.describe(screen.name, () => {
        test("with a cover picture, the name rises over it and the actions do not", async ({
          app,
          page,
        }) => {
          await app.open(screen);
          const cover = page.locator('[data-slot="hob-cover"]');
          await expect(cover).toHaveAttribute("data-picture");
          await expect(cover.locator("img")).toHaveAttribute("data-loaded");
          const bottom = await box(cover).then((b) => b.y + b.height);
          const header = await box(page.locator('[data-slot="overview-hero"] > header'));
          expect.soft(header.y, "the header rises over the cover").toBeLessThan(bottom);
          const actions = await box(page.locator('[data-slot="overview-hero-actions"]'));
          expect
            .soft(actions.y, "the actions sit below the cover")
            .toBeGreaterThanOrEqual(bottom - 0.5);
          await descriptionReservesTheActions(app);
        });

        test("while Hob draws the cover, the header sits flat under the band", async ({
          app,
          page,
        }) => {
          await withCover(page, { image: null, imagePending: true });
          await app.open(screen);
          const cover = page.locator('[data-slot="hob-cover"]');
          await expect(cover).toBeVisible();
          await expect(cover).not.toHaveAttribute("data-picture");
          const bottom = await box(cover).then((b) => b.y + b.height);
          const header = await box(page.locator('[data-slot="overview-hero"] > header'));
          expect.soft(header.y, "the header starts below the band").toBeGreaterThanOrEqual(bottom);
          await descriptionReservesTheActions(app);
        });

        test("when the picture fails to load, the cover goes and the header is flat", async ({
          app,
          page,
        }) => {
          await page.route(`**/stub${COVER_PATH}`, (route) => route.fulfill({ status: 404 }));
          await app.open(screen);
          await expect(page.locator('[data-slot="hob-cover"]')).toHaveCount(0);
          const hero = await box(page.locator('[data-slot="overview-hero"]'));
          const header = await box(page.locator('[data-slot="overview-hero"] > header'));
          expect.soft(header.y, "the header starts at the hero's top").toBeCloseTo(hero.y, 0);
          await descriptionReservesTheActions(app);
        });
      });
    }
  });
}
