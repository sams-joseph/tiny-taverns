import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * Every screen in `src/test/screens.ts`, at every width: the numbers jsdom
 * cannot compute. The fixed heights are decisions written down in
 * `shell/AppShell.tsx` and `docs/internals/web-screens.md`, not minimums: the
 * bar measured 61 / 89 / 141 between sibling tabs when it grew with its
 * contents, so the content jumped as a DM changed tab.
 */

/** `PageHeader`'s wrap breakpoint (`@4xl/app`): from here up the bar and a campaign header never wrap. */
const WRAP = 896;

/**
 * Screens with no campaign press: the fight the press would send you back to,
 * and an encounter's page, whose own *Run* is the press aimed at that encounter.
 */
const NO_PRESS = new Set(["run", "encounter"]);

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const screen of screens) {
      test(screen.name, async ({ app, page }) => {
        await app.open(screen);

        const stack = page.locator(".sticky.top-0").first();
        const globalRow = stack.getByRole("navigation", { name: "Sections" }).locator("..");
        const campaignNav = page.getByRole("navigation", { name: "This campaign" });
        const inCampaign = (await campaignNav.count()) > 0;
        const header = page.locator('[data-slot="page-header"]');

        await test.step("draws no failure notice", async () => {
          await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
        });

        await test.step("nothing scrolls sideways", async () => {
          const { scrollWidth, clientWidth } = await app.widths();
          expect.soft(scrollWidth, "document scrollWidth").toBe(clientWidth);
          // No chrome row is a scroll container: a row that overflows is a
          // responsive-layout defect, not another scrolling surface.
          const rows = await page.evaluate(() => {
            const campaign = document.querySelector('nav[aria-label="This campaign"]');
            const header = document.querySelector('[data-slot="page-header"]');
            const heading = document.querySelector('main [data-slot="page-heading"]');
            return Object.fromEntries(
              Object.entries({
                "global row": document.querySelector('nav[aria-label="Sections"]')?.parentElement,
                "campaign row": campaign?.parentElement,
                bar: header?.firstElementChild,
                "heading tabs": heading?.children[1],
              })
                .filter((entry): entry is [string, Element] => entry[1] != null)
                .map(([name, el]) => [name, el.scrollWidth - el.clientWidth]),
            );
          });
          for (const [row, overflow] of Object.entries(rows))
            expect.soft(overflow, `${row} overflows its box`).toBeLessThanOrEqual(0);
        });

        await test.step("nothing in the chrome or a header is drawn past its edge", async () => {
          // An ancestor's overflow clips these, so `scrollWidth` alone never
          // sees them: the chrome against the viewport, a campaign screen's
          // header against `main`'s content edge.
          const past = await page.evaluate(() => {
            const visible = (el: Element) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
            };
            const label = (el: Element) =>
              `${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)} @${Math.round(el.getBoundingClientRect().right)}`;
            const beyond = (root: Element | null, selector: string, edge: number) =>
              root === null
                ? []
                : [...root.querySelectorAll(selector)]
                    .filter(visible)
                    .filter((el) => el.getBoundingClientRect().right > edge + 0.5)
                    .map(label);
            const main = document.querySelector("main");
            const contentRight =
              main === null
                ? document.documentElement.clientWidth
                : main.getBoundingClientRect().right -
                  parseFloat(getComputedStyle(main).paddingRight);
            return {
              chrome: beyond(
                document.querySelector(".sticky.top-0"),
                "a, button, h1, [data-slot=badge]",
                document.documentElement.clientWidth,
              ),
              heading: beyond(
                document.querySelector('main [data-slot="page-heading"]'),
                "a, button, input, h1",
                contentRight,
              ),
            };
          });
          expect.soft(past.chrome, "chrome past the viewport's right edge").toEqual([]);
          expect.soft(past.heading, "header past the content's edge").toEqual([]);
        });

        await test.step("no two header controls overlap", async () => {
          // A flex row whose children cannot shrink any further draws them
          // over one another, which neither the edge check nor `scrollWidth`
          // sees.
          const overlaps = await page.evaluate(() => {
            const controls = [
              ...document.querySelectorAll(
                '[data-slot="page-header"], main [data-slot="page-heading"]',
              ),
            ]
              .flatMap((el) => [...el.querySelectorAll("a, button, input, h1")])
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
              })
              .filter((el) => !el.parentElement?.closest("a, button"))
              // A switch's native input is a clipped 1px box behind its thumb.
              .filter((el) => el.getBoundingClientRect().width > 2);
            const label = (el: Element) =>
              (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30);
            const found: Array<string> = [];
            for (const [i, a] of controls.entries())
              for (const b of controls.slice(i + 1)) {
                if (a.contains(b) || b.contains(a)) continue;
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (x > 0.5 && y > 0.5) found.push(`${label(a)} × ${label(b)}`);
              }
            return found;
          });
          expect.soft(overlaps).toEqual([]);
        });

        await test.step("the chrome rows are their fixed heights", async () => {
          expect.soft((await box(globalRow)).height, "global row").toBeCloseTo(44, 0);
          await expect.soft(stack).toHaveCSS("z-index", "10");
          // Every control on the global row is the one 26px pill, Ask Hob included.
          const controls = await globalRow.locator("a, button").filter({ visible: true }).all();
          for (const control of controls)
            expect
              .soft((await box(control)).height, `${await control.textContent()}`)
              .toBeCloseTo(26, 0);
          if ((await header.count()) > 0) {
            const bar = await box(header.locator("> *").first());
            // Below the wrap breakpoint the actions take their own wrapping
            // row and the bar's height follows the screen.
            if (bar.width >= WRAP) expect.soft(bar.height, "bar").toBeCloseTo(76, 0);
            const tabs = header.locator("> *").nth(1);
            if ((await tabs.count()) > 0)
              expect.soft((await box(tabs)).height, "tab strip").toBeCloseTo(40, 0);
          }
          const headingTabs = page.locator('main [data-slot="page-heading"] > *').nth(1);
          if ((await headingTabs.count()) > 0)
            expect.soft((await box(headingTabs)).height, "heading tab strip").toBeCloseTo(40, 0);
        });

        await test.step("at most one peach primary", async () => {
          // The accent fill says "this is the next thing to do", and two say
          // nothing. `Button`'s default variant is the only thing that paints
          // `bg-accent` on a `[data-slot=button]`.
          const primaries = await page
            .locator('[data-slot="button"].bg-accent')
            .filter({ visible: true })
            .allTextContents();
          expect
            .soft(primaries.length, `primaries: ${primaries.join(", ")}`)
            .toBeLessThanOrEqual(1);
        });

        await test.step("the chrome stays on top while the window scrolls", async () => {
          const sticky = await page.evaluate(() => {
            const stack = document.querySelector(".sticky.top-0");
            const scroller = document.scrollingElement;
            if (stack === null || scroller === null) return null;
            if (scroller.scrollHeight <= scroller.clientHeight + 40) return null;
            window.scrollTo(0, 400);
            const r = stack.getBoundingClientRect();
            const probe = document.elementFromPoint(
              document.documentElement.clientWidth / 2,
              r.bottom - 5,
            );
            // A screen's own `sticky` must pin below the chrome, not under it.
            const underChrome = [...document.querySelectorAll("main *")]
              .filter((el) => getComputedStyle(el).position === "sticky")
              .map((el) => el.getBoundingClientRect())
              .filter((b) => b.height > 0 && b.top < Math.round(r.bottom) - 1 && b.bottom > 0)
              .map((b) => Math.round(b.top));
            window.scrollTo(0, 0);
            return {
              top: Math.round(r.top),
              onTop: probe !== null && stack.contains(probe),
              underChrome,
            };
          });
          if (sticky === null) return;
          expect.soft(sticky.top, "stack top after a 400px scroll").toBe(0);
          expect.soft(sticky.onTop, "elementFromPoint under the chrome lands in it").toBe(true);
          expect.soft(sticky.underChrome, "sticky elements pinned under the chrome").toEqual([]);
        });

        await test.step("nothing in main scrolls on its own", async () => {
          // Pages scroll with the window. A dialog scrolling its own body is
          // a separate case, and a sideways strip is not a page scroller.
          const scrollers = await page.evaluate(() =>
            [...document.querySelectorAll("main *")]
              .filter((el) => el.closest("[role=dialog]") === null)
              .filter((el) => {
                const overflow = getComputedStyle(el).overflowY;
                return (
                  (overflow === "auto" || overflow === "scroll") &&
                  el.scrollHeight > el.clientHeight + 1
                );
              })
              .map(
                (el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")}`,
              ),
          );
          expect.soft(scrollers).toEqual([]);
        });

        if (!inCampaign) return;

        await test.step("inside a campaign the chrome is the two nav rows", async () => {
          // No per-screen bar: the screen's header is the top of its content,
          // so every tab's content starts at one y. 44 + 46 + the hairline.
          await expect.soft(header, "a per-screen bar inside a campaign").toHaveCount(0);
          expect
            .soft((await box(campaignNav.locator(".."))).height, "campaign row")
            .toBeCloseTo(46, 0);
          expect.soft((await box(stack)).height, "campaign chrome").toBeCloseTo(91, 0);
        });

        await test.step("the campaign row collapses in order", async () => {
          const row = await box(campaignNav.locator(".."));
          const lead = campaignNav.locator("xpath=preceding-sibling::*[1]");
          const items = campaignNav.locator("a, button").filter({ visible: true });
          const first = await box(items.first());
          const last = await box(items.last());
          const leadBox = await box(lead);
          // The tabs follow the lead group at `ml-2`, whatever the name's length.
          expect.soft(first.x - (leadBox.x + leadBox.width), "lead → first tab").toBeCloseTo(8, 1);
          // The way home survives every collapse whole: at least its own 16px,
          // and the first tab starts after it.
          const home = await box(lead.locator("a").first());
          expect.soft(home.width, "the way home's width").toBeGreaterThanOrEqual(16);
          expect
            .soft(home.x + home.width, "the way home ends before the first tab")
            .toBeLessThanOrEqual(first.x);
          // The lead may shrink only by truncating the name inside it.
          expect
            .soft(
              await lead.evaluate((el) => el.scrollWidth > el.clientWidth),
              "the lead spills out of its box",
            )
            .toBe(false);
          expect
            .soft(last.x + last.width, "last item inside the row")
            .toBeLessThanOrEqual(row.x + row.width + 0.5);

          // The campaign's one verb is the peach press after the last tab.
          const press = campaignNav.locator("xpath=following-sibling::*[1]");
          if (screen.scenario === "creator" && !NO_PRESS.has(screen.name))
            await expect.soft(press, "the campaign's press").toBeVisible();
          if ((await press.count()) > 0) {
            const at = await box(press);
            expect
              .soft(at.x, "the press starts after the last tab")
              .toBeGreaterThanOrEqual(last.x + last.width - 0.5);
          }
        });
      });
    }
  });
}
