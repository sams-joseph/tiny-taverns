import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Cast tab (`cast/CastScreen.tsx`) at every width: the card grid's
 * columns, a row of cards lining up, the header, the filter row and the grid
 * sharing one left edge inside the Overview's centred frame, and each card
 * opening its NPC from anywhere on its face, the portrait band included. All
 * of it is layout or hit-testing, which jsdom does not compute.
 *
 * Read over the creator scenario's `castShelf`: five NPCs, one with Hob's
 * portrait, one Hob is still drawing, one whose role wraps and one with none.
 */

const cast = screens.find((screen) => screen.name === "cast")!;

/** The drawing's column count at each width: `auto-fill` over a 250px floor. */
const COLUMNS: Readonly<Record<(typeof WIDTHS)[number], number>> = {
  1440: 4,
  1024: 3,
  760: 2,
  390: 1,
};

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("cast cards", async ({ app, page }) => {
      await app.open(cast);
      const cards = page.locator('[data-slot="npc-card"]');
      await expect(cards).toHaveCount(5);
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const placed = await cards.evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            name: el.querySelector("[data-card-link]")?.textContent ?? "",
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            nameTop: el.querySelector("[data-card-link]")!.getBoundingClientRect().top,
          };
        }),
      );

      await test.step(`${String(COLUMNS[width])} columns`, async () => {
        const firstRow = placed.filter((card) => Math.abs(card.y - placed[0]!.y) < 1);
        expect.soft(firstRow.length, "cards in the first row").toBe(COLUMNS[width]);
        for (const card of placed) {
          expect
            .soft(card.width, `${card.name} width`)
            .toBeGreaterThanOrEqual(Math.min(250, width - 32) - 0.5);
        }
      });

      await test.step("a row of cards is one height, with the names on one line", async () => {
        const byRow = new Map<number, typeof placed>();
        for (const card of placed) {
          const key = Math.round(card.y);
          byRow.set(key, [...(byRow.get(key) ?? []), card]);
        }
        for (const row of byRow.values()) {
          const [first, ...rest] = row;
          for (const card of rest) {
            expect.soft(card.height, `${card.name} height`).toBeCloseTo(first!.height, 0);
            expect.soft(card.nameTop, `${card.name} name top`).toBeCloseTo(first!.nameTop, 0);
          }
        }
      });

      await test.step("the header, the filter row and the grid share a left edge", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        const search = await box(page.locator('[data-slot="cast-filters"] > *').first());
        const grid = await box(page.locator('[data-slot="cast-grid"]'));
        expect.soft(h1.x, "h1 left").toBeCloseTo(grid.x, 0);
        expect.soft(search.x, "search left").toBeCloseTo(grid.x, 0);
        expect.soft(search.y + search.height, "search above the grid").toBeLessThan(grid.y);
        expect.soft(grid.width, "grid inside the page").toBeLessThanOrEqual(width);
        // Centred at the Overview's width: as far from the right as the left.
        if (width === 1440) expect.soft(grid.x).toBeCloseTo(width - (grid.x + grid.width), 0);
      });

      await test.step("Hob is drawing sits inside its card's portrait band", async () => {
        const grusk = cards.filter({ has: page.getByRole("link", { name: "Grusk" }) });
        const band = await box(grusk.locator(":scope > div").first());
        const badge = await box(grusk.getByRole("status"));
        expect.soft(badge.y, "badge top").toBeGreaterThanOrEqual(band.y);
        expect
          .soft(badge.y + badge.height, "badge bottom")
          .toBeLessThanOrEqual(band.y + band.height);
        expect.soft(badge.x + badge.width, "badge right").toBeLessThanOrEqual(band.x + band.width);
      });

      await test.step("the card opens its NPC from anywhere on its face", async () => {
        const hollis = cards.filter({ has: page.getByRole("link", { name: "Master Hollis" }) });
        await hollis.scrollIntoViewIfNeeded();
        const portrait = await box(hollis.locator(":scope > div").first());
        const at = { x: portrait.x + portrait.width / 2, y: portrait.y + portrait.height / 2 };
        const target = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.textContent ?? null,
          at,
        );
        expect.soft(target, "the portrait band is the name link's overlay").toBe("Master Hollis");
        const href = await hollis.getByRole("link", { name: "Master Hollis" }).getAttribute("href");
        await page.mouse.click(at.x, at.y);
        await expect(page).toHaveURL((url) => url.pathname === href);
      });
    });
  });
}
