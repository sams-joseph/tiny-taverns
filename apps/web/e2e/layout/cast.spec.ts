import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Cast tab (`cast/CastScreen.tsx`) at every width: the card grid's
 * columns, a row of cards lining up, the header, the filter row and the grid
 * sharing one left edge inside the Overview's centred frame, and each card
 * opening its NPC's drawer from anywhere on its face, the portrait band
 * included; the filter row's search and two pill groups wrapping without
 * touching; and each card's *where* and met lines at its foot. Then the
 * drawer (`cast/NpcDrawer.tsx`): that it covers the whole app, top to bottom,
 * with its scrim over the nav rows; that it is modal — focus inside, Esc
 * closing it, the window not scrolling under it — that its *Tied to* toggles
 * and *Shows up in* chips wrap inside it, that its stats line wraps beside
 * its button, and that its footer fits. Last the NPC page's *Stats* tab
 * (`cast/NpcSheetPanel.tsx`): in the Overview's frame, nothing sideways, its
 * section editors clear of their headings with one opened inside the window,
 * and its quick start's dialog (`cast/NpcQuickStartDialog.tsx`) inside the
 * window with a body that scrolls and a footer that shows; and with no sheet
 * yet, its three starts clear of each other, and *Start from a bestiary NPC*'s
 * dialog over the whole app, its picker and its confirm inside it at every
 * width.
 * All of it is layout, hit-testing or focus across real events, which jsdom
 * does not compute.
 *
 * Read over the creator scenario's `castShelf`: five NPCs, one with Hob's
 * portrait, one Hob is still drawing, one whose role wraps and one with none,
 * with their prep (`castShelfPrep`): every attitude, a long *where*, and one
 * NPC with nothing set.
 */

const cast = screens.find((screen) => screen.name === "cast")!;
const npcStats = screens.find((screen) => screen.name === "npc-stats")!;
const npcStatsBlank = screens.find((screen) => screen.name === "npc-stats-blank")!;

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

      await test.step("the search and the two pill groups wrap without touching", async () => {
        // The search box and the two groups; the search's screen-reader line is none of them.
        const filters = page.locator('[data-slot="cast-filters"]');
        const parts = await filters
          .locator(':scope > :first-child, :scope > [role="group"]')
          .evaluateAll((els) =>
            els.map((el) => {
              const rect = el.getBoundingClientRect();
              return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
            }),
          );
        expect.soft(parts, "search, met pills, attitude pills").toHaveLength(3);
        const grid = await box(page.locator('[data-slot="cast-grid"]'));
        for (const [i, a] of parts.entries()) {
          expect.soft(a.x, `filter part ${String(i)} left`).toBeGreaterThanOrEqual(grid.x - 0.5);
          expect
            .soft(a.x + a.w, `filter part ${String(i)} right`)
            .toBeLessThanOrEqual(grid.x + grid.width + 0.5);
          for (const [j, b] of parts.slice(i + 1).entries()) {
            const apart =
              a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
            expect.soft(apart, `filter part ${String(i)} clear of ${String(i + j + 1)}`).toBe(true);
          }
        }
        // Every pill whole, none wrapped inside itself.
        const pills = await page
          .locator('[data-slot="cast-filters"] [role="group"] button')
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect.soft(pills).toHaveLength(6);
        for (const height of pills) expect.soft(height, "pill height").toBeCloseTo(pills[0]!, 0);
      });

      await test.step("each card's where and met lines sit at its foot", async () => {
        const feet = await cards.evaluateAll((els) =>
          els.map((el) => {
            const lines = el.querySelector('[data-slot="npc-card-lines"]')!.getBoundingClientRect();
            const card = el.getBoundingClientRect();
            return { name: el.querySelector("[data-card-link]")?.textContent ?? "", lines, card };
          }),
        );
        for (const { name, lines, card } of feet) {
          expect
            .soft(lines.bottom, `${name} lines inside the card`)
            .toBeLessThanOrEqual(card.bottom);
          // The card's own bottom padding, whatever the lines hold.
          expect.soft(card.bottom - lines.bottom, `${name} lines at the foot`).toBeLessThan(24);
        }
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
        await expect(page).toHaveURL((url) => url.pathname + url.search === href);
        await expect(page.getByRole("dialog", { name: "Master Hollis" })).toBeVisible();
      });
    });

    test("npc stats", async ({ app, page }) => {
      await app.open(npcStats);
      const panel = page.locator('[data-slot="npc-sheet"]');
      await expect(panel.getByRole("heading", { name: "Level 5 Human Fighter" })).toBeVisible();

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("it sits in the Overview's frame, on the header's left edge", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        const frame = await box(panel);
        expect.soft(frame.x, "panel left").toBeCloseTo(h1.x, 0);
        expect.soft(frame.width, "panel inside the page").toBeLessThanOrEqual(width);
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
        const names = ["Edit stats", "Rebuild from class and level", "Remove"];
        const buttons = await Promise.all(
          names.map((name) => box(panel.getByRole("button", { name }))),
        );
        for (const [i, a] of buttons.entries())
          for (const [j, b] of buttons.entries()) {
            if (j <= i) continue;
            const apart =
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y;
            expect.soft(apart, `${names[i]!} clear of ${names[j]!}`).toBe(true);
          }
      });

      await test.step("the rebuild dialog fits the window, its body scrolls and its footer shows", async () => {
        await panel.getByRole("button", { name: "Rebuild from class and level" }).click();
        const dialog = page.getByRole("dialog", { name: "Rebuild Cazril’s stats" });
        // Prefilled from the sheet: a Fighter, so the class's kit is drawn too.
        await expect(dialog.getByRole("combobox", { name: "Class" })).toContainText("Fighter");
        await expect(dialog.getByRole("group", { name: "Starting kit" })).toBeVisible();
        await app.settle();

        const frame = await box(dialog);
        expect.soft(frame.x, "dialog left").toBeGreaterThanOrEqual(0);
        expect.soft(frame.x + frame.width, "dialog right").toBeLessThanOrEqual(width);
        expect.soft(frame.y, "dialog top").toBeGreaterThanOrEqual(0);
        expect.soft(frame.y + frame.height, "dialog bottom").toBeLessThanOrEqual(HEIGHT);

        const body = dialog.locator('[data-slot="npc-quick-start-body"]');
        const scroll = await body.evaluate((el) => ({
          sideways: el.scrollWidth - el.clientWidth,
          overflowY: getComputedStyle(el).overflowY,
          more: el.scrollHeight > el.clientHeight,
        }));
        expect.soft(scroll.sideways, "the body does not scroll sideways").toBe(0);
        expect.soft(scroll.overflowY, "the body scrolls itself").toBe("auto");
        expect.soft(scroll.more, "six ability rows are more than the body shows").toBe(true);

        const inner = await box(body);
        const controls = await body.locator("input, button, [role=combobox]").evaluateAll((els) =>
          els.flatMap((el) => {
            const rect = el.getBoundingClientRect();
            // Base UI's form-value inputs and a switch's are visually hidden: nothing drawn.
            if (rect.width <= 1 || rect.height <= 1) return [];
            return [
              {
                name: el.getAttribute("aria-label") ?? (el.id || el.textContent) ?? "",
                x: rect.x,
                w: rect.width,
              },
            ];
          }),
        );
        for (const control of controls) {
          expect.soft(control.x, `${control.name} left`).toBeGreaterThanOrEqual(inner.x - 0.5);
          expect
            .soft(control.x + control.w, `${control.name} right`)
            .toBeLessThanOrEqual(inner.x + inner.width + 0.5);
        }

        const rebuild = await box(dialog.getByRole("button", { name: "Rebuild stats" }));
        expect
          .soft(rebuild.y + rebuild.height, "Rebuild stats above the dialog's foot")
          .toBeLessThanOrEqual(frame.y + frame.height);
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null,
          { x: rebuild.x + rebuild.width / 2, y: rebuild.y + rebuild.height / 2 },
        );
        expect.soft(hit, "Rebuild stats is what is under its own centre").toBe("Rebuild stats");
      });

      await test.step("the section editors sit clear of their heading", async () => {
        // The rebuild dialog above is still open, and a modal leaves the page inert.
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const heading = await box(panel.getByRole("heading", { name: "Abilities & skills" }));
        for (const name of ["Edit abilities", "Edit skills"]) {
          const button = await box(panel.getByRole("button", { name }));
          const apart =
            heading.x + heading.width <= button.x ||
            heading.y + heading.height <= button.y ||
            button.y + button.height <= heading.y;
          expect.soft(apart, `${name} clear of its heading`).toBe(true);
        }
      });

      await test.step("an editor opens over the page, inside the window", async () => {
        await panel.getByRole("button", { name: "Edit abilities" }).click();
        const dialog = page.getByRole("dialog", { name: "Abilities" });
        await expect(dialog).toBeVisible();
        const frame = await box(dialog);
        expect.soft(frame.x, "dialog left").toBeGreaterThanOrEqual(0);
        expect.soft(frame.x + frame.width, "dialog right").toBeLessThanOrEqual(width);
        const save = await box(dialog.getByRole("button", { name: "Save abilities" }));
        expect.soft(save.y + save.height, "Save inside the window").toBeLessThanOrEqual(HEIGHT);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      });
    });

    test("npc stats, started from the bestiary", async ({ app, page }) => {
      await app.open(npcStatsBlank);
      const panel = page.locator('[data-slot="npc-sheet"]');
      await expect(panel.getByText("No stats yet")).toBeVisible();

      await test.step("the three starts sit inside the panel, clear of each other", async () => {
        const frame = await box(panel);
        const starts = await Promise.all(
          ["Start from class and level", "Start from a bestiary NPC", "Write one"].map(
            async (name) => [name, await box(panel.getByRole("button", { name }))] as const,
          ),
        );
        for (const [name, part] of starts) {
          expect.soft(part.x, `${name} left`).toBeGreaterThanOrEqual(frame.x - 0.5);
          expect
            .soft(part.x + part.width, `${name} right`)
            .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
        }
        for (const [i, [one, a]] of starts.entries())
          for (const [two, b] of starts.slice(i + 1)) {
            const apart =
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y;
            expect.soft(apart, `${one} clear of ${two}`).toBe(true);
          }
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await panel.getByRole("button", { name: "Start from a bestiary NPC" }).click();
      const dialog = page.getByRole("dialog", { name: "Start Cazril’s stats from the bestiary" });
      await expect(dialog).toBeVisible();
      await app.settle();

      const insideDialog = async (what: string) => {
        const frame = await box(dialog);
        expect.soft(frame.x, "dialog left").toBeGreaterThanOrEqual(0);
        expect.soft(frame.x + frame.width, "dialog right").toBeLessThanOrEqual(width);
        const parts = await dialog
          .locator('button, [data-slot="picker-row"], [data-slot="bestiary-start"]')
          .evaluateAll((els) =>
            els.map((el) => {
              const rect = el.getBoundingClientRect();
              return { name: el.textContent?.slice(0, 24) ?? "", x: rect.x, w: rect.width };
            }),
          );
        expect.soft(parts.length, `${what}: parts drawn`).toBeGreaterThan(0);
        for (const part of parts) {
          expect.soft(part.x, `${what}: ${part.name} left`).toBeGreaterThanOrEqual(frame.x - 0.5);
          expect
            .soft(part.x + part.w, `${what}: ${part.name} right`)
            .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
        }
      };

      await test.step("its scrim covers the nav rows as well as the page", async () => {
        const hit = await page.evaluate(
          () =>
            document.elementFromPoint(2, 2)?.closest("[data-slot]")?.getAttribute("data-slot") ??
            null,
        );
        expect.soft(hit, "what is under the top-left corner").toBe("dialog-overlay");
      });

      await test.step("the picker's rows and buttons stay inside the dialog", async () => {
        await expect(dialog.getByRole("button", { name: "Start from Goblin Boss" })).toBeVisible();
        await insideDialog("picker");
      });

      await test.step("the confirm stays inside it too", async () => {
        await dialog.getByRole("button", { name: "Start from Goblin Boss" }).click();
        await expect(dialog.locator('[data-slot="bestiary-start"]')).toBeVisible();
        await insideDialog("confirm");
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("npc drawer", async ({ app, page }) => {
      await app.open(cast);
      const cards = page.locator('[data-slot="npc-card"]');
      await expect(cards).toHaveCount(5);
      // Scrolled a little first, so a window that moved under the drawer shows.
      await page.evaluate(() => window.scrollTo(0, 40));
      const scrolled = await page.evaluate(() => window.scrollY);

      const hollis = page.getByRole("link", { name: "Master Hollis" });
      await hollis.click();
      const drawer = page.locator('[data-slot="npc-drawer"]');
      await expect(drawer).toBeVisible();
      await app.settle();

      await test.step("it covers the whole app, top to bottom, against the right edge, 480 wide or the whole width", async () => {
        const placed = await drawer.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            viewport: document.documentElement.clientWidth,
          };
        });
        expect.soft(placed.top, "drawer top").toBeCloseTo(0, 0);
        expect.soft(placed.right, "drawer right").toBeCloseTo(placed.viewport, 0);
        expect.soft(placed.bottom, "drawer bottom").toBeCloseTo(HEIGHT, 0);
        expect.soft(placed.width, "drawer width").toBeCloseTo(Math.min(480, placed.viewport), 0);
      });

      await test.step("its scrim covers the nav rows as well as the page", async () => {
        const frame = await box(drawer);
        if (frame.x < 40) return; // The drawer is the width: no scrim shows.
        // The global row's top-left corner, where the app's name sits.
        const hit = await page.evaluate(
          () =>
            document.elementFromPoint(8, 8)?.closest("[data-slot]")?.getAttribute("data-slot") ??
            null,
        );
        expect.soft(hit, "what is under the top-left corner").toBe("sheet-overlay");
      });

      await test.step("its body scrolls inside it, and the footer stays in view", async () => {
        const inner = await drawer.evaluate((el) => {
          const body = el.querySelector(".overflow-y-auto")!;
          const footer = el.querySelector('[data-slot="sheet-footer"]')!.getBoundingClientRect();
          return {
            scrolls: body.scrollHeight > body.clientHeight,
            footerBottom: footer.bottom,
          };
        });
        expect.soft(inner.scrolls, "the fields are taller than the drawer").toBe(true);
        expect.soft(inner.footerBottom, "footer bottom").toBeLessThanOrEqual(HEIGHT + 0.5);
      });

      await test.step("Tied to and Shows up in wrap inside it", async () => {
        const frame = await box(drawer);
        const ties = drawer.getByRole("group", { name: "Tied to" }).getByRole("button");
        await expect(ties).toHaveCount(4);
        const chips = drawer.locator('[data-slot="npc-links"] [data-slot="link-chip"]');
        // Both nights at the table, two encounters and Grusk's note.
        await expect(chips).toHaveCount(5);
        const placed = [
          ...(await ties.evaluateAll((els) =>
            els.map((el) => ({ kind: "tie", ...el.getBoundingClientRect().toJSON() })),
          )),
          ...(await chips.evaluateAll((els) =>
            els.map((el) => ({ kind: "chip", ...el.getBoundingClientRect().toJSON() })),
          )),
        ] as ReadonlyArray<{ kind: string; x: number; width: number; height: number }>;
        for (const part of placed) {
          expect.soft(part.x, `${part.kind} left`).toBeGreaterThanOrEqual(frame.x);
          expect
            .soft(part.x + part.width, `${part.kind} right`)
            .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
          expect.soft(part.height, `${part.kind} height`).toBeCloseTo(30, 0);
        }
        // Every × is a target of at least 24px square.
        for (const remove of await drawer.getByRole("button", { name: /^Unlink / }).all()) {
          const target = await box(remove);
          expect.soft(target.width, "× width").toBeGreaterThanOrEqual(24);
          expect.soft(target.height, "× height").toBeGreaterThanOrEqual(24);
        }
      });

      await test.step("its stats line wraps beside its button, inside it", async () => {
        const frame = await box(drawer);
        const row = drawer.locator('[data-slot="npc-drawer-stats"]');
        await expect(row).toContainText("Level 5 Human Fighter · AC 17 · HP 44 · CR 3");
        const line = await box(row.locator("p"));
        const open = await box(row.getByRole("button", { name: "Open Master Hollis’s stats" }));
        expect.soft(line.x, "line left").toBeGreaterThanOrEqual(frame.x);
        expect.soft(line.x + line.width, "line clear of the button").toBeLessThanOrEqual(open.x);
        expect
          .soft(open.x + open.width, "button right")
          .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
        expect.soft(open.height, "button height").toBeGreaterThanOrEqual(24);
      });

      await test.step("focus is inside it", async () => {
        const inside = await drawer.evaluate((el) => el.contains(document.activeElement));
        expect.soft(inside, "the focused element is in the drawer").toBe(true);
      });

      await test.step("its footer fits, one control beside another", async () => {
        const footer = drawer.locator('[data-slot="sheet-footer"]');
        const frame = await box(drawer);
        const controls = await footer.locator("a, button").evaluateAll((els) =>
          els.map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              name: el.textContent ?? "",
              x: rect.x,
              y: rect.y,
              w: rect.width,
              h: rect.height,
            };
          }),
        );
        expect
          .soft(controls.map((c) => c.name.trim()))
          .toEqual(["Archive", "NPC follow-up", "Rehearse", "Done"]);
        for (const [i, a] of controls.entries()) {
          expect.soft(a.x, `${a.name} left`).toBeGreaterThanOrEqual(frame.x);
          expect
            .soft(a.x + a.w, `${a.name} right`)
            .toBeLessThanOrEqual(frame.x + frame.width + 0.5);
          for (const b of controls.slice(i + 1)) {
            const apart =
              a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
            expect.soft(apart, `${a.name} clear of ${b.name}`).toBe(true);
          }
        }
      });

      await test.step("the window does not scroll under it", async () => {
        // Over the scrim where one is showing, and over the drawer where it is the width.
        const frame = await box(drawer);
        const x = frame.x > 40 ? frame.x / 2 : frame.x + frame.width / 2;
        await page.mouse.move(x, HEIGHT - 100);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(200);
        expect.soft(await page.evaluate(() => window.scrollY), "window scrollY").toBe(scrolled);
      });

      await test.step("Esc closes it, and hands focus back to the card", async () => {
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        await expect(page).toHaveURL((url) => !url.searchParams.has("npc"));
        await expect(hollis).toBeFocused();
      });
    });
  });
}
