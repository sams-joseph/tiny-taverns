import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Party tab (`party/PartyScreen.tsx`) at every width: the card grid's
 * columns, the rows of a card lining up with its neighbours', − and + and
 * inspiration pressing rather than opening the card, the DM's notes wrapping
 * inside the card's foot, *Passives and saves* fitting without a scroller of
 * its own, and *Between them* under it with each answer beside its term. All
 * of it is layout, stacking or hit-testing, which
 * jsdom does not compute.
 *
 * Read over the creator scenario's party (`fullPartySeats`): four seats, one
 * character deleted, one lineage long enough to wrap on a card, a portrait,
 * conditions, temporary hit points, and a hook and a secret on Brannoc's.
 */

const party = screens.find((screen) => screen.name === "party")!;

/** The drawing's column count at each width: `auto-fill` over a 270px floor. */
const COLUMNS: Readonly<Record<(typeof WIDTHS)[number], number>> = {
  1440: 4,
  1024: 3,
  760: 2,
  390: 1,
};

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("party cards and passives", async ({ app, page }) => {
      await app.open(party);
      const cards = page.locator('[data-slot="seat-card"]');
      await expect(cards).toHaveCount(4);
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
            // Each of the card's rows, by where it starts.
            rows: [...el.children].map((row) => row.getBoundingClientRect().top),
          };
        }),
      );

      await test.step(`${String(COLUMNS[width])} columns`, async () => {
        const firstRow = placed.filter((card) => Math.abs(card.y - placed[0]!.y) < 1);
        expect.soft(firstRow.length, "cards in the first row").toBe(COLUMNS[width]);
        for (const card of placed) {
          expect
            .soft(card.width, `${card.name} width`)
            .toBeGreaterThanOrEqual(Math.min(270, width - 64) - 0.5);
        }
      });

      await test.step("a card's rows line up with its neighbours'", async () => {
        const byRow = new Map<number, typeof placed>();
        for (const card of placed) {
          const key = Math.round(card.y);
          byRow.set(key, [...(byRow.get(key) ?? []), card]);
        }
        for (const row of byRow.values()) {
          const [first, ...rest] = row;
          for (const card of rest) {
            // Every row of the card, hit points included, starts where the
            // first card's does, whatever wraps inside either.
            card.rows.forEach((top, index) =>
              expect
                .soft(top, `${card.name} row ${String(index)} against ${first!.name}`)
                .toBeCloseTo(first!.rows[index]!, 0),
            );
            expect.soft(card.height, `${card.name} height`).toBeCloseTo(first!.height, 0);
          }
        }
      });

      await test.step("the header's left edge is the grid's", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        const grid = await box(page.locator('[data-slot="party-grid"]'));
        expect.soft(h1.x, "h1 left").toBeCloseTo(grid.x, 0);
      });

      await test.step("Long rest stands before Invite player, both inside the page", async () => {
        const heading = page.locator('main [data-slot="page-heading"]');
        const rest = await box(heading.getByRole("button", { name: "Long rest" }));
        const invite = await box(heading.getByRole("button", { name: "Invite player" }));
        expect
          .soft(rest.x + rest.width, "Long rest ends before Invite")
          .toBeLessThanOrEqual(invite.x + 0.5);
        expect.soft(rest.y, "the two share a line").toBeCloseTo(invite.y, 0);
        expect.soft(invite.x + invite.width, "Invite inside the page").toBeLessThanOrEqual(width);
      });

      await test.step("− and + are on top of the card's link, and press without opening it", async () => {
        const brannoc = cards.filter({ has: page.getByRole("link", { name: "Brannoc" }) });
        const damage = brannoc.getByRole("button", { name: "Damage Brannoc" });
        const heal = brannoc.getByRole("button", { name: "Heal Brannoc" });
        for (const button of [damage, heal]) {
          await button.scrollIntoViewIfNeeded();
          const hit = await button.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const top = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return top !== null && el.contains(top);
          });
          expect
            .soft(hit, `${await button.getAttribute("aria-label")} is what a press hits`)
            .toBe(true);
        }
        const path = new URL(page.url()).pathname;
        const number = brannoc.locator("section .font-mono").first();
        await expect(number).toHaveText("44 / 52");
        const writes: Array<unknown> = [];
        page.on("request", (request) => {
          if (request.method() === "POST" && request.url().endsWith("/damage"))
            writes.push(request.postDataJSON());
        });
        await damage.click();
        await damage.click();
        await expect(number).toHaveText("42 / 52");
        expect.soft(new URL(page.url()).pathname, "still on the Party tab").toBe(path);
        // One write for the two presses, once the presses pause.
        await expect.poll(() => writes.length).toBe(1);
        expect.soft(writes[0]).toMatchObject({ amount: 2 });
      });

      await test.step("inspiration stands top right, above the link, and presses in place", async () => {
        const brannoc = cards.filter({ has: page.getByRole("link", { name: "Brannoc" }) });
        const toggle = brannoc.getByRole("button", { name: "Inspiration for Brannoc" });
        await toggle.scrollIntoViewIfNeeded();
        const card = await box(brannoc);
        const name = await box(brannoc.getByRole("link", { name: "Brannoc" }));
        const at = await box(toggle);
        // Beside the name, at the card's right edge, not under it.
        expect.soft(at.y, "toggle top").toBeLessThanOrEqual(name.y + name.height);
        expect
          .soft(card.x + card.width - (at.x + at.width), "toggle to right edge")
          .toBeLessThan(32);
        const hit = await toggle.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return top !== null && el.contains(top);
        });
        expect.soft(hit, "the toggle is what a press hits").toBe(true);

        const path = new URL(page.url()).pathname;
        const writes: Array<unknown> = [];
        page.on("request", (request) => {
          if (request.method() === "PATCH") writes.push(request.postDataJSON());
        });
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        expect.soft(new URL(page.url()).pathname, "still on the Party tab").toBe(path);
        await expect.poll(() => writes.length).toBe(1);
        expect.soft(writes[0]).toEqual({ inspiration: true });
      });

      await test.step("the card opens its seat from anywhere on its face", async () => {
        const pell = cards.filter({ has: page.getByRole("link", { name: "Pell" }) });
        await pell.scrollIntoViewIfNeeded();
        const portrait = await box(pell.locator(":scope > div").first());
        const at = { x: portrait.x + portrait.width / 2, y: portrait.y + portrait.height / 2 };
        const target = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.textContent ?? null,
          at,
        );
        expect.soft(target, "the portrait band is the name link's overlay").toBe("Pell");
      });

      await test.step("the DM's notes wrap inside their card, at its foot", async () => {
        const brannoc = cards.filter({ has: page.getByRole("link", { name: "Brannoc" }) });
        const card = await box(brannoc);
        const notes = await box(brannoc.locator(":scope > div").last().locator("p").last());
        expect.soft(notes.x, "notes left").toBeGreaterThanOrEqual(card.x);
        expect.soft(notes.x + notes.width, "notes right").toBeLessThanOrEqual(card.x + card.width);
        expect
          .soft(notes.y + notes.height, "notes bottom")
          .toBeLessThanOrEqual(card.y + card.height);
        // Pell has no notes: his foot is empty and draws no hairline.
        const pell = cards.filter({ has: page.getByRole("link", { name: "Pell" }) });
        await expect(pell.locator(":scope > div").last().locator("p")).toHaveCount(0);
      });

      await test.step("passives and saves fit, with no scroller of their own", async () => {
        const section = page.locator('[data-slot="party-passives"]');
        await section.scrollIntoViewIfNeeded();
        const fit = await section.evaluate((el) => {
          const edge = el.getBoundingClientRect();
          const scrollers = [el, ...el.querySelectorAll("*")].filter((node) => {
            const style = getComputedStyle(node);
            // A visually hidden label is clipped to a pixel by design.
            if (style.clipPath !== "none" || style.clip !== "auto") return false;
            return (
              ["auto", "scroll"].includes(style.overflowX) ||
              ["auto", "scroll"].includes(style.overflowY) ||
              node.scrollWidth > node.clientWidth + 1
            );
          }).length;
          const cells = [...el.querySelectorAll('[role="cell"], [role="rowheader"]')]
            .filter((cell) => cell.textContent !== "")
            .map((cell) => cell.getBoundingClientRect());
          return {
            scrollers,
            outside: cells.filter(
              (rect) => rect.left < edge.left - 0.5 || rect.right > edge.right + 0.5,
            ).length,
            right: edge.right,
            viewport: document.documentElement.clientWidth,
            headerShown: el.querySelector('[role="columnheader"]')?.checkVisibility() ?? false,
          };
        });
        expect.soft(fit.scrollers, "elements in the section that scroll or overflow").toBe(0);
        expect.soft(fit.outside, "figures drawn outside the section").toBe(0);
        expect.soft(fit.right, "section right").toBeLessThanOrEqual(fit.viewport);
        // Wide, the drawn table with its header row; narrow, a block per
        // character with its own labels and no header row.
        expect.soft(fit.headerShown, "the header row is shown").toBe(width >= 1024);
      });

      await test.step("between them sits under the passives, its terms beside their answers", async () => {
        const section = page.locator('[data-slot="party-between"]');
        await section.scrollIntoViewIfNeeded();
        const passives = await box(page.locator('[data-slot="party-passives"]'));
        const between = await box(section);
        expect.soft(between.y, "under the passives").toBeGreaterThan(passives.y + passives.height);
        expect
          .soft(between.width, "the page's width, as the passives are")
          .toBeCloseTo(passives.width, 0);
        const rows = await section.evaluate((el) => {
          const edge = el.getBoundingClientRect();
          return [...el.querySelectorAll("dt")].map((term) => {
            const detail = term.nextElementSibling!.getBoundingClientRect();
            const label = term.getBoundingClientRect();
            return {
              term: term.textContent,
              besideIt: Math.abs(label.top - detail.top) < 1 && detail.left >= label.right,
              inside: detail.right <= edge.right + 0.5 && label.left >= edge.left - 0.5,
              overflows: el.scrollWidth > el.clientWidth + 1,
            };
          });
        });
        expect
          .soft(rows.map((row) => row.term))
          .toEqual(["Languages", "Darkvision", "Slowest speed"]);
        for (const row of rows) {
          expect.soft(row.besideIt, `${row.term ?? ""}'s answer beside it`).toBe(true);
          expect.soft(row.inside, `${row.term ?? ""} inside the card`).toBe(true);
          expect.soft(row.overflows, "the card overflows").toBe(false);
        }
      });
    });
  });
}
