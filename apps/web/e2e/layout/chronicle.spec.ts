import type { Locator, Page } from "@playwright/test";
import { chronicleNightId } from "../../src/test/ids";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Chronicle (`chronicle/ChronicleScreen.tsx`), at every width: the nights
 * beside *Jump to* and the Spotlight or alone once the columns would stack,
 * *Jump to* with no scroller of its own, the Spotlight's rows in one line, a
 * jump and a `?session=` link landing a night under the chrome, a closed
 * night's summary clamped to two lines, every night expanded still scrolling
 * with the window, an opened night's encounter chips wrapping on a phone
 * without clipping, and the story so far at the head of the nights, growing
 * the page rather than scrolling inside itself. All of it is layout, which
 * jsdom does not compute.
 *
 * Read over the creator scenario's two nights (`chronicle.fixtures.tsx`):
 * session 11 holds a written summary longer than two lines at any width, a kept
 * beat, a shared one, and a conversation and a fight; session 12 is still open
 * with no summary, so the composer card for writing it up sits under the
 * story so far and above the nights, over the seated party. Session 12 starts the one
 * act, and session 11 is older than it.
 */

const chronicle = screens.find((screen) => screen.name === "chronicle")!;
const playerChronicle = screens.find((screen) => screen.name === "player-chronicle")!;

/**
 * The aside is drawn at `@4xl` of the shell's `main` (896px of content), just
 * above where the Overview's two columns — 560 + 24 + 300 — would wrap.
 */
const ASIDE_FROM = 896;

/**
 * The story so far heads the nights, as wide as they are, and grows the page:
 * nothing in it scrolls or clips, whatever the width.
 */
const storyHeadsTheNights = async (page: Page, newest: Locator) => {
  const story = page.getByRole("region", { name: "The story so far" });
  await expect(story.getByText("Previously, to open session 12")).toBeVisible();
  const head = await box(story);
  const nights = await box(newest);
  expect.soft(head.x, "story left").toBeCloseTo(nights.x, 0);
  expect.soft(head.width, "story width").toBeCloseTo(nights.width, 0);
  expect.soft(head.y + head.height, "story above the nights").toBeLessThanOrEqual(nights.y);
  const inner = await story.evaluate((el) =>
    [el, ...el.querySelectorAll("*")].map((node) => {
      const style = getComputedStyle(node);
      // Only a box that hides its overflow can clip what it holds.
      const hides = style.overflowX !== "visible" || style.overflowY !== "visible";
      return {
        overflow: style.overflowY,
        clipped:
          hides &&
          (node.scrollHeight > node.clientHeight + 0.5 ||
            node.scrollWidth > node.clientWidth + 0.5),
        tag: `${node.tagName}.${node.className}`,
      };
    }),
  );
  for (const node of inner) {
    expect
      .soft(node.overflow === "auto" || node.overflow === "scroll", `${node.tag} scrolls`)
      .toBe(false);
    expect.soft(node.clipped, `${node.tag} clips`).toBe(false);
  }
};

/** Where a night's card rests once the window stops moving, and where it could be. */
const restingPlace = async (page: Page, card: Locator) => {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const from = window.scrollY;
        setTimeout(() => resolve(window.scrollY === from), 150);
      }),
  );
  return card.evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    chrome: Number.parseFloat(getComputedStyle(el).getPropertyValue("--chrome-height")),
    scrollY: window.scrollY,
    end: document.documentElement.scrollHeight - window.innerHeight,
  }));
};

/** Pinned under the chrome, or as far up as the page can scroll it. */
const broughtUp = (at: Awaited<ReturnType<typeof restingPlace>>) =>
  Math.abs(at.top - at.chrome) <= 1 || at.scrollY >= at.end - 1;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("chronicle columns, jump to and chips", async ({ app, page }) => {
      await app.open(chronicle);
      const newest = page.locator("#session-12");
      const older = page.locator("#session-11");
      await expect(newest).toBeVisible();
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const main = page.locator("main");
      const room = await main.evaluate((el) => {
        const style = getComputedStyle(el);
        return (
          el.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight)
        );
      });
      const beside = room >= ASIDE_FROM;
      const aside = page.locator("main aside");
      const composer = page.getByRole("region", { name: "Write up session 12" });
      const index = page.getByRole("list", { name: "Jump to" });

      await test.step(
        beside ? "the nights and Jump to side by side" : "the nights alone, no Jump to",
        async () => {
          const nights = await box(newest);
          // The main column opens with the composer card, above the nights.
          const first = await box(composer);
          expect.soft(first.y, "composer above the nights").toBeLessThan(nights.y);
          expect.soft(first.width, "composer as wide as the nights").toBeCloseTo(nights.width, 0);
          if (beside) {
            await expect(index).toBeVisible();
            const side = await box(aside);
            // The main column opens on the story so far, above the composer.
            const head = await box(page.getByRole("region", { name: "The story so far" }));
            expect.soft(head.y, "story above the composer").toBeLessThan(first.y);
            expect.soft(side.y, "aside top").toBeCloseTo(head.y, 0);
            expect.soft(side.x, "aside left").toBeGreaterThan(nights.x + nights.width);
            expect.soft(side.width, "aside width").toBeLessThanOrEqual(340.5);
            expect.soft(nights.width, "nights width").toBeGreaterThanOrEqual(559.5);
          } else {
            // Stacked, it would sit after every night it indexes.
            await expect(aside).toBeHidden();
            const frame = await box(newest.locator(".."));
            expect.soft(nights.width, "nights width").toBeCloseTo(frame.width, 0);
          }
        },
      );

      await test.step("a closed night clamps its summary to two lines", async () => {
        // `line-clamp` is a computed height and a hidden overflow; jsdom has
        // the class and neither of those.
        const preview = await older.locator('[data-slot="night-preview"]').evaluate((el) => ({
          height: el.getBoundingClientRect().height,
          line: Number.parseFloat(getComputedStyle(el).lineHeight),
          clamped: el.scrollHeight > el.clientHeight + 0.5,
        }));
        expect.soft(preview.height, "preview height").toBeLessThanOrEqual(2 * preview.line + 1);
        expect.soft(preview.height, "preview height").toBeGreaterThan(1.5 * preview.line);
        expect.soft(preview.clamped, "the summary runs past two lines").toBe(true);
      });

      await test.step("the composer's controls wrap inside its card", async () => {
        const fit = await composer.evaluate((card) => {
          const edge = card.getBoundingClientRect();
          return [...card.querySelectorAll("button, input, textarea")].map((control) => {
            const r = control.getBoundingClientRect();
            return {
              name: control.textContent ?? control.tagName,
              left: r.left,
              right: r.right,
              edge: { left: edge.left, right: edge.right },
              clipped: control.scrollWidth > control.clientWidth + 0.5,
            };
          });
        });
        expect(fit.length).toBeGreaterThan(0);
        for (const control of fit) {
          expect.soft(control.clipped, `${control.name} clips`).toBe(false);
          expect
            .soft(control.left, `${control.name} left`)
            .toBeGreaterThanOrEqual(control.edge.left);
          expect
            .soft(control.right, `${control.name} right`)
            .toBeLessThanOrEqual(control.edge.right + 0.5);
        }
      });

      await test.step("the story so far heads the nights and grows the page", async () => {
        await storyHeadsTheNights(page, newest);
      });

      await test.step("the header's left edge is the nights'", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        expect.soft(h1.x, "h1 left").toBeCloseTo((await box(newest)).x, 0);
      });

      if (beside) {
        await test.step("Jump to has no scroller of its own", async () => {
          const overflows = await aside.evaluate((el) =>
            [el, ...el.querySelectorAll("*")].map((node) => getComputedStyle(node).overflowY),
          );
          for (const overflow of overflows) {
            expect
              .soft(overflow === "auto" || overflow === "scroll", "an inner scroller")
              .toBe(false);
          }
          const position = await aside.evaluate((el) => getComputedStyle(el).position);
          expect.soft(position, "aside position").not.toBe("sticky");
        });

        await test.step("the Spotlight sits under Jump to, its rows inside it", async () => {
          const counts = page.getByRole("list", { name: "Spotlight" });
          await expect(counts).toBeVisible();
          const card = await box(counts.locator(".."));
          expect.soft(card.y, "spotlight below jump to").toBeGreaterThan((await box(index)).y);
          const rows = await counts.evaluate((list) => {
            const edge = list.getBoundingClientRect();
            return [...list.querySelectorAll("li")].map((row) => {
              const [name, bar, count] = [...row.children].map((el) => el.getBoundingClientRect());
              return {
                inside: row.getBoundingClientRect().right <= edge.right + 0.5,
                bar: bar!.width,
                ordered: name!.right <= bar!.left && bar!.right <= count!.left,
              };
            });
          });
          expect.soft(rows, "four seats").toHaveLength(4);
          for (const row of rows) {
            expect.soft(row.inside, "row inside the card").toBe(true);
            expect.soft(row.ordered, "name, bar, count in a line").toBe(true);
            expect.soft(row.bar, "bar width").toBeGreaterThan(40);
          }
          const hint = page.getByText(/have had the fewest sessions in the spotlight/);
          await expect(hint).toBeVisible();
          const text = await box(hint);
          expect.soft(text.x + text.width, "hint right").toBeLessThanOrEqual(card.x + card.width);
        });

        await test.step("a jump opens the night and lands it under the chrome", async () => {
          await page.evaluate(() => window.scrollTo(0, 0));
          await index.getByRole("button", { name: /Session 11/ }).click();
          await expect(older.getByRole("button", { name: /Session 11/ })).toHaveAttribute(
            "aria-expanded",
            "true",
          );
          await app.settle();
          const at = await restingPlace(page, older);
          expect.soft(broughtUp(at), `night brought up (${JSON.stringify(at)})`).toBe(true);
          expect.soft(at.top, "night top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
        });
      }

      await test.step("an act's heading sits over its nights, its menu inside the frame", async () => {
        const act = page.getByRole("region", { name: "Act II · The salt road" });
        const heading = await box(act.getByRole("heading", { level: 2 }));
        const menu = await box(
          act.getByRole("button", { name: "Act actions: Act II · The salt road" }),
        );
        const nights = await box(newest);
        expect
          .soft(heading.y + heading.height, "heading above its night")
          .toBeLessThanOrEqual(nights.y + 0.5);
        expect.soft(heading.x, "heading left").toBeGreaterThanOrEqual(nights.x - 0.5);
        expect
          .soft(menu.x + menu.width, "menu right")
          .toBeLessThanOrEqual(nights.x + nights.width + 0.5);
        // Session 11 is older than every act, so nothing heads it.
        expect
          .soft(await page.getByRole("region").filter({ has: older }).count(), "older night's act")
          .toBe(0);
      });

      await test.step("an opened night's chips wrap inside it without clipping", async () => {
        const header = older.getByRole("button", { name: /Session 11/ });
        if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
        const chips = older.locator('[data-slot="encounter-chip"]');
        await expect(chips).toHaveCount(2);
        const fit = await older.evaluate((card) => {
          const edge = card.getBoundingClientRect();
          return [...card.querySelectorAll('[data-slot="encounter-chip"]')].map((chip) => {
            const r = chip.getBoundingClientRect();
            return {
              right: r.right,
              edge: edge.right,
              clipped:
                chip.scrollWidth > chip.clientWidth + 0.5 ||
                chip.scrollHeight > chip.clientHeight + 0.5,
            };
          });
        });
        for (const chip of fit) {
          expect.soft(chip.clipped, "a chip clips its name").toBe(false);
          expect.soft(chip.right, "chip right").toBeLessThanOrEqual(chip.edge + 0.5);
        }
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("starting an act inside a night fits the night", async () => {
        await older.getByRole("button", { name: "Start a new act here" }).click();
        const field = await box(older.getByLabel("Act title"));
        const start = await box(older.getByRole("button", { name: "Start act" }));
        const card = await box(older);
        expect.soft(field.x + field.width, "field right").toBeLessThanOrEqual(card.x + card.width);
        expect.soft(start.x + start.width, "button right").toBeLessThanOrEqual(card.x + card.width);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("expand all opens every night, and the page still scrolls with the window", async ({
      app,
      page,
    }) => {
      await app.open(chronicle);
      await page.getByRole("button", { name: "Expand all" }).click();
      for (const n of [12, 11]) {
        await expect(
          page
            .locator(`#session-${String(n)}`)
            .getByRole("button", { name: `Session ${String(n)}` }),
        ).toHaveAttribute("aria-expanded", "true");
      }
      await expect(page.getByRole("button", { name: "Collapse all" })).toBeVisible();
      await app.settle();

      // Every night open is the longest this page gets. It grows the document;
      // nothing inside it becomes a scroller of its own.
      const scrollers = await page.locator("main").evaluate((main) =>
        [...main.querySelectorAll("*")]
          .filter((el) => {
            const overflow = getComputedStyle(el).overflowY;
            return (
              (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight
            );
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect.soft(scrollers, "inner scrollers").toEqual([]);

      const scrolled = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return {
          y: window.scrollY,
          end: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      expect.soft(scrolled.end, "the document is taller than the window").toBeGreaterThan(0);
      expect.soft(scrolled.y, "the window scrolled to the end").toBeCloseTo(scrolled.end, 0);
      const { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
    });

    test("a ?session= link opens that night under the chrome", async ({ app, page }) => {
      // From cold, as the Encounters preview's *View log* arrives.
      await app.open({ ...chronicle, path: `${chronicle.path}?session=${chronicleNightId}` });
      const older = page.locator("#session-11");
      await expect(older.getByRole("button", { name: /Session 11/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(
        page.locator("#session-12").getByRole("button", { name: /Session 12/ }),
      ).toHaveAttribute("aria-expanded", "false");
      await app.settle();
      const at = await restingPlace(page, older);
      expect.soft(broughtUp(at), `night brought up (${JSON.stringify(at)})`).toBe(true);
      expect.soft(at.top, "night top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
    });

    test("the player's chronicle draws the same nights", async ({ app, page }) => {
      await app.open(playerChronicle);
      await storyHeadsTheNights(page, page.locator("#session-12"));
      const story = page.getByRole("region", { name: "The story so far" });
      await expect(story.getByRole("button")).toHaveCount(0);
      await expect(story.getByRole("switch")).toHaveCount(0);
      const older = page.locator("#session-11");
      await older.getByRole("button", { name: /Session 11/ }).click();
      const chips = older.locator('[data-slot="encounter-chip"]');
      await expect(chips).toHaveCount(2);
      await expect(older.getByText("DM only")).toHaveCount(0);
      await expect(older.locator("a")).toHaveCount(0);
      const { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
    });
  });
}
