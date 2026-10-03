import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * A seated player's table (`play/PlayerTableScreen.tsx`) with the fight's map
 * shared (`play/PlayerBoard.tsx`), at every width: the board fills its column
 * at the picture's shape, each token stands on its own square of it and is what
 * is on top there, nothing on the board takes a pointer, and fog of war covers
 * its squares opaque with only the player's own token over it. Where a token
 * lands, what covers it and what a tap hits are layout, which jsdom does not
 * compute.
 *
 * Read over the `seated` scenario (`test/scenarios.ts`): Brannoc, Nessa and a
 * Marsh Hag in the order, Brannoc up, and a 24 × 16 board of 64px squares on a
 * 1536 × 1024 picture with Brannoc and the hag standing on it.
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

      await test.step("the turn banner heads the order's column and holds its words", async () => {
        const banner = page.getByRole("status", { name: "Turn" });
        await expect.soft(banner).toContainText("Brannoc Duskharrow's turn");
        await expect.soft(banner).toContainText("Up next");
        const turn = await box(banner);
        expect.soft(turn.x, "in the order's column").toBeCloseTo(at.list.x, 0);
        expect.soft(turn.width, "as wide as the order").toBeCloseTo(at.list.width, 0);
        expect.soft(turn.y + turn.height, "above the order").toBeLessThan(at.list.y);
        const spill = await banner.evaluate((el) =>
          [...el.querySelectorAll("span")].some((span) => {
            const inner = span.getBoundingClientRect();
            const outer = el.getBoundingClientRect();
            return inner.left < outer.left || inner.right > outer.right;
          }),
        );
        expect.soft(spill, "no line runs out of the banner").toBe(false);
      });

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

    test("fog on the shared map", async ({ app, page }) => {
      // The DM fogged Brannoc's square and the one beside it: the table still
      // sends his own token there, and nothing else.
      const fogged = [
        { column: 5, row: 4 },
        { column: 6, row: 4 },
      ];
      await page.route(
        (url) => /\/stub\/campaigns\/[^/]+\/table$/.test(url.pathname),
        async (route) => {
          const response = await route.fetch();
          const table = (await response.json()) as {
            fight: { board: Record<string, unknown> | null } | null;
          };
          await route.fulfill({
            response,
            json:
              table.fight?.board == null
                ? table
                : {
                    ...table,
                    fight: { ...table.fight, board: { ...table.fight.board, fog: fogged } },
                  },
          });
        },
      );
      await app.open(table);
      const card = page.getByRole("region", { name: "Battle map" });
      const board = card.locator('[data-slot="battle-map"]');
      const fog = board.locator('[data-slot="fog"]');
      await expect(fog).toHaveAttribute("data-squares", "2");

      await test.step("the fog is opaque, over the picture and the grid, on its two squares", async () => {
        const path = fog.locator("path");
        const fill = await path.evaluate((el) => getComputedStyle(el).fill);
        const sunken = await page.evaluate(() => {
          const probe = document.createElement("span");
          probe.style.color = "var(--surface-sunken)";
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        });
        expect.soft(fill, "the full surface, not a dimmed one").toBe(sunken);
        const inner = await board.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + el.clientLeft, y: r.y + el.clientTop, width: el.clientWidth };
        });
        const square = inner.width / COLUMNS;
        const covered = await box(path);
        expect.soft(covered.x, "from Brannoc's column").toBeCloseTo(inner.x + 5 * square, 0);
        expect.soft(covered.y, "on his row").toBeCloseTo(inner.y + 4 * square, 0);
        expect.soft(covered.width, "two squares wide").toBeCloseTo(square * 2, 0);
        // The square beside him is the fog, painted over the picture and the
        // grid. The fog takes no pointer, so it is lent one to be hit-tested.
        const beside = await fog.evaluate(
          (el: SVGElement, [x, y]) => {
            el.style.pointerEvents = "auto";
            const under = document.elementFromPoint(x!, y!);
            el.style.pointerEvents = "";
            return under?.closest("[data-slot=fog]") != null
              ? "fog"
              : (under?.tagName ?? "nothing");
          },
          [inner.x + 6.5 * square, inner.y + 4.5 * square],
        );
        expect.soft(beside, "the fog is on top of the picture").toBe("fog");
      });

      await test.step("the player's own token stands over it", async () => {
        const you = card.getByRole("img", { name: /^Brannoc Duskharrow \(you\)/ });
        const at = await box(you);
        const hit = await page.evaluate(
          ([x, y]) =>
            document
              .elementFromPoint(x!, y!)
              ?.closest("[data-slot=token]")
              ?.getAttribute("aria-label") ?? null,
          [at.x + at.width / 2, at.y + at.height / 2],
        );
        expect.soft(hit, "his token is on top").toMatch(/^Brannoc Duskharrow \(you\)/);
      });
    });
  });
}
