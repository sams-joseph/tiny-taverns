import type { Page } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * A downed party member's death saves on the runner's creature panel
 * (`run/CombatantPanel.tsx`), at every width: the block's tint running to the
 * card's edges, its dots and its roll inside them, each dot a target a pointer
 * can hit and on top where it is drawn, and a press reaching the DM's
 * endpoint. Layout and hit-testing, which jsdom does not compute.
 *
 * Read over the creator scenario's fight (`run/run.fixtures.tsx`), with
 * Brannoc — who is up, so the panel follows him — answered in the page at zero
 * hit points with one success and one failure.
 */

const run = screens.find((screen) => screen.name === "run")!;

/** The smallest thing a pointer is asked to hit (WCAG 2.5.8). */
const TARGET = 24;

/** Brannoc down, and every write to his dots answered with what it sent. */
const downed = async (page: Page, sent: Array<Record<string, unknown>>) => {
  await page.route(
    (url) =>
      /\/stub\/campaigns\/[^/]+\/sessions\/[^/]+\/runs\/[^/]+\/combatants$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const rows = (await response.json()) as ReadonlyArray<Record<string, unknown>>;
      await route.fulfill({
        response,
        json: rows.map((row) =>
          row["displayName"] === "Brannoc"
            ? { ...row, hpCurrent: 0, deathSaves: { successes: 1, failures: 1 } }
            : row,
        ),
      });
    },
  );
  await page.route(
    (url) => /\/combatants\/[^/]+\/death-saves$/.test(url.pathname),
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sent.push(body);
      await route.fulfill({ status: 404, json: { _tag: "NotFound", resource: "x", id: "x" } });
    },
  );
};

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("a downed party member's death saves", async ({ app, page }) => {
      const sent: Array<Record<string, unknown>> = [];
      await downed(page, sent);
      await app.open(run);
      const card = page.getByRole("region", { name: "Selected combatant" });
      const block = card.getByRole("region", { name: "Death saves of Brannoc" });
      await expect(block).toBeVisible();
      await block.scrollIntoViewIfNeeded();

      await test.step("the tint runs to the card's edges, and everything in it stays inside", async () => {
        const edge = await box(card);
        const at = await box(block);
        // The card's one-pixel border either side.
        expect.soft(at.x - edge.x, "block from the card's left").toBeCloseTo(1, 0);
        expect
          .soft(edge.x + edge.width - (at.x + at.width), "block from the card's right")
          .toBeCloseTo(1, 0);
        const tint = await block.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect.soft(tint, "a tint, not the card's fill").not.toBe("rgba(0, 0, 0, 0)");
        for (const control of await block.locator("button").all()) {
          const b = await box(control);
          expect.soft(b.x, "control left").toBeGreaterThanOrEqual(at.x - 0.5);
          expect.soft(b.x + b.width, "control right").toBeLessThanOrEqual(at.x + at.width + 0.5);
        }
      });

      await test.step("each dot is a target a pointer can hit, drawn with its fill", async () => {
        const dots = block.getByRole("button", { name: /(Success|Fail) \d of 3/ });
        await expect.soft(dots).toHaveCount(6);
        for (const dot of await dots.all()) {
          const b = await box(dot);
          expect.soft(b.width, "dot width").toBeGreaterThanOrEqual(TARGET);
          expect.soft(b.height, "dot height").toBeGreaterThanOrEqual(TARGET);
          const name = await dot.getAttribute("aria-label");
          const hit = await page.evaluate(
            ([x, y]) =>
              document.elementFromPoint(x!, y!)?.closest("button")?.ariaLabel ?? "nothing",
            [b.x + b.width / 2, b.y + b.height / 2],
          );
          expect.soft(hit, `${name} on top`).toBe(name);
        }
        const fill = (name: string) =>
          block
            .getByRole("button", { name })
            .locator("span")
            .evaluate((el) => getComputedStyle(el).backgroundColor);
        // The first success is pressed and the second is not: two colours.
        expect.soft(await fill("Success 1 of 3")).not.toBe(await fill("Success 2 of 3"));
      });

      await test.step("a press reaches the DM's endpoint with both counts", async () => {
        await block.getByRole("button", { name: "Fail 2 of 3" }).click();
        await expect.poll(() => sent.length).toBe(1);
        expect.soft(sent[0]).toMatchObject({ successes: 1, failures: 2 });
      });
    });
  });
}
