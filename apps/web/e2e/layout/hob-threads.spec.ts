import type { Locator } from "@playwright/test";
import { campaignId } from "../../src/test/ids";
import { HEIGHT, box, expect, test } from "../support/app";

/**
 * The Hob panel's conversations list, pressed in a real browser: a sheet that
 * slides out from the panel's left edge and covers part of it, and only it.
 *
 * jsdom draws no box, so it cannot say that the sheet sits inside the panel
 * rather than over the screen beside it, that it leaves a strip of the
 * conversation showing, or that a pointer at a row reaches the row rather than
 * the scrim. Inline (1440) and overlaid (760), since the overlaid panel is
 * itself a sheet and the list is a sheet inside it.
 */

const INLINE_FROM = 1020;

/** Whether a pointer at the element's centre lands on it, rather than on something over it. */
const reachable = (control: Locator) =>
  control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  });

for (const width of [1440, 760]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the conversations list opens over the panel and opens a conversation", async ({
      app,
      page,
    }) => {
      await app.open({
        name: "overview",
        scenario: "creator-hob-threads",
        path: `/campaigns/${campaignId}`,
      });
      await page.locator("button[aria-pressed]").filter({ hasText: "Ask Hob" }).click();
      const panel = page.locator('section[aria-label="Hob"]');
      // The newest conversation is resumed, as before there was a list.
      await expect(panel.getByText("Grusk, and he counts every coin twice.")).toBeVisible();
      await app.settle();

      const opener = panel.getByRole("button", { name: "Conversations" });
      const list = page.locator("[data-slot=hob-threads]");

      await test.step("it slides out from the panel's left edge and covers part of it", async () => {
        expect(await reachable(opener), "a pointer at Conversations reaches it").toBe(true);
        await opener.click();
        await expect(list).toBeVisible();
        await app.settle();

        const sheet = await box(list);
        const drawer = await box(panel);
        expect.soft(sheet.x, "the list's left edge is the panel's").toBeCloseTo(drawer.x, 0);
        expect.soft(sheet.y, "the list's top is the panel's").toBeCloseTo(drawer.y, 0);
        expect.soft(sheet.height, "as tall as the panel").toBeCloseTo(drawer.height, 0);
        expect.soft(sheet.width, "narrower than the panel").toBeLessThan(drawer.width - 40);

        // The strip it leaves is the panel under the scrim, and nothing past
        // the panel is covered: inline, the screen beside it stays the screen.
        const strip = await page.evaluate(
          ({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            return {
              inPanel: hit?.closest('section[aria-label="Hob"]') !== null,
              scrim: hit?.closest("[data-slot=sheet-overlay]") !== null,
            };
          },
          { x: sheet.x + sheet.width + 10, y: drawer.y + drawer.height / 2 },
        );
        expect.soft(strip, "the uncovered strip of the panel").toEqual({
          inPanel: true,
          scrim: true,
        });
        if (width >= INLINE_FROM) {
          const main = await box(page.locator("main"));
          const beside = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.closest("main") !== null,
            { x: main.x + main.width / 2, y: main.y + 40 },
          );
          expect.soft(beside, "the screen beside the panel is not covered").toBe(true);
        }

        const rows = list.getByRole("button", { name: /toll|ferryman/ });
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toHaveAttribute("aria-current", "true");
        await expect(rows.first()).toContainText("Who keeps the toll?");
        await expect(rows.nth(1)).toContainText("Name the ferryman");
      });

      await test.step("Escape closes the list and leaves the panel open", async () => {
        await page.keyboard.press("Escape");
        await expect(list).toBeHidden();
        await expect(panel).toBeVisible();
        await opener.click();
        await expect(list).toBeVisible();
        await app.settle();
      });

      await test.step("a row opens its conversation in the panel", async () => {
        const older = list.getByRole("button", { name: /Name the ferryman/ });
        expect(await reachable(older), "a pointer at the row reaches it").toBe(true);
        await older.click();
        await expect(list).toBeHidden();
        await expect(panel.getByText("Cazril, and he takes only a name.")).toBeVisible();
        await expect(panel.getByText("Grusk, and he counts every coin twice.")).toBeHidden();
      });
    });
  });
}
