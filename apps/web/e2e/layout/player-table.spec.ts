import type { Locator, Page } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * A seated player's table (`play/PlayerTableScreen.tsx`) with the fight's map
 * shared, at every width, laid out as the DM's runner is.
 *
 * - **On the canvas** (from `@3xl` of `main`, `run/RunStage.tsx`): the stage
 *   is bounded to the viewport and the window does not scroll; the strip runs
 *   across the top, the player's card and the turn banner are the right-hand
 *   panel, their rolls the left; the board lies under them, and the player's
 *   own token is on the board clear of every panel.
 * - **In the grid** (`run/RunLayout.tsx`), below it: the strip heads the page
 *   and the map is a card at the picture's shape, its tokens a picture with
 *   nothing to press.
 *
 * At either, each token stands on its own square and is what is on top there;
 * fog of war covers its squares opaque with only the player's own token over
 * it; an area the DM pinned lies under the tokens. On the canvas, on their own
 * turn, a drag moves the player's own token (`table.move`) and a drag on the
 * hag moves nothing. Where a token lands, what covers it and what a press hits
 * are layout, which jsdom does not compute.
 *
 * Read over the `seated` scenario (`test/scenarios.ts`): Brannoc, Nessa and a
 * Marsh Hag in the order, Brannoc up, and a 24 × 16 board of 64px squares on a
 * 1536 × 1024 picture with Brannoc and the hag standing on it.
 */

const table = screens.find((screen) => screen.name === "player-table-fight")!;

/** The fixture board: 24 columns of 64px on a 1536px-wide picture. */
const COLUMNS = 24;
const PICTURE = { width: 1536, height: 1024 };

const BRANNOC = /^Brannoc Duskharrow \(you\), column 6, row 5/;
const HAG = /^Marsh Hag, column 12, row 7/;

/** The token for a name, in whichever of the two layers is drawn at this width. */
async function tokenOf(board: Locator, name: RegExp): Promise<Locator> {
  const labelled = board.locator("[data-slot=token]");
  const count = await labelled.count();
  for (let index = 0; index < count; index += 1) {
    const each = labelled.nth(index);
    if (name.test((await each.getAttribute("aria-label")) ?? "")) {
      const id = await each.getAttribute("data-token");
      return board.locator(`[data-token="${id}"]`).filter({ visible: true });
    }
  }
  throw new Error(`no token named ${String(name)}`);
}

/**
 * The board's drawn plane, in the viewport: its padding box, at whatever zoom
 * the canvas has. On a phone the map comes after the order and your card, so
 * it is brought into view first, as a reader scrolls to it.
 */
const planeOf = async (board: Locator) => {
  await board.scrollIntoViewIfNeeded();
  return board.evaluate((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const scale = r.width / el.offsetWidth;
    return {
      x: r.x + el.clientLeft * scale,
      y: r.y + el.clientTop * scale,
      width: el.clientWidth * scale,
    };
  });
};

/**
 * What is on top of the board at a token's middle: its id, and whether a press
 * there is a button's. The canvas's floating panels are set aside for the
 * question, since the board may open under them where they leave it too
 * little room and is panned out from there; the narrow layer takes no pointer,
 * so it is lent one to be hit-tested, as the fog is.
 */
const hitAt = (page: Page, at: { x: number; y: number; width: number; height: number }) =>
  page.evaluate(
    ([x, y]) => {
      const hud = document.querySelector<HTMLElement>("[data-slot=run-hud]");
      const views = [...document.querySelectorAll<HTMLElement>("[data-slot=run-tokens-view]")];
      if (hud !== null) hud.style.visibility = "hidden";
      for (const view of views) view.style.pointerEvents = "auto";
      const under = document.elementFromPoint(x!, y!);
      if (hud !== null) hud.style.visibility = "";
      for (const view of views) view.style.pointerEvents = "";
      return {
        token: under?.closest("[data-token]")?.getAttribute("data-token") ?? null,
        pressable: under?.closest("button, a, input, [role=button]") != null,
      };
    },
    [at.x + at.width / 2, at.y + at.height / 2],
  );

/** The table's answer with something laid over its board. */
const withBoard = (page: Page, over: Record<string, unknown>) =>
  page.route(
    (url) => /\/stub\/campaigns\/[^/]+\/table$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const answer = (await response.json()) as {
        fight: { board: Record<string, unknown> | null } | null;
      };
      await route.fulfill({
        response,
        json:
          answer.fight?.board == null
            ? answer
            : { ...answer, fight: { ...answer.fight, board: { ...answer.fight.board, ...over } } },
      });
    },
  );

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the shared battle map", async ({ app, page }) => {
      await app.open(table);
      const board = page.locator('[data-slot="battle-map"]');
      await expect(board).toBeVisible();
      const canvas = (await page.locator("[data-slot=run-stage]").count()) > 0;
      const strip = page.getByRole("region", { name: "Initiative" });
      const card = page.getByRole("region", { name: "Your character" });
      const banner = page.getByRole("status", { name: "Turn" });

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the turn banner and your card are drawn, and say whose turn", async () => {
        await expect.soft(banner).toContainText("Brannoc Duskharrow's turn");
        await expect.soft(card).toContainText("Your turn");
        const at = { banner: await box(banner), card: await box(card) };
        expect
          .soft(at.banner.y + at.banner.height, "the banner over the card")
          .toBeLessThan(at.card.y + 1);
        const spill = await banner.evaluate((el) =>
          [...el.querySelectorAll("span")].some((span) => {
            const inner = span.getBoundingClientRect();
            const outer = el.getBoundingClientRect();
            return inner.left < outer.left - 0.5 || inner.right > outer.right + 0.5;
          }),
        );
        expect.soft(spill, "no line runs out of the banner").toBe(false);
      });

      if (canvas) {
        await test.step("the canvas is the viewport, and the window does not scroll", async () => {
          const stage = await box(page.locator("[data-slot=run-stage]"));
          expect
            .soft(stage.y + stage.height, "the stage ends in the viewport")
            .toBeLessThanOrEqual(HEIGHT + 0.5);
          const scrolls = await page.evaluate(
            () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
          );
          expect.soft(scrolls, "the window has nothing to scroll").toBe(false);
        });

        await test.step("the strip across the top, your card right, your rolls left", async () => {
          const stage = await box(page.locator("[data-slot=run-stage]"));
          const at = {
            strip: await box(strip),
            panel: await box(page.locator("[data-slot=run-hud-panel]")),
            rolls: await box(page.getByRole("region", { name: "Your rolls" })),
          };
          expect.soft(at.strip.y - stage.y, "the strip at the stage's top").toBeLessThan(16);
          expect
            .soft(at.panel.y, "the panel under the strip")
            .toBeGreaterThan(at.strip.y + at.strip.height - 0.5);
          expect
            .soft(stage.x + stage.width - (at.panel.x + at.panel.width), "panel right")
            .toBeLessThan(16);
          expect.soft(at.rolls.x - stage.x, "rolls left").toBeLessThan(16);
          expect
            .soft(at.rolls.x + at.rolls.width, "rolls clear of the panel")
            .toBeLessThan(at.panel.x);
          // The board opens on the free area between the panels: your own
          // token is there to press, under none of them.
          const you = await box(await tokenOf(board, BRANNOC));
          const clear = await page.evaluate(
            ([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-token]") != null,
            [you.x + you.width / 2, you.y + you.height / 2],
          );
          expect.soft(clear, "your token is under no panel").toBe(true);
          const cardBox = await box(card);
          expect
            .soft(cardBox.x, "your card is in the panel")
            .toBeGreaterThanOrEqual(at.panel.x - 0.5);
        });
      } else {
        await test.step("the strip heads the page, the map a card at the picture's shape", async () => {
          const mapCard = page.getByRole("region", { name: "Battle map" });
          const at = { strip: await box(strip), card: await box(mapCard), board: await box(board) };
          expect
            .soft(at.card.y, "the map under the strip")
            .toBeGreaterThan(at.strip.y + at.strip.height);
          expect.soft(at.board.width, "the board fills its card").toBeCloseTo(at.card.width - 2, 0);
          expect
            .soft(at.board.height, "at the picture's shape")
            .toBeCloseTo((at.board.width * PICTURE.height) / PICTURE.width, 0);
        });
      }

      await test.step("the picture is drawn under the grid", async () => {
        const picture = board.locator("img").first();
        await expect.soft(picture).toHaveCSS("opacity", "1");
        const drawn = await picture.evaluate((img: HTMLImageElement) => img.naturalWidth);
        expect.soft(drawn, "picture loaded").toBeGreaterThan(0);
      });

      await test.step("each token is on its square and on top", async () => {
        const plane = await planeOf(board);
        const square = plane.width / COLUMNS;
        const tokens = [
          { name: BRANNOC, column: 5, row: 4, mine: true },
          { name: HAG, column: 11, row: 6, mine: false },
        ];
        for (const token of tokens) {
          const found = await tokenOf(board, token.name);
          const place = await box(found);
          expect.soft(place.width, "a square wide").toBeCloseTo(square, 0);
          expect.soft(place.x, "its column").toBeCloseTo(plane.x + token.column * square, 0);
          expect.soft(place.y, "its row").toBeCloseTo(plane.y + token.row * square, 0);
          const hit = await hitAt(page, place);
          expect
            .soft(hit.token, "the token is what is there")
            .toBe(await found.getAttribute("data-token"));
          // On the canvas a token selects; in the grid the board is a picture.
          expect.soft(hit.pressable, "a press on it is the token's").toBe(canvas);
        }
      });
    });

    test("fog on the shared map", async ({ app, page }) => {
      // The DM fogged Brannoc's square and the one beside it: the table still
      // sends his own token there, and nothing else.
      await withBoard(page, {
        fog: [
          { column: 5, row: 4 },
          { column: 6, row: 4 },
        ],
      });
      await app.open(table);
      const board = page.locator('[data-slot="battle-map"]');
      const fog = board.locator('[data-slot="fog"]').filter({ visible: true }).first();
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
        const plane = await planeOf(board);
        const square = plane.width / COLUMNS;
        const covered = await box(path);
        expect.soft(covered.x, "from Brannoc's column").toBeCloseTo(plane.x + 5 * square, 0);
        expect.soft(covered.y, "on his row").toBeCloseTo(plane.y + 4 * square, 0);
        expect.soft(covered.width, "two squares wide").toBeCloseTo(square * 2, 0);
        const beside = await fog.evaluate(
          (el: SVGElement, [x, y]) => {
            el.style.pointerEvents = "auto";
            const under = document.elementFromPoint(x!, y!);
            el.style.pointerEvents = "";
            return under?.closest("[data-slot=fog]") != null
              ? "fog"
              : (under?.tagName ?? "nothing");
          },
          [plane.x + 6.5 * square, plane.y + 4.5 * square],
        );
        expect.soft(beside, "the fog is on top of the picture").toBe("fog");
      });

      await test.step("the player's own token stands over it", async () => {
        const you = await tokenOf(board, BRANNOC);
        const hit = await hitAt(page, await box(you));
        expect.soft(hit.token, "his token is on top").toBe(await you.getAttribute("data-token"));
      });
    });

    test("an area the DM pinned on the shared map", async ({ app, page }) => {
      // The DM has pinned a 10 ft sphere on Brannoc's square.
      await withBoard(page, { area: { shape: "sphere", feet: 10, origin: { column: 5, row: 4 } } });
      await app.open(table);
      const board = page.locator('[data-slot="battle-map"]');
      const area = board.getByRole("img", { name: "Pinned: a 10 ft sphere" });
      await expect(area).toBeVisible();

      await test.step("the area lies on its squares, under the tokens", async () => {
        const plane = await planeOf(board);
        const square = plane.width / COLUMNS;
        const edge = await box(area.locator('[data-square="7,4"]'));
        expect.soft(Math.abs(edge.width - square), "a square wide").toBeLessThan(1.5);
        expect.soft(edge.x + edge.width / 2, "its column").toBeCloseTo(plane.x + 7.5 * square, 0);
        expect.soft(edge.y + edge.height / 2, "its row").toBeCloseTo(plane.y + 4.5 * square, 0);
        const you = await tokenOf(board, BRANNOC);
        const hit = await hitAt(page, await box(you));
        expect
          .soft(hit.token, "the token is on top of the area")
          .toBe(await you.getAttribute("data-token"));
        await expect.soft(page.getByText(/caught/)).toHaveCount(0);
      });
    });

    test("moving your own token on your turn", async ({ app, page }) => {
      const moves: Array<{ readonly path: string; readonly body: unknown }> = [];
      await page.route(
        (url) =>
          /\/stub\/campaigns\/[^/]+\/table\/runs\/[^/]+\/combatants\/[^/]+\/move$/.test(
            url.pathname,
          ),
        async (route) => {
          moves.push({
            path: new URL(route.request().url()).pathname,
            body: route.request().postDataJSON() as unknown,
          });
          await route.fulfill({ status: 204, body: "" });
        },
      );
      await app.open(table);
      const board = page.locator('[data-slot="battle-map"]');
      await expect(board).toBeVisible();
      test.skip(
        (await page.locator("[data-slot=run-stage]").count()) === 0,
        "the board takes a drag only on the canvas",
      );

      const plane = await planeOf(board);
      const square = plane.width / COLUMNS;
      const drag = async (
        from: { x: number; y: number; width: number; height: number },
        by: number,
      ) => {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        for (let step = 1; step <= 4; step += 1) {
          await page.mouse.move(
            from.x + from.width / 2 + (by * square * step) / 4,
            from.y + from.height / 2,
          );
        }
        await page.mouse.up();
      };

      await test.step("your range is drawn from your square", async () => {
        await expect
          .soft(page.locator("[data-slot=token-range]").filter({ visible: true }))
          .toHaveCount(1);
      });

      await test.step("a drag of your token moves it, through the table", async () => {
        const you = await tokenOf(board, BRANNOC);
        await drag(await box(you), 2);
        await expect.poll(() => moves.length).toBe(1);
        expect.soft(moves[0]!.body).toMatchObject({ position: { column: 7, row: 4 } });
      });

      await test.step("a drag of the hag moves nobody", async () => {
        const hag = await tokenOf(board, HAG);
        await drag(await box(hag), -2);
        await page.waitForTimeout(300);
        expect.soft(moves).toHaveLength(1);
      });
    });
  });
}
