import type { Page } from "@playwright/test";
import { runId } from "../../src/test/ids";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The runner (`run/RunScreen.tsx`) at every width. From `@3xl` of `main` (1440
 * and 1024 here) it is a canvas (`run/RunStage.tsx`): the board fills the stage
 * under the header and pans and zooms (`run/BoardCanvas.tsx`), the panels float
 * over it on the `hud` rung — the initiative strip (`run/InitiativeStrip.tsx`)
 * across the top, the columns under it — and the window does not scroll.
 * Below it (760 and 390) it is the window-scrolling grid of named areas
 * (`run/RunLayout.tsx`) with the board to look at, the strip heading it, which
 * re-deals the cards rather than leaving a blank beside any. Then the selected
 * card's controls inside its edges, the *Rolls* dock taking a click, a long
 * order scrolling sideways inside the strip, every chip in reach of the
 * keyboard, and, on the canvas, a token dragged onto its square with its ruler
 * on the way and an attack picked on the board. All of it is layout, stacking,
 * cursors and hit-testing, which jsdom does not compute.
 *
 * Read over the creator scenario's fight (`run/run.fixtures.tsx`'s
 * `liveFight`): Brannoc standing on a 24 × 16 board with no picture, and a
 * Goblin Boss nobody has put down yet. The fight rolling initiative is the same
 * fight with its phase and numbers taken back, answered in the page
 * (`rolling`), so the *Roll initiative* panel (`run/InitiativePhase.tsx`) is
 * measured in the strip's place: top left on the canvas, a column in the grid.
 */

const run = screens.find((screen) => screen.name === "run")!;

/** The strip's chip (`run/InitiativeStrip.tsx`): the drawing's 52px tall, and wide enough for a name. */
const CHIP = { height: 52, minWidth: 152 };
/** The inspector's width (`--aside-w`): the grid's side columns, and the canvas's panels. */
const ASIDE = 340;
/** The grid's gap, `gap-4`. */
const GAP = 16;
/** How far the canvas's panels float in from the stage's edge, `inset-3`. */
const INSET = 12;
/** The smallest thing a pointer is asked to hit (WCAG 2.5.8). */
const TARGET = 24;
/** `main` from `@3xl` (48rem): the canvas, and the board takes clicks (`run/RunTokens.tsx`). */
const CANVAS = new Set<number>([1440, 1024]);
/** `main`'s bottom padding, `py-page`: the stage ends this far above the viewport's bottom. */
const PAGE = 32;

type Box = Awaited<ReturnType<typeof box>>;
const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;

/** What a point on the screen lands on: the nearest named thing above it. */
const landsOn = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const found = document.elementFromPoint(px!, py!);
      const named = found?.closest("button, [data-slot^=run-hud], [data-slot=board-canvas]");
      return named?.getAttribute("aria-label") ?? named?.getAttribute("data-slot") ?? "nothing";
    },
    [x, y],
  );

/** The board's transform, as the canvas holds it: pan and zoom. */
const viewOf = (page: Page) =>
  page.locator('[data-slot="board-canvas-content"]').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      x: parseFloat(style.getPropertyValue("--pan-x")),
      y: parseFloat(style.getPropertyValue("--pan-y")),
      zoom: parseFloat(style.getPropertyValue("--zoom")),
    };
  });

/** The accent as the browser computes it, read off a probe rather than restated. */
const accentColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-accent)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

/**
 * Answer the fight's own reads as if it were still rolling initiative — and the
 * night's list of fights with it on, as the real server would, so the campaign
 * row's press is absent here as it is on any fight it would send you back to.
 */
const rolling = (page: Page) =>
  Promise.all([
    page.route(
      (url) => /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch({
          url: route
            .request()
            .url()
            .replace(/\/runs$/, `/runs/${runId}`),
        });
        const run = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: [{ ...run, phase: "initiative", activeCombatantId: null }],
        });
      },
    ),
    page.route(
      (url) => /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs\/[^/]+$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        const run = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: { ...run, phase: "initiative", activeCombatantId: null },
        });
      },
    ),
    page.route(
      (url) =>
        /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs\/[^/]+\/combatants$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        const rows = (await response.json()) as ReadonlyArray<Record<string, unknown>>;
        await route.fulfill({
          response,
          json: rows.map((row) => ({ ...row, initiative: null, initiativeSetBy: null })),
        });
      },
    ),
  ]);

/**
 * Answer the fight's rows with a long order: the fixture's two, then a dozen
 * more goblins, so the strip has more chips than any width holds.
 */
const crowded = (page: Page) =>
  page.route(
    (url) =>
      /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs\/[^/]+\/combatants$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const rows = (await response.json()) as ReadonlyArray<Record<string, unknown>>;
      const boss = rows[rows.length - 1]!;
      const more = Array.from({ length: 12 }, (_, index) => ({
        ...boss,
        id: `${String(boss.id).slice(0, -4)}${(0xe000 + index).toString(16)}`,
        displayName: `Goblin ${String(index + 1)}`,
        initiative: 10 - index,
        position: null,
      }));
      await route.fulfill({ response, json: [...rows, ...more] });
    },
  );

for (const width of WIDTHS) {
  const canvas = CANVAS.has(width);

  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the fight's layout", async ({ app, page }) => {
      await app.open(run);
      const list = page.getByRole("region", { name: "Initiative", exact: true });
      const map = page.getByRole("region", { name: "Battle map" });
      const card = page.getByRole("region", { name: "Selected combatant" });
      const dice = page.getByRole("region", { name: "Rolls", exact: true });
      await expect(map).toBeVisible();
      await expect(card).toContainText("Brannoc");

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      if (canvas) {
        const stage = page.locator('[data-slot="run-stage"]');
        const tools = page.locator('[data-slot="run-hud-tools"]');
        await expect(page.locator('[data-slot="run-layout"]')).toHaveCount(0);

        await test.step("the stage fills the viewport under the header, and the window keeps still", async () => {
          const at = await box(stage);
          const header = await box(page.locator('main [data-slot="page-heading"]'));
          const mainBox = await box(page.locator("main"));
          const pad = await page
            .locator("main")
            .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
          expect.soft(at.y, "stage under the header").toBeGreaterThan(bottom(header));
          expect.soft(bottom(at), "stage to the page's bottom edge").toBeCloseTo(HEIGHT - PAGE, 0);
          expect.soft(at.x, "stage x").toBeCloseTo(mainBox.x + pad, 0);
          expect.soft(right(at), "stage right").toBeCloseTo(right(mainBox) - pad, 0);
          const scroll = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: document.documentElement.clientHeight,
          }));
          expect
            .soft(scroll.scrollHeight, "the document is the viewport's height")
            .toBeLessThanOrEqual(scroll.clientHeight);
          // The board's canvas is the whole stage, behind everything.
          const board = await box(page.locator('[data-slot="board-canvas"]'));
          expect.soft(board.width, "canvas width").toBeCloseTo(at.width - 2, 0);
          expect.soft(board.height, "canvas height").toBeCloseTo(at.height - 2, 0);
        });

        await test.step("the panels float in their homes, on the HUD rung", async () => {
          const at = {
            stage: await box(stage),
            list: await box(list),
            left: await box(page.locator('[data-slot="run-hud-left"]')),
            card: await box(card),
            dice: await box(dice),
            rolls: await box(page.locator('[data-slot="run-hud-rolls"]')),
            tools: await box(tools),
          };
          // Initiative, across the top.
          expect.soft(at.list.x - at.stage.x, "strip from the left").toBeCloseTo(INSET + 1, 0);
          expect.soft(at.list.y - at.stage.y, "strip from the top").toBeCloseTo(INSET + 1, 0);
          expect
            .soft(right(at.stage) - right(at.list), "strip from the right")
            .toBeCloseTo(INSET + 1, 0);
          // The selected creature, top right, under the strip.
          expect
            .soft(right(at.stage) - right(at.card), "card from the right")
            .toBeCloseTo(INSET + 1, 0);
          expect.soft(at.card.y - bottom(at.list), "card under the strip").toBeCloseTo(INSET, 0);
          expect.soft(at.card.width, "card width").toBeCloseTo(ASIDE, 0);
          // The rolls, bottom left, in the column under the strip.
          expect.soft(at.dice.x - at.stage.x, "dice from the left").toBeCloseTo(INSET + 1, 0);
          expect.soft(at.dice.width, "dice width").toBeCloseTo(ASIDE, 0);
          expect
            .soft(bottom(at.stage) - bottom(at.rolls), "rolls from the bottom")
            .toBeCloseTo(INSET + 1, 0);
          expect.soft(at.rolls.y, "rolls below the strip").toBeGreaterThanOrEqual(bottom(at.list));
          // The tools, bottom centre, between the two columns.
          expect
            .soft(at.tools.x, "tools after the left column")
            .toBeGreaterThanOrEqual(right(at.left) + INSET - 0.5);
          expect
            .soft(right(at.tools), "tools before the card")
            .toBeLessThanOrEqual(at.card.x - INSET + 0.5);
          expect
            .soft(bottom(at.stage) - bottom(at.tools), "tools from the bottom")
            .toBeCloseTo(INSET + 1, 0);
          await expect.soft(page.locator('[data-slot="run-hud"]')).toHaveCSS("z-index", "5");
          // Over the board: a point inside each panel lands in the panel.
          for (const [name, part] of [
            ["list", at.list],
            ["card", at.card],
            ["the Rolls dock", at.dice],
          ] as const) {
            expect
              .soft(await landsOn(page, part.x + part.width / 2, part.y + 8), `${name} is on top`)
              .toMatch(/^run-hud-|^Roll|^Brannoc|^Goblin|^rolls-toggle$/);
          }
          // And the chrome is over the HUD: the stack is z-chrome (10).
          await expect.soft(page.locator(".sticky.top-0").first()).toHaveCSS("z-index", "10");
        });

        await test.step("the board's switches and zoom stay inside the dock", async () => {
          const edge = await box(tools);
          for (const name of ["Grid", "Hide from players", "Zoom out", "Zoom in", "Fit"]) {
            const control = await box(tools.getByRole("button", { name, exact: true }));
            expect.soft(control.x, `${name} left`).toBeGreaterThanOrEqual(edge.x - 0.5);
            expect.soft(right(control), `${name} right`).toBeLessThanOrEqual(right(edge) + 0.5);
          }
          const shareMap = page.getByRole("switch", { name: "Share map" });
          await expect.soft(shareMap).toBeVisible();
          await expect.soft(shareMap).toHaveAttribute("aria-disabled", "true");
        });
      } else {
        const layout = page.locator('[data-slot="run-layout"]');
        await expect(page.locator('[data-slot="run-stage"]')).toHaveCount(0);
        const whole = await box(layout);
        const at = {
          list: await box(list),
          map: await box(map),
          card: await box(card),
          dice: await box(dice),
        };

        if (width === 390) {
          await test.step("one column, in the order it is used", async () => {
            for (const [name, part] of Object.entries(at)) {
              expect.soft(part.x, `${name} x`).toBeCloseTo(whole.x, 0);
              expect.soft(part.width, `${name} width`).toBeCloseTo(whole.width, 0);
            }
            expect.soft(at.list.y < at.card.y, "initiative before the card").toBe(true);
            expect.soft(at.card.y < at.map.y, "the card before the map").toBe(true);
            expect.soft(at.map.y < at.dice.y, "the map before the dice").toBe(true);
          });
        } else {
          await test.step("the strip across the top, the map under it, then the rest beside the card", async () => {
            for (const [name, part] of [
              ["strip", at.list],
              ["map", at.map],
            ] as const) {
              expect.soft(part.x, `${name} x`).toBeCloseTo(whole.x, 0);
              expect.soft(part.width, `${name} width`).toBeCloseTo(whole.width, 0);
            }
            expect.soft(at.list.y, "strip at the top").toBeCloseTo(whole.y, 0);
            expect.soft(at.map.y - bottom(at.list), "strip → map").toBeCloseTo(GAP, 0);
            expect.soft(at.card.y - bottom(at.map), "map → card").toBeCloseTo(GAP, 0);
            // Nothing blank beside the card: the rest fills to it, and the card
            // to the layout's edge.
            expect.soft(at.dice.y, "dice beside the card").toBeCloseTo(at.card.y, 0);
            expect.soft(at.dice.x, "dice x").toBeCloseTo(whole.x, 0);
            expect.soft(at.card.x - right(at.dice), "dice → card").toBeCloseTo(GAP, 0);
            expect.soft(at.card.width, "aside width").toBeCloseTo(ASIDE, 0);
            expect.soft(right(at.card), "card's right edge").toBeCloseTo(right(whole), 0);
          });
        }

        await test.step("the map's toggles stay inside its card, and Share map waits for Share", async () => {
          const edge = await box(map);
          for (const name of ["Grid", "Hide from players"]) {
            const toggle = await box(map.getByRole("button", { name, exact: true }));
            expect.soft(toggle.x, `${name} left`).toBeGreaterThanOrEqual(edge.x - 0.5);
            expect
              .soft(toggle.x + toggle.width, `${name} right`)
              .toBeLessThanOrEqual(edge.x + edge.width + 0.5);
          }
          // The fixture fight is not shared, so its map cannot be yet.
          const shareMap = page.getByRole("switch", { name: "Share map" });
          await expect.soft(shareMap).toBeVisible();
          await expect.soft(shareMap).toHaveAttribute("aria-disabled", "true");
        });
      }

      await test.step("the header is the drawn card, with the round beside the title", async () => {
        const header = page.locator('main [data-slot="page-heading"]');
        await expect.soft(header).toHaveCSS("border-top-width", "3px");
        const title = await box(header.locator("h1"));
        const badge = await box(header.getByText("Round 1", { exact: true }));
        expect.soft(badge.x, "badge after the title").toBeGreaterThan(title.x + title.width);
        // Centred on the title's line box, which the display face's descender
        // pads below the glyphs by a pixel or so.
        expect
          .soft(
            Math.abs(badge.y + badge.height / 2 - (title.y + title.height / 2)),
            "badge on the title's line",
          )
          .toBeLessThanOrEqual(2);
        // Next turn is the one peach, and no key stands in for it.
        await expect
          .soft(header.getByRole("button", { name: "Next turn" }))
          .toHaveClass(/bg-accent/);
      });

      await test.step("the strip's chips are the drawing's, inside it and on top", async () => {
        const edge = await box(list);
        const order = list.getByRole("list", { name: "Initiative order" });
        const chips = order.getByRole("button");
        await expect.soft(chips).toHaveCount(2);
        // A phone holds one chip and a bit: the rest are scrolled along the
        // order, so what is checked against the edges is what is in view.
        const view = await box(order);
        expect.soft(view.x, "order left").toBeGreaterThanOrEqual(edge.x - 0.5);
        expect.soft(right(view), "order right").toBeLessThanOrEqual(right(edge) + 0.5);
        for (const chip of await chips.all()) {
          const at = await box(chip);
          const name = (await chip.getAttribute("aria-label")) ?? "chip";
          expect.soft(at.height, `${name} height`).toBeCloseTo(CHIP.height, 0);
          expect.soft(at.width, `${name} width`).toBeGreaterThanOrEqual(CHIP.minWidth - 0.5);
          const centre = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
          if (centre.x > right(view)) continue;
          // A press in the middle of a chip in view lands on it, over the board.
          expect.soft(await landsOn(page, centre.x, centre.y), `${name} on top`).toBe(name);
        }
        // Whoever is up wears the accent edge; the trailing controls stay inside
        // the strip and are targets a pointer can hit.
        await expect
          .soft(order.getByRole("button", { name: /^Brannoc,/ }))
          .toHaveCSS("border-top-color", await accentColour(page));
        for (const name of ["Add combatant", "More about the order"]) {
          const control = await box(list.getByRole("button", { name, exact: true }));
          expect.soft(control.x, `${name} left`).toBeGreaterThanOrEqual(edge.x - 0.5);
          expect.soft(right(control), `${name} right`).toBeLessThanOrEqual(right(edge) + 0.5);
          expect.soft(control.width, `${name} width`).toBeGreaterThanOrEqual(TARGET);
          expect.soft(control.height, `${name} height`).toBeGreaterThanOrEqual(TARGET);
        }
        // Nothing in the order hangs out of the strip's own box.
        expect
          .soft(bottom(await box(order)), "order inside the strip")
          .toBeLessThanOrEqual(bottom(edge) + 0.5);
      });

      await test.step("the selected card's controls stay inside it", async () => {
        await page
          .getByRole("list", { name: "Initiative order" })
          .getByRole("button", { name: /^Goblin Boss,/ })
          .click();
        await expect(card).toContainText("Goblin Boss");
        const edge = await box(card);
        const controls = await card.locator("button, input").evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
              left: r.left,
              right: r.right,
            };
          }),
        );
        for (const control of controls) {
          expect.soft(control.left, `${control.name} left`).toBeGreaterThanOrEqual(edge.x - 0.5);
          expect
            .soft(control.right, `${control.name} right`)
            .toBeLessThanOrEqual(edge.x + edge.width + 0.5);
        }
      });

      await test.step("the panel's menu opens on top of everything, and its items take the click", async () => {
        await card.getByRole("button", { name: "More for Goblin Boss" }).click();
        const item = page.getByRole("menuitem", { name: "Follow the turn" });
        await expect(item).toBeVisible();
        const at = await box(item);
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x!, y!)?.closest("[role=menuitem]")?.textContent,
          [at.x + at.width / 2, at.y + at.height / 2],
        );
        expect.soft(hit, "the menu item is what a click there lands on").toBe("Follow the turn");
        await page.keyboard.press("Escape");
        await expect(item).toBeHidden();
      });

      await test.step("a stat on the card rolls into the Rolls dock", async () => {
        // The whole block is folded under the Actions until it is asked for.
        await card.getByRole("button", { name: "Stat block" }).click();
        const dex = card.getByRole("button", { name: "Roll DEX check, 1d20+2" });
        await dex.scrollIntoViewIfNeeded();
        const target = await box(dex);
        const hit = await page.evaluate(
          ([x, y]) =>
            document.elementFromPoint(x!, y!)?.closest("button")?.getAttribute("aria-label"),
          [target.x + target.width / 2, target.y + target.height / 2],
        );
        expect
          .soft(hit, "the DEX tile is what a click there lands on")
          .toBe("Roll DEX check, 1d20+2");
        await dex.click();
        await expect(dice.getByRole("status", { name: "Latest roll" })).toContainText(
          "Goblin Boss · DEX",
        );
        // On the canvas the panel scrolled itself to reach it; the window did not move.
        if (canvas) expect.soft(await page.evaluate(() => window.scrollY), "window scroll").toBe(0);
      });

      if (canvas) {
        await test.step("a token is a target a pointer can hit, dressed as drawn", async () => {
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          const at = await box(token);
          expect.soft(at.width, "token width").toBeGreaterThanOrEqual(TARGET);
          expect.soft(at.height, "token height").toBeGreaterThanOrEqual(TARGET);
          expect
            .soft(
              await landsOn(page, at.x + at.width / 2, at.y + at.height / 2),
              "the token is on top",
            )
            .toMatch(/^Brannoc, column/);
          // He is up and followed: his name and hit points are drawn under him,
          // inside the board, scaled with his square.
          const name = await box(token.locator('[data-slot="token-name"]'));
          expect.soft(name.width, "name drawn").toBeGreaterThan(0);
          expect.soft(name.y, "name under the token").toBeGreaterThan(at.y + at.height * 0.9);
          const hp = await box(token.locator('[data-slot="hp-bar"]'));
          expect.soft(hp.width, "hit points drawn").toBeGreaterThan(at.width * 0.5);
          expect.soft(hp.y, "hit points under the disc").toBeGreaterThan(at.y + at.height * 0.9);
          // His sheet says a speed and it is his turn, so selected, his range is tinted.
          await token.click();
          await expect(card).toContainText("Brannoc");
          await expect
            .soft(map.locator('[data-slot="run-tokens"] [data-slot="range-square"]').first())
            .toBeVisible();
        });

        await test.step("a dragged token lands on its square, on top, with the ruler on the way", async () => {
          // The server answers a move with the square it was sent.
          await page.route(
            (url) => url.pathname.endsWith("/move"),
            async (route) => {
              const response = await route.fetch();
              const row = (await response.json()) as Record<string, unknown>;
              const { position } = route.request().postDataJSON() as { position: unknown };
              await route.fulfill({ response, json: { ...row, position } });
            },
          );
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          const at = await box(token);
          const centre = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
          // Three squares to his right, which nobody stands on and no panel covers.
          const target = { x: centre.x + at.width * 3, y: centre.y };
          expect
            .soft(await landsOn(page, target.x, target.y), "the square is clear")
            .toBe("board-canvas");
          const view = await viewOf(page);

          await page.mouse.move(centre.x, centre.y);
          await page.mouse.down();
          await page.mouse.move(centre.x + at.width, centre.y, { steps: 4 });
          await page.mouse.move(target.x, target.y, { steps: 6 });
          const reading = map.locator('[data-slot="ruler-reading"]');
          // He is up: three squares, against what his speed leaves.
          await expect.soft(reading).toHaveText(/^15 ft · \d+ left$/);
          const label = await box(reading);
          expect.soft(label.width, "the reading is drawn").toBeGreaterThan(0);
          expect.soft(label.x, "beside the far end").toBeGreaterThan(target.x);
          const moved = page.waitForRequest(
            (request) => request.method() === "POST" && request.url().endsWith("/move"),
          );
          await page.mouse.up();
          const body = (await moved).postDataJSON() as { position: unknown };
          expect.soft(body.position, "the square it was dropped on").toEqual({ column: 8, row: 4 });
          await expect(token).toHaveAccessibleName(/^Brannoc, column 9, row 5/);
          await expect.soft(reading).toHaveCount(0);
          expect.soft(await viewOf(page), "the drag panned nothing").toEqual(view);

          await page.waitForTimeout(400);
          const landed = await box(token);
          expect.soft(landed.x, "on the square").toBeCloseTo(at.x + at.width * 3, 0);
          expect.soft(landed.y, "same row").toBeCloseTo(at.y, 0);
          expect
            .soft(
              await landsOn(page, landed.x + landed.width / 2, landed.y + landed.height / 2),
              "the token is on top",
            )
            .toMatch(/^Brannoc, column 9/);
        });

        await test.step("the arrow keys still walk a focused token", async () => {
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          await token.focus();
          const moved = page.waitForRequest(
            (request) => request.method() === "POST" && request.url().endsWith("/move"),
          );
          await page.keyboard.press("ArrowLeft");
          const body = (await moved).postDataJSON() as { position: unknown };
          expect.soft(body.position, "a square to the left").toEqual({ column: 7, row: 4 });
          await expect(token).toHaveAccessibleName(/^Brannoc, column 8, row 5/);
        });

        await test.step("a drag on the board pans it, and moves nobody", async () => {
          const board = map.locator('[data-slot="battle-map"]');
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          await page.waitForTimeout(400);
          const before = await box(token);
          const boardBefore = await box(board);
          const view = await viewOf(page);
          let moves = 0;
          page.on("request", (request) => {
            if (request.method() === "POST" && request.url().endsWith("/move")) moves++;
          });
          // From a clear square two below him, 60 across and 30 down.
          const from = { x: before.x + before.width / 2, y: before.y + before.height * 2.5 };
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(from.x + 30, from.y + 15, { steps: 3 });
          await page.mouse.move(from.x + 60, from.y + 30, { steps: 3 });
          await page.mouse.up();
          const after = await viewOf(page);
          expect.soft(after.x - view.x, "panned across").toBeCloseTo(60, 0);
          expect.soft(after.y - view.y, "panned down").toBeCloseTo(30, 0);
          expect.soft(after.zoom, "same zoom").toBe(view.zoom);
          const moved = await box(board);
          expect.soft(moved.x - boardBefore.x, "the board went with the drag").toBeCloseTo(60, 0);
          await page.waitForTimeout(200);
          expect.soft(moves, "no move was sent").toBe(0);
        });

        await test.step("the wheel pans, ⌘/Ctrl and the wheel zoom about the pointer, and the page stays put", async () => {
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          const before = await box(token);
          const view = await viewOf(page);
          await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
          await page.mouse.wheel(0, 40);
          const panned = await viewOf(page);
          expect.soft(view.y - panned.y, "scrolled the board up").toBeCloseTo(40, 0);
          expect.soft(await page.evaluate(() => window.scrollY), "window scroll").toBe(0);

          const centre = await box(token);
          const point = { x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 };
          await page.mouse.move(point.x, point.y);
          await page.keyboard.down("Control");
          await page.mouse.wheel(0, -100);
          await page.keyboard.up("Control");
          const zoomed = await box(token);
          expect.soft(zoomed.width, "zoomed in").toBeGreaterThan(centre.width * 1.3);
          // The token under the pointer stayed under it.
          expect.soft(zoomed.x + zoomed.width / 2, "pointer x kept").toBeCloseTo(point.x, 0);
          expect.soft(zoomed.y + zoomed.height / 2, "pointer y kept").toBeCloseTo(point.y, 0);
          expect.soft(await page.evaluate(() => window.scrollY), "window scroll").toBe(0);
        });

        await test.step("the dock zooms in and out, and Fit puts the whole board between the panels", async () => {
          const tools = page.locator('[data-slot="run-hud-tools"]');
          const view = await viewOf(page);
          await tools.getByRole("button", { name: "Zoom in", exact: true }).click();
          expect
            .soft((await viewOf(page)).zoom, "zoomed in a step")
            .toBeCloseTo(view.zoom * 1.25, 4);
          await tools.getByRole("button", { name: "Zoom out", exact: true }).click();
          expect.soft((await viewOf(page)).zoom, "and back").toBeCloseTo(view.zoom, 4);

          await tools.getByRole("button", { name: "Fit", exact: true }).click();
          const board = await box(map.locator('[data-slot="battle-map"]'));
          const list = await box(page.locator('[data-slot="run-hud-left"]'));
          const panel = await box(page.locator('[data-slot="run-hud-panel"]'));
          const strip = await box(page.locator('[data-slot="run-hud-strip"]'));
          const dock = await box(tools);
          expect.soft(board.x, "after the left column").toBeGreaterThanOrEqual(right(list) - 0.5);
          expect.soft(right(board), "before the panel").toBeLessThanOrEqual(panel.x + 0.5);
          expect.soft(board.y, "under the strip").toBeGreaterThanOrEqual(bottom(strip) - 0.5);
          expect.soft(bottom(board), "above the dock").toBeLessThanOrEqual(dock.y + 0.5);
        });

        await test.step("a panel scrolls inside itself, and the window does not", async () => {
          const panel = page.locator('[data-slot="run-hud-panel"]');
          const at = await box(panel);
          const overflows = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
          if (!overflows) return;
          await page.mouse.move(at.x + at.width / 2, at.y + at.height - 20);
          await page.mouse.wheel(0, 300);
          await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
          expect.soft(await page.evaluate(() => window.scrollY), "window scroll").toBe(0);
        });
      } else {
        await test.step("the board is to look at: nothing on it takes a pointer", async () => {
          await expect.soft(map.locator('[data-slot="run-tokens"]')).toBeHidden();
          await expect.soft(map.getByRole("button", { name: /column/ })).toHaveCount(0);
          await expect.soft(map.getByRole("group", { name: "Not on the board" })).toBeHidden();
          const view = map.locator('[data-slot="run-tokens-view"] > span').first();
          await view.scrollIntoViewIfNeeded();
          await expect(view).toBeVisible();
          const at = await box(view);
          const hit = await page.evaluate(
            ([x, y]) => {
              const found = document.elementFromPoint(x!, y!);
              return found?.closest("button, a, input, [role=button]") === null
                ? "nothing"
                : found?.tagName;
            },
            [at.x + at.width / 2, at.y + at.height / 2],
          );
          expect.soft(hit, "a tap on a token presses nothing").toBe("nothing");
        });
      }
    });

    test("a long order scrolls sideways inside the strip", async ({ app, page }) => {
      await crowded(page);
      await app.open(run);
      const strip = page.getByRole("region", { name: "Initiative", exact: true });
      const order = strip.getByRole("list", { name: "Initiative order" });
      const chips = order.getByRole("button");
      await expect(chips).toHaveCount(14);

      await test.step("the order scrolls, the page does not", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
        const overflow = await order.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect.soft(overflow, "the order is wider than its strip").toBeGreaterThan(0);
        const edge = await box(strip);
        const main = await box(page.locator("main"));
        expect.soft(right(edge), "strip inside main").toBeLessThanOrEqual(right(main) + 0.5);
        // The scrollbar is hidden, as drawn; the chips keep the drawing's size.
        await expect.soft(order).toHaveCSS("scrollbar-width", "none");
        const last = await box(chips.last());
        expect.soft(last.width, "last chip width").toBeGreaterThanOrEqual(CHIP.minWidth - 0.5);
      });

      await test.step("a crowded strip still shows each name, not a letter or two", async () => {
        // The chip's floor holds eight characters or so before the ellipsis:
        // "Goblin 12" all but whole, never "G…".
        for (const chip of await chips.all()) {
          const label = (await chip.getAttribute("aria-label")) ?? "chip";
          const name = chip.locator("[data-slot=strip-name]");
          const { shown, length } = await name.evaluate((el) => {
            const length = el.textContent?.length ?? 0;
            const glyph = el.scrollWidth / Math.max(length, 1);
            return { shown: el.clientWidth / glyph, length };
          });
          expect
            .soft(shown, `${label} characters shown`)
            .toBeGreaterThanOrEqual(Math.min(8, length) - 0.5);
        }
      });

      await test.step("the keyboard reaches every chip, and the strip brings it into view", async () => {
        await chips.first().focus();
        for (let step = 1; step < 14; step++) await page.keyboard.press("Tab");
        await expect(chips.last()).toBeFocused();
        const view = await box(order);
        const last = await box(chips.last());
        expect
          .soft(last.x, "last chip scrolled in from the left")
          .toBeGreaterThanOrEqual(view.x - 0.5);
        expect.soft(right(last), "last chip scrolled in").toBeLessThanOrEqual(right(view) + 0.5);
        expect
          .soft(await order.evaluate((el) => el.scrollLeft), "scrolled along")
          .toBeGreaterThan(0);
        // Enter on a chip selects it.
        await page.keyboard.press("Enter");
        await expect(chips.last()).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("region", { name: "Selected combatant" })).toContainText(
          "Goblin 12",
        );
      });

      // On the canvas no page scrolls under the pointer, so the wheel is the
      // strip's; in the grid it stays the page's, as everywhere else.
      if (canvas) {
        await test.step("a wheel over the strip walks it along, and the page stays put", async () => {
          await order.evaluate((el) => (el.scrollLeft = 0));
          const view = await box(order);
          await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
          await page.mouse.wheel(0, 200);
          await expect.poll(() => order.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
          expect.soft(await page.evaluate(() => window.scrollY), "window scroll").toBe(0);
        });
      }
    });

    if (canvas) {
      test("an attack picked on the board", async ({ app, page }) => {
        // Brannoc is up with a Longsword on his sheet, and the Goblin Boss
        // stands two squares to his right, where no panel covers him.
        await page.route(
          (url) => /\/stub\/campaigns\/[^/]+\/party$/.test(url.pathname),
          async (route) => {
            const response = await route.fetch();
            const seats = (await response.json()) as ReadonlyArray<{
              readonly character?: { readonly sheet: object } | null;
            }>;
            await route.fulfill({
              response,
              json: seats.map((seat) =>
                seat.character === null || seat.character === undefined
                  ? seat
                  : {
                      ...seat,
                      character: {
                        ...seat.character,
                        sheet: {
                          ...seat.character.sheet,
                          actions: [
                            {
                              id: "atk:longsword",
                              name: "Longsword",
                              cost: "action",
                              hit: "+7",
                              dice: "1d8+4",
                              damageType: "Slashing",
                              source: "weapon",
                            },
                          ],
                        },
                      },
                    },
              ),
            });
          },
        );
        await page.route(
          (url) =>
            /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs\/[^/]+\/combatants$/.test(
              url.pathname,
            ),
          async (route) => {
            const response = await route.fetch();
            const rows = (await response.json()) as ReadonlyArray<Record<string, unknown>>;
            await route.fulfill({
              response,
              json: rows.map((row) =>
                row["displayName"] === "Goblin Boss"
                  ? { ...row, position: { column: 7, row: 4 } }
                  : row,
              ),
            });
          },
        );
        let writes = 0;
        page.on("request", (request) => {
          if (request.method() !== "GET" && request.url().includes("/stub/")) writes++;
        });
        await app.open(run);
        const card = page.getByRole("region", { name: "Selected combatant" });
        const map = page.getByRole("region", { name: "Battle map" });
        const attack = card.getByRole("button", { name: "Attack with Longsword" });
        const goblin = map.getByRole("button", { name: /^Goblin Boss, column/ });
        await expect(attack).toBeVisible();
        await expect(goblin).toBeVisible();

        await test.step("Attack asks for a target over the board, under a crosshair", async () => {
          await attack.click();
          const banner = page.locator('[data-slot="run-target-banner"]');
          await expect(banner).toContainText("Pick a target for Longsword");
          const at = await box(banner);
          const left = await box(page.locator('[data-slot="run-hud-left"]'));
          const panel = await box(page.locator('[data-slot="run-hud-panel"]'));
          expect.soft(at.x, "banner after the left column").toBeGreaterThanOrEqual(right(left));
          expect.soft(right(at), "banner before the panel").toBeLessThanOrEqual(panel.x);
          expect
            .soft(await landsOn(page, at.x + 24, at.y + at.height / 2), "the banner is on top")
            .toBe("run-hud-banner");
          for (const [name, locator] of [
            ["the target's token", goblin],
            ["the board", page.locator('[data-slot="board-canvas"]')],
          ] as const) {
            await expect.soft(locator, `${name}'s cursor`).toHaveCSS("cursor", "crosshair");
          }
          // Still the one peach: Attack is outline.
          const primaries = await page
            .locator('[data-slot="button"].bg-accent')
            .filter({ visible: true })
            .allTextContents();
          expect.soft(primaries, "primaries").toEqual(["Next turn"]);
        });

        await test.step("Esc puts the pick away", async () => {
          await page.keyboard.press("Escape");
          await expect(page.locator('[data-slot="run-target-banner"]')).toHaveCount(0);
          await attack.click();
          await expect(page.locator('[data-slot="run-target-banner"]')).toHaveCount(1);
        });

        await test.step("a click on the token resolves it on the attacker's card, and sends nothing", async () => {
          const at = await box(goblin);
          expect
            .soft(await landsOn(page, at.x + at.width / 2, at.y + at.height / 2), "token on top")
            .toMatch(/^Goblin Boss, column/);
          await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
          await expect(page.locator('[data-slot="run-target-banner"]')).toHaveCount(0);
          const result = card.getByRole("region", {
            name: "Attack result, Longsword → Goblin Boss",
          });
          await expect(result).toBeVisible();
          await expect(result).toContainText(/Critical hit|Hit|Natural 1|Miss/);
          await expect(result).toContainText(/^.*d20 \d+ \+7 = \d+ vs AC 17/);
          await expect(card).toContainText("Brannoc");
          // The card's controls sit inside it.
          const edge = await box(card);
          const inside = await box(result);
          expect.soft(inside.x, "result left").toBeGreaterThanOrEqual(edge.x);
          expect.soft(right(inside), "result right").toBeLessThanOrEqual(right(edge) + 0.5);
          await expect(
            page
              .getByRole("region", { name: "Rolls", exact: true })
              .getByRole("status", { name: "Latest roll" }),
          ).toContainText("Brannoc · Longsword → Goblin Boss");
          expect.soft(writes, "nothing was written").toBe(0);
        });
      });
    }

    test("rolling initiative", async ({ app, page }) => {
      await rolling(page);
      await app.open(run);
      const panel = page.getByRole("region", { name: "Roll initiative" });
      const map = page.getByRole("region", { name: "Battle map" });
      const card = page.getByRole("region", { name: "Selected combatant" });
      await expect(panel).toBeVisible();
      await expect(page.getByRole("list", { name: "Initiative order" })).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the panel stands where the list does", async () => {
        const at = { panel: await box(panel), map: await box(map), card: await box(card) };
        if (canvas) {
          const stage = await box(page.locator('[data-slot="run-stage"]'));
          await expect
            .soft(page.locator('[data-slot="run-hud-rolling"]'))
            .toContainText("Roll initiative");
          await expect.soft(page.locator('[data-slot="run-hud-strip"]')).toHaveCount(0);
          expect.soft(at.panel.width, "panel width").toBeCloseTo(ASIDE, 0);
          expect.soft(at.panel.x - stage.x, "panel from the left").toBeCloseTo(INSET + 1, 0);
          expect.soft(at.panel.y - stage.y, "panel from the top").toBeCloseTo(INSET + 1, 0);
        } else {
          const whole = await box(page.locator('[data-slot="run-layout"]'));
          if (width === 390) {
            expect.soft(at.panel.width, "panel width").toBeCloseTo(whole.width, 0);
            expect.soft(at.panel.y < at.card.y, "the panel before the card").toBe(true);
            expect.soft(at.card.y < at.map.y, "the card before the map").toBe(true);
          } else {
            expect.soft(at.panel.x, "panel x").toBeCloseTo(whole.x, 0);
            expect
              .soft(at.card.x - (at.panel.x + at.panel.width), "panel → card")
              .toBeCloseTo(GAP, 0);
          }
        }
      });

      await test.step("every box and button inside the panel, a total fitting its box", async () => {
        const edge = await box(panel);
        // The switch's own `<input>` is Base UI's visually hidden one, not a control.
        const controls = await panel
          .locator('button, input[data-slot="input"]')
          .evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return {
                name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
                input: el instanceof HTMLInputElement,
                left: r.left,
                right: r.right,
                width: r.width,
                clientWidth: el.clientWidth,
                scrollWidth: el.scrollWidth,
              };
            }),
          );
        expect.soft(controls.filter((c) => c.input).length, "a box per combatant").toBe(2);
        for (const control of controls) {
          expect.soft(control.left, `${control.name} left`).toBeGreaterThanOrEqual(edge.x - 0.5);
          expect
            .soft(control.right, `${control.name} right`)
            .toBeLessThanOrEqual(edge.x + edge.width + 0.5);
          expect.soft(control.width, `${control.name} has a width`).toBeGreaterThan(0);
        }
        // A three-character total ("-12", "100") is read whole in its box.
        const box0 = panel.getByLabel("Brannoc initiative");
        await box0.fill("-12");
        const fits = await box0.evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect.soft(fits, "-12 fits the box").toBe(true);
        await box0.fill("");
      });

      await test.step("one peach primary: Start round 1, across the panel", async () => {
        const primaries = await page
          .locator('[data-slot="button"].bg-accent')
          .filter({ visible: true })
          .allTextContents();
        expect.soft(primaries, "primaries").toEqual(["Start round 1"]);
        const start = await box(panel.getByRole("button", { name: "Start round 1" }));
        const edge = await box(panel);
        expect.soft(start.width, "Start round 1 spans the panel").toBeGreaterThan(edge.width - 48);
      });
    });
  });
}

/**
 * A scene that is not a fight (`run/SceneRunner.tsx`), over the creator's wire
 * with the run played as each kind (`test/scenarios.ts`): two columns from
 * `@3xl` — the scene's cards beside the aside, which ends at the layout's edge
 * with nothing blank beside either — and below it one column in the order the
 * DM uses it, the scene, *Make a check*, then the log. The redesign's flex wrap
 * leaves a 380px aside with a blank beside it at 760; this re-deals instead.
 */
const SCENES = [
  { screen: "run-social", lead: "The conversation", checks: true },
  { screen: "run-challenge", lead: "The challenge", checks: true },
  { screen: "run-hazard", lead: "The hazard", checks: false },
] as const;

for (const width of WIDTHS) {
  for (const scene of SCENES) {
    test.describe(`${width}px ${scene.screen}`, () => {
      test.use({ viewport: { width, height: HEIGHT } });

      test("the scene's layout", async ({ app, page }) => {
        await app.open(screens.find((entry) => entry.name === scene.screen)!);
        const layout = page.locator('[data-slot="scene-layout"]');
        const lead = page.getByRole("region", { name: scene.lead });
        const dice = page.getByRole("region", { name: "Dice", exact: true });
        await expect(lead).toBeVisible();

        await test.step("nothing scrolls sideways", async () => {
          const { scrollWidth, clientWidth } = await app.widths();
          expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
        });

        const whole = await box(layout);
        type Box = Awaited<ReturnType<typeof box>>;
        const at: {
          lead: Box;
          dice: Box;
          check?: Box;
          log?: Box;
          running?: Box;
        } = {
          lead: await box(lead),
          dice: await box(dice),
          ...(scene.checks
            ? {
                check: await box(page.getByRole("region", { name: "Make a check" })),
                log: await box(page.getByRole("region", { name: "Checks so far" })),
              }
            : { running: await box(page.getByRole("region", { name: "Running it" })) }),
        };
        // The aside's first card: *Make a check*, or a hazard's *Running it*.
        const aside = at.check ?? at.running!;

        if (width >= 1024) {
          await test.step("the scene beside the aside, both to the layout's edges", async () => {
            expect.soft(at.lead.x, "scene x").toBeCloseTo(whole.x, 0);
            expect.soft(aside.x - (at.lead.x + at.lead.width), "scene → aside").toBeCloseTo(GAP, 0);
            expect.soft(aside.width, "aside width").toBeCloseTo(ASIDE, 0);
            expect
              .soft(aside.x + aside.width, "aside's right edge")
              .toBeCloseTo(whole.x + whole.width, 0);
            // Both columns start at the top of the layout.
            expect.soft(aside.y, "aside starts at the top").toBeCloseTo(whole.y, 0);
            if (at.log !== undefined) {
              expect.soft(at.log.x, "the log under the scene").toBeCloseTo(at.lead.x, 0);
            }
          });
        } else {
          await test.step("one column, in the order it is used", async () => {
            for (const [name, part] of Object.entries(at)) {
              expect.soft(part.x, `${name} x`).toBeCloseTo(whole.x, 0);
              expect.soft(part.width, `${name} width`).toBeCloseTo(whole.width, 0);
            }
            if (at.check !== undefined && at.log !== undefined) {
              expect.soft(at.lead.y < at.check.y, "the scene before the check").toBe(true);
              expect.soft(at.check.y < at.log.y, "the check before the log").toBe(true);
              expect.soft(at.log.y < at.dice.y, "the log before the dice").toBe(true);
            } else {
              expect.soft(at.lead.y < at.dice.y, "the scene before the dice").toBe(true);
            }
          });
        }

        await test.step("the header names the kind, and has no Next turn", async () => {
          const header = page.locator('main [data-slot="page-heading"]');
          await expect.soft(header.getByRole("button", { name: /Next turn/ })).toHaveCount(0);
          await expect.soft(header.locator('[data-slot="badge"]')).toHaveCount(1);
        });
      });
    });
  }
}
