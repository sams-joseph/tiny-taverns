import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The encounter builder (`campaign/EncounterBuilderScreen.tsx`), at every
 * width: where the rail stands against the form, the order everything stacks
 * in when it does not fit beside it, that a roster line keeps its name
 * readable on a phone, and that the stepper's buttons are what a press lands
 * on. All of it is layout, which jsdom does not compute. The rules every
 * screen keeps (no sideways scroll, no inner scroller, one peach) are
 * `screens.spec.ts`'s, which walks both builder routes too.
 *
 * Read over the creator scenario: *Ambush in the reeds* with its one line of
 * Goblin Bosses, and the bestiary's two creatures.
 */

const edit = screens.find((screen) => screen.name === "encounter-edit")!;
const fresh = screens.find((screen) => screen.name === "encounter-new")!;

/** From `@4xl` of content the rail stands beside the form: 1440 and 1024, not 760 or 390. */
const TWO_COLUMNS_FROM = 1024;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("encounter builder layout", async ({ app, page }) => {
      await app.open(edit);
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
      // A second line, so the roster has a long name and a short one.
      await page.getByRole("button", { name: "Add Marsh Hag" }).click();
      await expect(page.locator('[data-slot="roster-line"]')).toHaveCount(2);
      await app.settle();

      const details = await box(page.getByRole("textbox", { name: "Name" }));
      const creatures = await box(page.locator("#creatures"));
      const rail = await box(page.locator('[data-slot="encounter-builder-rail"]'));
      const runningIt = await box(page.getByRole("textbox", { name: "Running it" }));

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      if (width >= TWO_COLUMNS_FROM) {
        await test.step("the rail stands beside the form", async () => {
          expect.soft(rail.x, "rail left").toBeGreaterThan(details.x + details.width);
          expect.soft(rail.x, "rail left").toBeGreaterThan(creatures.x + creatures.width);
          expect.soft(rail.y, "rail top").toBeLessThan(creatures.y);
        });
      } else {
        await test.step("stacked in the order a DM works: roster, rail, then running it", async () => {
          expect
            .soft(rail.y, "rail top")
            .toBeGreaterThanOrEqual(creatures.y + creatures.height - 0.5);
          expect.soft(runningIt.y, "running it top").toBeGreaterThanOrEqual(rail.y + rail.height);
          expect.soft(rail.x, "rail left").toBeCloseTo(creatures.x, 0);
        });
      }

      await test.step("every roster line keeps its name readable, its numbers on one line", async () => {
        const lines = await page.locator('[data-slot="roster-line"]').evaluateAll((rows) =>
          rows.map((row) => {
            const name = row.querySelector<HTMLElement>('[data-slot="roster-name"]')!;
            const meta = row.querySelector<HTMLElement>('[data-slot="roster-meta"]')!;
            const lineHeight = Number.parseFloat(getComputedStyle(meta).lineHeight);
            return {
              name: name.getBoundingClientRect().width,
              clipped: name.scrollWidth > name.clientWidth + 0.5,
              metaLines: Math.round(meta.getBoundingClientRect().height / lineHeight),
              metaFits: meta.scrollWidth <= meta.clientWidth + 0.5,
              right: row.getBoundingClientRect().right,
              card: row.parentElement!.getBoundingClientRect().right,
            };
          }),
        );
        for (const line of lines) {
          expect.soft(line.name, "a creature's name box").toBeGreaterThanOrEqual(120);
          expect.soft(line.clipped, "a creature's name is clipped").toBe(false);
          expect.soft(line.metaLines, "CR · AC · hp lines").toBe(1);
          expect.soft(line.metaFits, "CR · AC · hp fits its box").toBe(true);
          expect.soft(line.right, "line right").toBeLessThanOrEqual(line.card + 0.5);
        }
      });

      await test.step("every bestiary row keeps its name readable", async () => {
        const names = await page
          .locator('[data-slot="picker-name"]')
          .evaluateAll((spans) => spans.map((span) => span.getBoundingClientRect().width));
        expect.soft(names.length, "bestiary rows").toBeGreaterThan(0);
        for (const name of names)
          expect.soft(name, "a bestiary name's width").toBeGreaterThanOrEqual(96);
        const rows = await page
          .locator('[data-slot="picker-row"]')
          .evaluateAll((items) => items.map((item) => item.scrollWidth <= item.clientWidth + 0.5));
        for (const fits of rows) expect.soft(fits, "a bestiary row fits its box").toBe(true);
      });

      await test.step("a press on the stepper lands on it, and counts", async () => {
        const more = page.getByRole("button", { name: "One more Goblin Boss" });
        await more.scrollIntoViewIfNeeded();
        const at = await box(more);
        const hit = await page.evaluate(
          ({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            return element?.closest("button")?.getAttribute("aria-label") ?? null;
          },
          { x: at.x + at.width / 2, y: at.y + at.height / 2 },
        );
        expect.soft(hit, "what the press lands on").toBe("One more Goblin Boss");
        const count = page.getByLabel("How many Goblin Boss");
        await expect(count).toHaveText("6");
        await more.click();
        await expect(count).toHaveText("7");
      });
    });

    test("a new encounter opens blank, with its header on one row from 896 up", async ({
      app,
      page,
    }) => {
      await app.open(fresh);
      await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("");
      await expect(page.locator('[data-slot="roster-line"]')).toHaveCount(0);
      const save = await box(page.getByRole("button", { name: "Save encounter" }));
      const cancel = await box(page.getByRole("button", { name: "Cancel" }));
      const ready = await box(page.getByRole("switch", { name: "Ready to run" }));
      if (width >= 1024) {
        expect.soft(cancel.y, "Cancel beside Save").toBeCloseTo(save.y, 0);
        expect.soft(ready.x, "Ready before Cancel").toBeLessThan(cancel.x);
      }
      expect.soft(save.x + save.width, "Save inside the page").toBeLessThanOrEqual(width);
    });
  });
}
