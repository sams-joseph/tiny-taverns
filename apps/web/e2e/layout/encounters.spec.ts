import type { Page } from "@playwright/test";
import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Encounters tab's list and preview (`campaign/EncountersScreen.tsx`), at
 * every width: where the two columns stand, that the header lines up with
 * them, that the creature table fits a phone, and that a row chosen while the
 * columns are stacked brings the preview into view. All of it is layout, which
 * jsdom does not compute.
 *
 * Read over the creator scenario's shelf (`encounterShelf`): an encounter of
 * every kind, two played, and the fight on the table.
 *
 * Then the handles that put *Not yet played* in the DM's order, at the three
 * widths the reorder plan names (a small phone, a tablet, a laptop): a target
 * a thumb can press, names starting at one edge whatever section they are in,
 * a press on a row landing on the row and not its handle, and the keyboard
 * path through the menu handing focus back. Then a pointer dragging a grip:
 * the row waits in place, dimmed, while a drop line in the focus ring's
 * colour marks the gap; dropped, it slides to its new place on the layering
 * scale's `lifted` rung and the motion tokens, and the order the stub was
 * sent survives a reload — under a kind pill too, among the rows drawn. None
 * of the drag library's own stacking (the top layer, `z-index:
 * calc(infinity)`) or timing reaches the page.
 */

const encounters = screens.find((screen) => screen.name === "encounters")!;
const overview = screens.find((screen) => screen.name === "overview")!;

/** Where the preview is once the window stops moving, and where it could be. */
const restingPlace = async (page: Page) => {
  // A smooth scroll is not a Web Animation, so `settle` does not wait for it:
  // wait for the window to stop moving.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const from = window.scrollY;
        setTimeout(() => resolve(window.scrollY === from), 150);
      }),
  );
  return page.locator('[data-slot="encounter-preview"]').evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    chrome: Number.parseFloat(getComputedStyle(el).getPropertyValue("--chrome-height")),
    scrollY: window.scrollY,
    end: document.documentElement.scrollHeight - window.innerHeight,
    stacked:
      el.getBoundingClientRect().top >=
      el.parentElement!.firstElementChild!.getBoundingClientRect().bottom - 1,
  }));
};

/** Stacked, the preview is pinned under the chrome, or as far up as the page can scroll it. */
const broughtUp = (at: Awaited<ReturnType<typeof restingPlace>>) =>
  Math.abs(at.top - at.chrome) <= 1 || at.scrollY >= at.end - 1;

/** The drawing's two columns: 260px of list, the 24px gap, 420px of preview. */
const TWO_COLUMNS = 260 + 24 + 420;

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("encounters list and preview", async ({ app, page }) => {
      await app.open(encounters);
      const list = page.locator('[data-slot="encounter-list"]');
      const pane = page.locator('[data-slot="encounter-preview"]');
      await expect(pane).toBeVisible();
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      const room = await list.evaluate((el) => el.parentElement!.clientWidth);
      const stacked = room < TWO_COLUMNS;
      const listBox = await box(list);
      const paneBox = await box(pane);

      await test.step(
        stacked ? "the preview is under the list" : "list and preview side by side",
        async () => {
          // The list takes a third of what is spare beside the preview, up to
          // the drawing's 360 and no further; stacked, it has the row to itself.
          const listWidth = Math.min(360, stacked ? room : 260 + (room - TWO_COLUMNS) / 3);
          expect.soft(listBox.width, "list width").toBeCloseTo(listWidth, 0);
          if (stacked) {
            expect
              .soft(paneBox.y, "preview top")
              .toBeGreaterThanOrEqual(listBox.y + listBox.height);
            expect.soft(paneBox.width, "preview width").toBeCloseTo(room, 0);
          } else {
            expect.soft(paneBox.y, "preview top").toBeCloseTo(listBox.y, 0);
            expect.soft(paneBox.x, "preview left").toBeGreaterThan(listBox.x + listBox.width);
            expect.soft(listBox.width, "list width").toBeLessThanOrEqual(360.5);
            expect.soft(listBox.width, "list width").toBeGreaterThanOrEqual(259.5);
            expect.soft(paneBox.width, "preview width").toBeGreaterThanOrEqual(419.5);
          }
        },
      );

      await test.step("the header's left edge is the list's", async () => {
        const h1 = await box(page.locator('main [data-slot="page-heading"] h1'));
        expect.soft(h1.x, "h1 left").toBeCloseTo(listBox.x, 0);
        const main = await box(page.locator("main"));
        // Centred: whatever is left over either side of the frame is equal.
        const frame = await box(page.locator('main [data-slot="page-heading"]').locator(".."));
        expect
          .soft(frame.x - main.x, "frame's left margin")
          .toBeCloseTo(main.x + main.width - (frame.x + frame.width), 0);
      });

      await test.step("the preview stays inside the page", async () => {
        const main = await box(page.locator("main"));
        expect
          .soft(paneBox.x + paneBox.width, "preview right")
          .toBeLessThanOrEqual(main.x + main.width + 0.5);
      });

      await test.step("choosing a row shows its preview, in view", async () => {
        // A row near the top, from the top: stacked, the preview is then a
        // screen below the row, and only the page scrolling brings it up.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: /^Whatever is in the crate/ }).click();
        await expect(pane).toHaveAccessibleName("Whatever is in the crate");
        await expect(page).toHaveURL(/[?&]encounter=/);
        await app.settle();
        const at = await restingPlace(page);
        if (stacked) {
          expect.soft(broughtUp(at), `preview brought up (${JSON.stringify(at)})`).toBe(true);
          expect.soft(at.top, "preview top below the chrome").toBeGreaterThanOrEqual(at.chrome - 1);
        } else {
          // Beside the list it was already in view: the page does not move.
          expect.soft(at.scrollY, "the page did not scroll").toBe(0);
        }
      });

      await test.step("the creature table fits, names readable", async () => {
        // The hag's roster has the longest names on the shelf.
        await page.getByRole("button", { name: /^The hag's bargain/ }).click();
        await expect(pane).toHaveAccessibleName("The hag's bargain");
        const table = pane.locator('[data-slot="encounter-creatures"]');
        await expect(table).toBeVisible();
        const fit = await table.evaluate((el) => ({
          table: el.getBoundingClientRect().width,
          box: el.parentElement!.clientWidth,
          names: [...el.querySelectorAll("tbody th")].map((th) => ({
            width: th.getBoundingClientRect().width,
            clipped: th.scrollWidth > th.clientWidth + 0.5,
          })),
        }));
        expect.soft(fit.table, "table width").toBeLessThanOrEqual(fit.box + 0.5);
        for (const name of fit.names) {
          expect.soft(name.clipped, "a creature's name is clipped").toBe(false);
          expect.soft(name.width, "a creature's name column").toBeGreaterThanOrEqual(96);
        }
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the battle map is a 24:9 band the pane's width, under its header", async () => {
        // The ambush is the shelf's one encounter with a picture.
        await page.getByRole("button", { name: /^Ambush in the reeds/ }).click();
        await expect(pane).toHaveAccessibleName("Ambush in the reeds");
        const band = pane.locator('[data-slot="hob-cover"]');
        await expect(band.locator("img[data-loaded]")).toHaveCount(1);
        // Clear of the sticky chrome, and still: a press is measured where it lands.
        await band.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const fit = await band.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const img = el.querySelector("img")!.getBoundingClientRect();
          const header = el.parentElement!.querySelector("header")!.getBoundingClientRect();
          const link = el.querySelector("a")!;
          const middle = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            width: r.width,
            height: r.height,
            room: el.parentElement!.clientWidth,
            top: r.top,
            headerBottom: header.bottom,
            img: { width: img.width, height: img.height },
            // A press anywhere on the picture lands on its link.
            linked: middle === link,
          };
        });
        expect.soft(fit.width, "band width").toBeCloseTo(fit.room, 0);
        expect.soft(fit.width / fit.height, "band aspect").toBeCloseTo(24 / 9, 1);
        expect.soft(fit.top, "band top").toBeCloseTo(fit.headerBottom, 0);
        expect.soft(fit.img.width, "picture width").toBeCloseTo(fit.width, 0);
        expect.soft(fit.img.height, "picture height").toBeCloseTo(fit.height - 1, 0);
        expect.soft(fit.linked, "the band's middle is its link").toBe(true);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("an Overview encounter row opens it on the Encounters tab", async ({ app, page }) => {
      await app.open(overview);
      const row = page.getByRole("listitem").filter({ hasText: "Whatever is in the crate" });
      // Its own Edit sits above the overlay: what a press on it lands on is the
      // Edit, which opens the encounter builder rather than the Encounters tab.
      const editButton = row.getByRole("button", { name: "Edit Whatever is in the crate" });
      await expect(editButton).toHaveAttribute("href", /\/encounters\/[^/]+\/edit$/);
      // In view and clear of the sticky chrome: on a phone the read-aloud
      // inset above the rows puts them below the first screen.
      await editButton.evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const editBox = await box(editButton);
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("aria-label"),
        { x: editBox.x + editBox.width / 2, y: editBox.y + editBox.height / 2 },
      );
      expect.soft(hit, "what a press on Edit lands on").toBe("Edit Whatever is in the crate");

      // Anywhere on the row's face, not only its name: the detail line under
      // it, where what the pointer hits is the name's overlay.
      const rowBox = await box(row);
      const detail = await box(row.getByText(/Unrated/));
      await row.click({
        position: { x: detail.x - rowBox.x + 4, y: detail.y - rowBox.y + detail.height / 2 },
      });

      await expect(page).toHaveURL(/\/encounters\?encounter=/);
      const pane = page.locator('[data-slot="encounter-preview"]');
      await expect(pane).toHaveAccessibleName("Whatever is in the crate");
      await app.settle();
      const at = await restingPlace(page);
      if (at.stacked)
        expect.soft(broughtUp(at), `preview brought up (${JSON.stringify(at)})`).toBe(true);
    });
  });
}

/**
 * The server's side of a move, for this page only: the stub's list is one
 * answer every worker shares, so the move is kept here and the list's re-read
 * comes back in the moved order, as the server's would. Read back unchanged,
 * the list would say the move never happened and the row would go back.
 */
const takesMoves = async (page: Page) => {
  let order: Array<string> | undefined;
  await page.route(/\/stub\/campaigns\/[^/]+\/encounters\/[^/]+\/move$/, async (route) => {
    const id = /encounters\/([^/]+)\/move$/.exec(route.request().url())![1]!;
    const { before, after } = route.request().postDataJSON() as {
      before?: string;
      after?: string;
    };
    const rest = order!.filter((row) => row !== id);
    const anchor = rest.indexOf((before ?? after)!);
    rest.splice(after === undefined ? anchor : anchor + 1, 0, id);
    order = rest;
    await route.fulfill({ status: 204 });
  });
  await page.route(/\/stub\/campaigns\/[^/]+\/encounters(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const list = (await response.json()) as { items: ReadonlyArray<{ id: string }> };
    order ??= list.items.map((row) => row.id);
    const byId = new Map(list.items.map((row) => [row.id, row]));
    await route.fulfill({ response, json: { ...list, items: order.map((id) => byId.get(id)) } });
  });
};

/** The unplayed rows' names, in the order their grips are drawn. */
const gripOrder = (page: Page) =>
  page
    .locator('[data-slot="encounter-list"] [data-slot="move-handle"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!.replace(/^Move /, "")));

/** The unplayed row an encounter is drawn in, grip and all. */
const movableRow = (page: Page, name: string) =>
  page.locator('[data-slot="movable-row"]').filter({ hasText: name });

/**
 * Presses `name`'s grip and drags it to the gap on `side` of `onto`'s row,
 * in steps, leaving the button down so the drag can be measured. The pointer
 * starts clear of the grip's edge, as a hand would.
 */
const dragGrip = async (page: Page, name: string, onto: string, side: "above" | "below") => {
  const grip = page.getByRole("button", { name: `Move ${name}` });
  const from = await box(grip);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const target = await box(movableRow(page, onto));
  // The list's rows are 6px apart; this is the middle of the gap.
  const y = side === "above" ? target.y - 3 : target.y + target.height + 3;
  await page.mouse.move(from.x + from.width / 2, y, { steps: 12 });
};

/**
 * Records, as it happens, what the row a drag let go settles on: the browser
 * fires `transitionrun` when a transition is created, and its computed timing
 * is read then rather than after a round trip that could outlast it.
 */
const recordSettle = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { settle?: Record<string, string> };
    delete w.settle;
    document.addEventListener("transitionrun", (event) => {
      const el = event.target as HTMLElement;
      if (el.dataset.slot !== "movable-row" || w.settle !== undefined) return;
      const style = getComputedStyle(el);
      w.settle = {
        property: event.propertyName,
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
        zIndex: style.zIndex,
      };
    });
  });

/** A token's computed value, resolved through a probe as a property would be. */
const tokenAs = (page: Page, property: string, token: string) =>
  page.evaluate(
    ({ property, token }) => {
      const probe = document.createElement("div");
      probe.style.setProperty(property, `var(${token})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    },
    { property, token },
  );

const ms = (duration: string) =>
  duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;

/** The reorder plan's widths: a small phone, a tablet and a laptop. */
const ORDER_WIDTHS = [360, 768, 1280] as const;

for (const width of ORDER_WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("encounter order handles", async ({ app, page }) => {
      await takesMoves(page);
      await app.open(encounters);
      const list = page.locator('[data-slot="encounter-list"]');
      const handles = list.locator('[data-slot="move-handle"]');
      await expect(page.locator('[data-slot="encounter-preview"]')).toBeVisible();
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
      // Five never played, and two played that draw no handle.
      await expect(handles).toHaveCount(5);
      const order = () =>
        handles.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

      await test.step("nothing scrolls sideways", async () => {
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("a handle is a target at least 24px square", async () => {
        for (const handle of await handles.all()) {
          const at = await box(handle);
          expect.soft(at.width, "handle width").toBeGreaterThanOrEqual(24);
          expect.soft(at.height, "handle height").toBeGreaterThanOrEqual(24);
        }
      });

      await test.step("every row starts at one edge, in every section", async () => {
        const lefts = await list.locator("li").evaluateAll((items) =>
          items.map((li) => ({
            row: li.lastElementChild!.getBoundingClientRect().left,
            name: li.lastElementChild!.querySelector(".font-semibold")!.getBoundingClientRect()
              .left,
          })),
        );
        // Unplayed and played rows both drawn.
        expect.soft(lefts.length, "rows").toBe(7);
        for (const left of lefts) {
          expect.soft(left.row, "row left").toBeCloseTo(lefts[0]!.row, 0);
          expect.soft(left.name, "name left").toBeCloseTo(lefts[0]!.name, 0);
        }
      });

      await test.step("a press on a row's middle lands on the row, not its handle", async () => {
        const row = page.getByRole("button", { name: /^The dry well/ });
        await row.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        const hit = await row.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              ?.closest("button") === el
          );
        });
        expect.soft(hit, "the row's middle is the row").toBe(true);
      });

      await test.step("Enter opens the menu, Move down moves the row, focus comes back", async () => {
        expect(await order()).toEqual([
          "Move Ambush in the reeds",
          "Move Whatever is in the crate",
          "Move The dry well",
          "Move The hag's bargain",
          "Move Salt-flat sandstorm",
        ]);
        const handle = page.getByRole("button", { name: "Move Ambush in the reeds" });
        await handle.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        await handle.focus();
        await page.keyboard.press("Enter");
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(menu.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        const down = menu.getByRole("menuitem", { name: "Move down" });
        // The menu is inside the page, not past its edge.
        const at = await box(down);
        expect.soft(at.x, "menu left").toBeGreaterThanOrEqual(0);
        expect.soft(at.x + at.width, "menu right").toBeLessThanOrEqual(width);
        await down.click();

        await expect(menu).toBeHidden();
        await expect
          .poll(order)
          .toEqual([
            "Move Whatever is in the crate",
            "Move Ambush in the reeds",
            "Move The dry well",
            "Move The hag's bargain",
            "Move Salt-flat sandstorm",
          ]);
        await expect(handle).toBeFocused();
        await expect(page.getByText("Ambush in the reeds moved to 2 of 5")).toBeAttached();
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });
    });

    test("dragging an encounter by its grip", async ({ app, page }) => {
      await takesMoves(page);
      await app.open(encounters);
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
      expect(await gripOrder(page)).toEqual([
        "Ambush in the reeds",
        "Whatever is in the crate",
        "The dry well",
        "The hag's bargain",
        "Salt-flat sandstorm",
      ]);
      // The section in the middle of the window: the auto-scroller stays still.
      await movableRow(page, "Whatever is in the crate").evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );

      await test.step("the grabbed row waits in its place, dimmed", async () => {
        const before = await box(movableRow(page, "Ambush in the reeds"));
        await dragGrip(page, "Ambush in the reeds", "The dry well", "below");
        const carried = page.locator('[data-slot="movable-row"][data-dragging]');
        await expect(carried).toHaveCount(1);
        await expect(carried).toContainText("Ambush in the reeds");
        // Dimmed as a disabled control is, and not moved: nothing covers the gap.
        expect.soft(await carried.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
        const now = await box(carried);
        expect.soft(now.y, "still in its place").toBeCloseTo(before.y, 0);
        const library = await page.evaluate(() => {
          const rules = [...[...document.styleSheets], ...document.adoptedStyleSheets].flatMap(
            (sheet) => {
              try {
                return [...sheet.cssRules].map((rule) => rule.cssText);
              } catch {
                return [];
              }
            },
          );
          return {
            topLayer: document.querySelectorAll("[popover], :popover-open").length,
            marked: document.querySelectorAll("[data-dnd-dragging], [data-dnd-placeholder]").length,
            infinity: rules.filter((rule) => rule.includes("infinity")),
          };
        });
        expect.soft(library.topLayer, "nothing in the top layer").toBe(0);
        expect.soft(library.marked, "no library feedback on the row").toBe(0);
        expect.soft(library.infinity, "no injected infinite z-index").toEqual([]);
      });

      await test.step("a line in the focus ring's colour marks the gap", async () => {
        const line = page.locator('[data-slot="drop-line"]');
        await expect(line).toHaveCount(1);
        // In the middle of the gap between the dry well and the bargain, and
        // drawn over whatever is there.
        const well = await box(movableRow(page, "The dry well"));
        const bargain = await box(movableRow(page, "The hag's bargain"));
        const drawn = await box(line);
        expect
          .soft(drawn.y + drawn.height / 2, "in the gap")
          .toBeCloseTo((well.y + well.height + bargain.y) / 2, 0);
        const onTop = await line.evaluate((el) => {
          // It takes no pointer, so hit testing passes through it: let it,
          // for this one question of what is painted on top.
          el.style.pointerEvents = "auto";
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          el.style.pointerEvents = "";
          return hit === el;
        });
        expect.soft(onTop, "the line is drawn on top").toBe(true);
        expect
          .soft(await line.evaluate((el) => getComputedStyle(el).backgroundColor))
          .toBe(await tokenAs(page, "background-color", "--focus-ring"));
        await expect(page.getByRole("menu")).toHaveCount(0);
      });

      await test.step("let go, it settles on the motion tokens into its new place", async () => {
        await recordSettle(page);
        await page.mouse.up();
        await expect
          .poll(() => gripOrder(page))
          .toEqual([
            "Whatever is in the crate",
            "The dry well",
            "Ambush in the reeds",
            "The hag's bargain",
            "Salt-flat sandstorm",
          ]);
        await expect(page.getByText("Ambush in the reeds moved to 3 of 5")).toBeAttached();
        const settle = await page.waitForFunction(
          () => (window as unknown as { settle?: Record<string, string> }).settle,
        );
        const ran = (await settle.jsonValue()) as Record<string, string>;
        expect.soft(ran.property, "what settles").toBe("translate");
        expect
          .soft(ms(ran.duration!), "settle duration")
          .toBe(ms(await tokenAs(page, "transition-duration", "--dur-base")));
        expect
          .soft(ran.easing, "settle easing")
          .toBe(await tokenAs(page, "transition-timing-function", "--ease-settle"));
        expect
          .soft(ran.zIndex, "settling on the lifted rung")
          .toBe(
            await page.evaluate(() =>
              getComputedStyle(document.documentElement)
                .getPropertyValue("--z-index-lifted")
                .trim(),
            ),
          );
        // At rest it is an ordinary row again, no longer lifted.
        await expect
          .poll(() =>
            movableRow(page, "Ambush in the reeds").evaluate((el) => getComputedStyle(el).zIndex),
          )
          .toBe("auto");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(page.locator('[data-slot="drop-line"]')).toHaveCount(0);
        const { scrollWidth, clientWidth } = await app.widths();
        expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
      });

      await test.step("the order the server was sent survives a reload", async () => {
        await page.reload();
        await app.settle();
        expect(await gripOrder(page)).toEqual([
          "Whatever is in the crate",
          "The dry well",
          "Ambush in the reeds",
          "The hag's bargain",
          "Salt-flat sandstorm",
        ]);
      });

      await test.step("under a kind pill it moves among the rows drawn", async () => {
        await page
          .getByRole("group", { name: "Filter by kind" })
          .getByRole("button", { name: /^Challenges & hazards/ })
          .click();
        await expect.poll(() => gripOrder(page)).toEqual(["The dry well", "Salt-flat sandstorm"]);
        await movableRow(page, "The dry well").evaluate((el) =>
          el.scrollIntoView({ block: "center", behavior: "instant" }),
        );
        await dragGrip(page, "Salt-flat sandstorm", "The dry well", "above");
        await page.mouse.up();
        await expect.poll(() => gripOrder(page)).toEqual(["Salt-flat sandstorm", "The dry well"]);
        // Before the well, the row it passed; the bargain the pill hides keeps
        // its place after the ambush.
        await page
          .getByRole("group", { name: "Filter by kind" })
          .getByRole("button", { name: /^All/ })
          .click();
        await expect
          .poll(() => gripOrder(page))
          .toEqual([
            "Whatever is in the crate",
            "Salt-flat sandstorm",
            "The dry well",
            "Ambush in the reeds",
            "The hag's bargain",
          ]);
      });

      await test.step("a click on a grip still opens its menu", async () => {
        const grip = page.getByRole("button", { name: "Move The dry well" });
        await grip.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
        await grip.click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect(menu.getByRole("menuitem", { name: "Move up" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
      });
    });
  });
}

/**
 * A finger, through Chromium's own touch input (`Input.dispatchTouchEvent`),
 * so the browser decides between a scroll and a press as it would on a phone.
 * This is emulation on a desktop engine: long-press dragging on a real iPhone
 * and Android phone is a manual check this cannot stand in for.
 */
test.describe("touch", () => {
  test.use({ viewport: { width: 360, height: HEIGHT }, hasTouch: true, isMobile: true });

  test("a tap opens the menu, a long press drags, a swipe scrolls", async ({ app, page }) => {
    await takesMoves(page);
    await app.open(encounters);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    const start = [
      "Ambush in the reeds",
      "Whatever is in the crate",
      "The dry well",
      "The hag's bargain",
      "Salt-flat sandstorm",
    ];
    await movableRow(page, "Whatever is in the crate").evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );

    await test.step("a tap on a grip opens its menu", async () => {
      await page.getByRole("button", { name: "Move The dry well" }).tap();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    });

    await test.step("a swipe across a row scrolls the page", async () => {
      // Only the grip takes no pan; the row beside it is the page.
      const panning = (name: string | RegExp) =>
        page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).touchAction);
      expect.soft(await panning("Move Ambush in the reeds"), "the grip").toBe("none");
      expect.soft(await panning(/^Ambush in the reeds/), "the row").toBe("auto");
      const row = await box(page.getByRole("button", { name: /^Ambush in the reeds/ }));
      const x = row.x + row.width / 2;
      const y = row.y + row.height / 2;
      const scrolled = await page.evaluate(() => window.scrollY);
      await touch("touchStart", x, y);
      for (let step = 1; step <= 8; step++) await touch("touchMove", x, y - step * 20);
      await touch("touchEnd", x, y - 160);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
      // A fling carries on past the finger, and past a later `scrollIntoView`:
      // wait until the window has fired no scroll for a while. Two reads of
      // `scrollY` a moment apart can agree while the fling is still running,
      // and the long press below would then land beside its grip.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            let quiet = setTimeout(done, 300);
            function done() {
              window.removeEventListener("scroll", moved);
              resolve();
            }
            function moved() {
              clearTimeout(quiet);
              quiet = setTimeout(done, 300);
            }
            window.addEventListener("scroll", moved, { passive: true });
          }),
      );
      await expect(page.locator("[data-dragging]")).toHaveCount(0);
      await expect(page.getByRole("menu")).toHaveCount(0);
      expect(await gripOrder(page)).toEqual(start);
    });

    await test.step("a long press on a grip picks the row up, and it drops", async () => {
      await movableRow(page, "Whatever is in the crate").evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      const grip = await box(page.getByRole("button", { name: "Move Ambush in the reeds" }));
      const well = await box(movableRow(page, "The dry well"));
      const x = grip.x + grip.width / 2;
      const y = grip.y + grip.height / 2;
      await touch("touchStart", x, y);
      // Held still past the library's long press.
      await page.waitForTimeout(400);
      const to = well.y + well.height + 3;
      for (let step = 1; step <= 10; step++)
        await touch("touchMove", x, y + ((to - y) * step) / 10);
      await expect(page.locator('[data-slot="drop-line"]')).toHaveCount(1);
      await touch("touchEnd", x, to);
      await expect
        .poll(() => gripOrder(page))
        .toEqual([
          "Whatever is in the crate",
          "The dry well",
          "Ambush in the reeds",
          "The hag's bargain",
          "Salt-flat sandstorm",
        ]);
      await expect(page.getByRole("menu")).toHaveCount(0);
      const { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
    });
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1280, height: HEIGHT }, reducedMotion: "reduce" });

  test("a dropped encounter lands without moving", async ({ app, page }) => {
    await takesMoves(page);
    await app.open(encounters);
    await movableRow(page, "Whatever is in the crate").evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    expect(ms(await tokenAs(page, "transition-duration", "--dur-base")), "--dur-base").toBe(0);
    await recordSettle(page);
    await dragGrip(page, "The hag's bargain", "Ambush in the reeds", "above");
    await page.mouse.up();
    await expect
      .poll(() => gripOrder(page))
      .toEqual([
        "The hag's bargain",
        "Ambush in the reeds",
        "Whatever is in the crate",
        "The dry well",
        "Salt-flat sandstorm",
      ]);
    // In its place at once, and an ordinary row: nothing ran and nothing is lifted.
    await expect
      .poll(() =>
        movableRow(page, "The hag's bargain").evaluate((el) => getComputedStyle(el).zIndex),
      )
      .toBe("auto");
    expect(
      await page.evaluate(() => (window as unknown as { settle?: unknown }).settle),
      "a transition ran",
    ).toBeUndefined();
  });
});

test.describe("refused drop", () => {
  test.use({ viewport: { width: 1280, height: HEIGHT } });

  test("a refusal inside the settle leaves an ordinary row", async ({ app, page }) => {
    // Refused at once, well inside the 200ms settle: the row goes back while
    // its slide is still running, which cancels the transition.
    await page.route(/\/stub\/campaigns\/[^/]+\/encounters\/[^/]+\/move$/, (route) =>
      route.fulfill({ status: 404, json: { _tag: "NotFound", resource: "encounter", id: "e2e" } }),
    );
    await app.open(encounters);
    await movableRow(page, "Whatever is in the crate").evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    const before = await gripOrder(page);
    await dragGrip(page, "The hag's bargain", "Ambush in the reeds", "above");
    await page.mouse.up();
    await expect(page.getByRole("alert")).toContainText("That encounter is gone");
    expect(await gripOrder(page)).toEqual(before);
    await expect
      .poll(() =>
        movableRow(page, "The hag's bargain").evaluate((el) => {
          const ordinary = el.parentElement!.firstElementChild!;
          return {
            zIndex: getComputedStyle(el).zIndex,
            shadow: getComputedStyle(el).boxShadow === getComputedStyle(ordinary).boxShadow,
          };
        }),
      )
      .toEqual({ zIndex: "auto", shadow: true });
  });
});
