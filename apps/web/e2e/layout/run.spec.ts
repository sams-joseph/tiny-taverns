import type { Page } from "@playwright/test";
import { runId } from "../../src/test/ids";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The runner (`run/RunScreen.tsx`, laid out by `run/RunLayout.tsx`) at every
 * width: which cards stand beside which, and that nothing is left blank beside
 * the initiative list — the defect the redesign's flex wrap has at 1024 and
 * 760, which a grid of named areas re-deals instead. Then the selected card's
 * controls inside its edges and the DM's dice taking a click. All of it is
 * layout and hit-testing, which jsdom does not compute.
 *
 * Read over the creator scenario's fight (`run/run.fixtures.tsx`'s
 * `liveFight`): Brannoc standing on a 24 × 16 board with no picture, and a
 * Goblin Boss nobody has put down yet. The fight rolling initiative is the same
 * fight with its phase and numbers taken back, answered in the page
 * (`rolling`), so the *Roll initiative* panel (`run/InitiativePhase.tsx`) is
 * measured in the list's place.
 */

const run = screens.find((screen) => screen.name === "run")!;

/** The inspector's width (`--aside-w`), which both side columns take from `@7xl`. */
const ASIDE = 340;
/** The layout's gap, `gap-4`. */
const GAP = 16;
/** The smallest thing a pointer is asked to hit (WCAG 2.5.8). */
const TARGET = 24;
/** `main` from `@3xl` (48rem) is where the board takes clicks (`run/RunTokens.tsx`). */
const MOVABLE = new Set<number>([1440, 1024]);

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

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the fight's layout", async ({ app, page }) => {
      await app.open(run);
      const layout = page.locator('[data-slot="run-layout"]');
      const list = page
        .getByRole("table", { name: "Initiative order" })
        .locator("xpath=ancestor::*[@data-slot='card'][1]");
      const map = page.getByRole("region", { name: "Battle map" });
      const card = page.getByRole("region", { name: "Selected combatant" });
      const dice = page.getByRole("region", { name: "Dice", exact: true });
      await expect(map).toBeVisible();
      await expect(card).toContainText("Brannoc");

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const whole = await box(layout);
      const at = {
        list: await box(list),
        map: await box(map),
        card: await box(card),
        dice: await box(dice),
      };

      if (width === 1440) {
        await test.step("three columns: initiative, the map, the card", async () => {
          expect.soft(at.list.y, "list and map start together").toBeCloseTo(at.map.y, 0);
          expect.soft(at.card.y, "card and map start together").toBeCloseTo(at.map.y, 0);
          expect.soft(at.list.width, "initiative width").toBeCloseTo(ASIDE, 0);
          expect.soft(at.card.width, "card width").toBeCloseTo(ASIDE, 0);
          expect.soft(at.map.x - (at.list.x + at.list.width), "list → map").toBeCloseTo(GAP, 0);
          expect.soft(at.card.x - (at.map.x + at.map.width), "map → card").toBeCloseTo(GAP, 0);
          expect
            .soft(at.card.x + at.card.width, "card's right edge")
            .toBeCloseTo(whole.x + whole.width, 0);
          // The dice sit under the card, in its column.
          expect.soft(at.dice.x, "dice under the card").toBeCloseTo(at.card.x, 0);
          expect.soft(at.dice.y - (at.card.y + at.card.height), "card → dice").toBeCloseTo(GAP, 0);
        });
      } else if (width === 390) {
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
        await test.step("the map across the top, then initiative beside the aside", async () => {
          expect.soft(at.map.x, "map x").toBeCloseTo(whole.x, 0);
          expect.soft(at.map.width, "map width").toBeCloseTo(whole.width, 0);
          expect
            .soft(at.list.y, "list under the map")
            .toBeCloseTo(at.map.y + at.map.height + GAP, 0);
          expect.soft(at.card.y, "card beside the list").toBeCloseTo(at.list.y, 0);
          // Nothing blank beside the list: it fills to the aside, and the aside
          // to the layout's edge.
          expect.soft(at.list.x, "list x").toBeCloseTo(whole.x, 0);
          expect.soft(at.card.x - (at.list.x + at.list.width), "list → card").toBeCloseTo(GAP, 0);
          expect.soft(at.card.width, "aside width").toBeCloseTo(ASIDE, 0);
          expect
            .soft(at.card.x + at.card.width, "card's right edge")
            .toBeCloseTo(whole.x + whole.width, 0);
          expect.soft(at.dice.y - (at.card.y + at.card.height), "card → dice").toBeCloseTo(GAP, 0);
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
      });

      await test.step("the selected card's controls stay inside it", async () => {
        await page.getByRole("row").filter({ hasText: "Goblin Boss" }).click();
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

      await test.step("a stat on the card rolls into the DM's dice", async () => {
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
        await expect(dice.getByRole("list", { name: "Your rolls" })).toContainText(
          "Goblin Boss · DEX",
        );
      });

      if (MOVABLE.has(width)) {
        await test.step("a token is a target a pointer can hit, and a square moves it", async () => {
          const token = map.getByRole("button", { name: /^Brannoc, column/ });
          await token.scrollIntoViewIfNeeded();
          const at = await box(token);
          expect.soft(at.width, "token width").toBeGreaterThanOrEqual(TARGET);
          expect.soft(at.height, "token height").toBeGreaterThanOrEqual(TARGET);
          const hit = await page.evaluate(
            ([x, y]) =>
              document.elementFromPoint(x!, y!)?.closest("button")?.getAttribute("aria-label"),
            [at.x + at.width / 2, at.y + at.height / 2],
          );
          expect.soft(hit, "the token is what a click on it lands on").toMatch(/^Brannoc, column/);
          await token.click();
          await expect(card).toContainText("Brannoc");
          // His sheet says a speed, so the reach is drawn round him.
          await expect
            .soft(map.locator('[data-slot="run-tokens"] [data-slot="token-reach"]'))
            .toBeVisible();

          // Three squares to his right, which nobody stands on.
          const moved = page.waitForRequest(
            (request) => request.method() === "POST" && request.url().endsWith("/move"),
          );
          await page.mouse.click(at.x + at.width * 3.5, at.y + at.height / 2);
          const body = (await moved).postDataJSON() as { position: unknown };
          expect.soft(body.position, "the square clicked").toEqual({ column: 8, row: 4 });
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

    test("rolling initiative", async ({ app, page }) => {
      await rolling(page);
      await app.open(run);
      const layout = page.locator('[data-slot="run-layout"]');
      const panel = page.getByRole("region", { name: "Roll initiative" });
      const map = page.getByRole("region", { name: "Battle map" });
      const card = page.getByRole("region", { name: "Selected combatant" });
      await expect(panel).toBeVisible();
      await expect(page.getByRole("table", { name: "Initiative order" })).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the panel stands where the list does", async () => {
        const whole = await box(layout);
        const at = { panel: await box(panel), map: await box(map), card: await box(card) };
        if (width === 1440) {
          expect.soft(at.panel.width, "panel width").toBeCloseTo(ASIDE, 0);
          expect.soft(at.panel.y, "panel and map start together").toBeCloseTo(at.map.y, 0);
        } else if (width === 390) {
          expect.soft(at.panel.width, "panel width").toBeCloseTo(whole.width, 0);
          expect.soft(at.panel.y < at.card.y, "the panel before the card").toBe(true);
          expect.soft(at.card.y < at.map.y, "the card before the map").toBe(true);
        } else {
          expect.soft(at.panel.x, "panel x").toBeCloseTo(whole.x, 0);
          expect
            .soft(at.card.x - (at.panel.x + at.panel.width), "panel → card")
            .toBeCloseTo(GAP, 0);
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
