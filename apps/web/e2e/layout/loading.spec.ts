import { HEIGHT, box, expect, screens, test } from "../support/app";

/**
 * The page skeleton (`Loading`, `packages/ui`) is drawn in the Overview's
 * centred frame, so a load's edges are where the Overview's content lands.
 * jsdom has no boxes, so only a browser can say the two frames coincide.
 *
 * The load is held open by leaving the campaign's read unanswered.
 */

const overview = screens.find((screen) => screen.name === "overview")!;
const campaignRead = new RegExp(`/stub${overview.path}$`);

for (const width of [1440, 390] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the page skeleton shares the Overview's frame", async ({ app, page }) => {
      await app.open(overview);
      const frame = await box(page.locator("main .max-w-overview").first());

      await page.route(campaignRead, () => {
        // Never answered: the skeleton stays up to be measured.
      });
      await page.reload();
      const loading = page.locator('main [data-slot="loading"]');
      await expect(loading).toBeVisible();
      const skeleton = await box(loading);

      expect.soft(skeleton.x, "left edge").toBeCloseTo(frame.x, 1);
      expect.soft(skeleton.x + skeleton.width, "right edge").toBeCloseTo(frame.x + frame.width, 1);
      const { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "no sideways scroll").toBeLessThanOrEqual(clientWidth);
    });
  });
}
