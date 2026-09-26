import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * A seated player's table (`play/PlayerTableScreen.tsx`) with the fight's map
 * shared (`play/PlayerBoard.tsx`), at every width: the board fills its column
 * at the picture's shape, each token stands on its own square of it and is what
 * is on top there, and nothing on the board takes a pointer. Where a token
 * lands, what covers it and what a tap hits are layout, which jsdom does not
 * compute.
 *
 * Read over the `seated` scenario (`test/scenarios.ts`): Brannoc, Nessa and a
 * Marsh Hag in the order, and a 24 × 16 board of 64px squares on a 1536 × 1024
 * picture with Brannoc and the hag standing on it.
 */

const table = screens.find((screen) => screen.name === "player-table-fight")!;

/** The fixture board: 24 columns of 64px on a 1536px-wide picture. */
const COLUMNS = 24;
const PICTURE = { width: 1536, height: 1024 };

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the shared battle map", async ({ app, page }) => {
      await app.open(table);
      const card = page.getByRole("region", { name: "Battle map" });
      const board = card.locator('[data-slot="battle-map"]');
      const initiative = page
        .getByText("Initiative", { exact: true })
        .locator("xpath=ancestor::*[@data-slot='card'][1]");
      await expect(board).toBeVisible();

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const at = { card: await box(card), board: await box(board), list: await box(initiative) };

      await test.step("the board fills its card at the picture's shape, under the order", async () => {
        expect.soft(at.board.x, "board x").toBeCloseTo(at.card.x + 1, 0);
        expect.soft(at.board.width, "board width").toBeCloseTo(at.card.width - 2, 0);
        expect
          .soft(at.board.height, "board height")
          .toBeCloseTo((at.board.width * PICTURE.height) / PICTURE.width, 0);
        expect.soft(at.card.x, "in the order's column").toBeCloseTo(at.list.x, 0);
        expect.soft(at.card.width, "as wide as the order").toBeCloseTo(at.list.width, 0);
        expect.soft(at.card.y, "under the order").toBeGreaterThan(at.list.y + at.list.height);
      });

      await test.step("the picture is drawn under the grid", async () => {
        const picture = board.locator("img");
        await expect.soft(picture).toHaveCSS("opacity", "1");
        const drawn = await picture.evaluate((img: HTMLImageElement) => img.naturalWidth);
        expect.soft(drawn, "picture loaded").toBeGreaterThan(0);
        await expect.soft(board.locator('[data-slot="battle-map-grid"] line')).toHaveCount(42);
      });

      await test.step("each token is on its square, on top, and presses nothing", async () => {
        // Tokens are laid in the board's padding box, inside its 1px border.
        const inner = await board.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + el.clientLeft, y: r.y + el.clientTop, width: el.clientWidth };
        });
        const square = inner.width / COLUMNS;
        const tokens = [
          { name: /^Brannoc Duskharrow \(you\), column 6, row 5/, column: 5, row: 4 },
          { name: /^Marsh Hag, column 12, row 7/, column: 11, row: 6 },
        ];
        for (const token of tokens) {
          const found = card.getByRole("img", { name: token.name });
          const place = await box(found);
          expect.soft(place.width, "a square wide").toBeCloseTo(square, 0);
          expect.soft(place.x, "its column").toBeCloseTo(inner.x + token.column * square, 0);
          expect.soft(place.y, "its row").toBeCloseTo(inner.y + token.row * square, 0);
          const hit = await page.evaluate(
            ([x, y]) => {
              const under = document.elementFromPoint(x!, y!);
              return {
                token: under?.closest("[data-slot=token]")?.getAttribute("aria-label") ?? null,
                pressable: under?.closest("button, a, input, [role=button]") != null,
              };
            },
            [place.x + place.width / 2, place.y + place.height / 2],
          );
          expect.soft(hit.token, "the token is what is there").toMatch(token.name);
          expect.soft(hit.pressable, "a tap on it presses nothing").toBe(false);
        }
        await expect.soft(card.getByRole("button")).toHaveCount(0);
      });
    });
  });
}
