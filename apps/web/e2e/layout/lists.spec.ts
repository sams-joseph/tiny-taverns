import type { Page } from "@playwright/test";
import { HEIGHT, box, expect, screens, test } from "../support/app";

/**
 * The Campaigns and Shared Worlds lists draw their body in the Overview's
 * centred frame (`max-w-overview`): their cards, their empty state and their
 * load all share the campaign Overview's edges, and a phone never scrolls
 * sideways. Their header is the chrome's bar, which spans the window. jsdom
 * has no boxes, so only a browser can say so.
 *
 * The empty lists are the creator's wire with the list answered `[]`; the load
 * is held open by leaving the list's read unanswered.
 */

const overview = screens.find((screen) => screen.name === "overview")!;
const lists = [
  {
    screen: screens.find((screen) => screen.name === "campaigns")!,
    read: /\/stub\/me\/campaigns$/,
  },
  { screen: screens.find((screen) => screen.name === "worlds")!, read: /\/stub\/worlds$/ },
];

/** The frame's left and right edges. */
const edges = async (page: Page) => {
  const frame = await box(page.locator("main .max-w-overview").first());
  return { left: frame.x, right: frame.x + frame.width };
};

const expectEdges = (
  measured: { left: number; right: number },
  reference: { left: number; right: number },
  what: string,
) => {
  expect.soft(measured.left, `${what}: left edge`).toBeCloseTo(reference.left, 1);
  expect.soft(measured.right, `${what}: right edge`).toBeCloseTo(reference.right, 1);
};

for (const width of [1280, 768] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const { screen, read } of lists) {
      test(`${screen.name} shares the Overview's frame`, async ({ app, page }) => {
        await app.open(overview);
        const reference = await edges(page);

        await test.step("with cards", async () => {
          await app.open(screen);
          await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
          await expect(page.locator('main [data-slot="card"]').first()).toBeVisible();
          expectEdges(await edges(page), reference, "frame");
        });

        await test.step("empty", async () => {
          await page.route(read, (route) => route.fulfill({ json: [] }));
          await app.open(screen);
          const empty = await box(page.locator('main [data-slot="empty-state"]'));
          expect.soft(empty.x, "empty state: left edge").toBeCloseTo(reference.left, 1);
          expect
            .soft(empty.x + empty.width, "empty state: inside the frame")
            .toBeLessThanOrEqual(reference.right + 0.5);
          expectEdges(await edges(page), reference, "empty frame");
          await page.unroute(read);
        });

        await test.step("loading", async () => {
          await page.route(read, () => {
            // Never answered: the skeleton stays up to be measured.
          });
          await page.reload();
          const loading = page.locator('main [data-slot="loading"]');
          await expect(loading).toBeVisible();
          const skeleton = await box(loading);
          expectEdges(
            { left: skeleton.x, right: skeleton.x + skeleton.width },
            reference,
            "skeleton",
          );
        });
      });
    }
  });
}

test.describe("360px", () => {
  test.use({ viewport: { width: 360, height: HEIGHT } });

  for (const { screen, read } of lists) {
    test(`${screen.name} does not scroll sideways`, async ({ app, page }) => {
      await app.open(screen);
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
      let { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "with cards").toBeLessThanOrEqual(clientWidth);

      await page.route(read, (route) => route.fulfill({ json: [] }));
      await app.open(screen);
      await expect(page.locator('main [data-slot="empty-state"]')).toBeVisible();
      ({ scrollWidth, clientWidth } = await app.widths());
      expect.soft(scrollWidth, "empty").toBeLessThanOrEqual(clientWidth);
    });
  }
});
