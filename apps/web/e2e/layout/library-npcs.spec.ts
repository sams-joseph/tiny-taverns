import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Library's NPC shelf (`cast/NpcLibraryScreen.tsx`) and one source's stats
 * page (`cast/LibraryNpcScreen.tsx`) at every width. On the shelf: each card's
 * one stats line inside the card, and the card opening the source's page from
 * anywhere on its face while its own verbs stay pressable. On the page: the
 * sheet in the Overview's centred frame, nothing sideways, the identity card's
 * actions inside it and clear of each other. All of it is layout or
 * hit-testing, which jsdom does not compute.
 *
 * Read over the creator scenario, where Cazril's original carries the Cast's
 * Cazril's sheet.
 */

const shelf = screens.find((screen) => screen.name === "library-npcs")!;
const sourcePage = screens.find((screen) => screen.name === "library-npc")!;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("library npc card", async ({ app, page }) => {
      await app.open(shelf);
      const card = page.locator('[data-slot="card"]').filter({ hasText: "Cazril" });
      const line = card.locator('[data-slot="npc-source-stats"]');
      await expect(line).toHaveText("Level 5 Human Fighter · AC 17 · HP 44 · CR 3");

      await test.step("the stats line sits inside the card", async () => {
        const frame = await box(card);
        const drawn = await box(line);
        expect.soft(drawn.x, "line left").toBeGreaterThanOrEqual(frame.x);
        expect
          .soft(drawn.x + drawn.width, "line right")
          .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      });

      await test.step("the card's verbs are on top of its link", async () => {
        for (const name of ["Edit Cazril", "Share", "Add to campaign"]) {
          const button = card.getByRole("button", { name });
          const hit = await button.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return top !== null && el.contains(top);
          });
          expect.soft(hit, `${name} is what a press there hits`).toBe(true);
        }
      });

      await test.step("a press on its face opens the source's stats", async () => {
        const at = await box(line);
        await page.mouse.click(at.x + 4, at.y + at.height / 2);
        await expect(page).toHaveURL(new RegExp(`${sourcePage.path}$`));
        await expect(page.getByRole("heading", { name: "Level 5 Human Fighter" })).toBeVisible();
      });
    });

    test("library npc stats", async ({ app, page }) => {
      await app.open(sourcePage);
      const panel = page.locator('[data-slot="npc-sheet"]');
      await expect(panel.getByRole("heading", { name: "Level 5 Human Fighter" })).toBeVisible();

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("it sits in the Overview's frame, inside the page", async () => {
        const main = await box(page.locator("main"));
        const frame = await box(panel);
        expect.soft(frame.x, "panel left").toBeGreaterThanOrEqual(main.x);
        expect.soft(frame.x + frame.width, "panel right").toBeLessThanOrEqual(main.x + main.width);
        // Centred at the Overview's width: as far from the right as the left.
        if (width === 1440) expect.soft(frame.x).toBeCloseTo(width - (frame.x + frame.width), 0);
      });

      await test.step("the identity card's actions and the document stay inside it", async () => {
        const frame = await box(panel);
        const parts = await panel
          .locator('button, [data-slot="card"], section')
          .evaluateAll((els) =>
            els.map((el) => {
              const rect = el.getBoundingClientRect();
              return { name: el.textContent?.slice(0, 24) ?? "", x: rect.x, w: rect.width };
            }),
          );
        for (const part of parts) {
          expect.soft(part.x, `${part.name} left`).toBeGreaterThanOrEqual(frame.x - 0.5);
          expect
            .soft(part.x + part.w, `${part.name} right`)
            .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
        }
        const edit = await box(panel.getByRole("button", { name: "Edit stats" }));
        const remove = await box(panel.getByRole("button", { name: "Remove" }));
        const apart =
          edit.x + edit.width <= remove.x ||
          remove.x + remove.width <= edit.x ||
          edit.y + edit.height <= remove.y ||
          remove.y + remove.height <= edit.y;
        expect.soft(apart, "Edit stats clear of Remove").toBe(true);
      });
    });
  });
}
