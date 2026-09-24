import { HEIGHT, WIDTHS, box, expect, screens, test } from "../support/app";

/**
 * The Hob panel across navigation: opened on the Overview, walked through two
 * campaign screens, the runner, out of the campaign to the Library and back.
 * At every step it must be the same DOM node (the shell stays mounted; a panel
 * rebuilt per screen loses its conversation), still open, and still pressed —
 * *Ask Hob* reflects the panel because `useHobPanel` owns ⌘K and Esc, and a
 * button holding its own idea of open is wrong the first time somebody uses
 * the keyboard.
 *
 * From 1020px up the panel is inline: a full-height column beside the whole
 * shell, flush with the right edge, with the sticky chrome ending where it
 * starts, and pinned there while the window scrolls. Below that it is the
 * overlay, which must never cover the bar.
 */

const INLINE_FROM = 1020;
const walk = ["overview", "notes", "party", "run", "spells", "overview"].map((name) =>
  screens.find((screen) => screen.name === name)!,
);

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("the Hob panel stays open and in place across navigation", async ({ app, page }) => {
      const inline = width >= INLINE_FROM;
      await app.open(walk[0]!);
      const askHob = page.locator("button[aria-pressed]").filter({ hasText: "Ask Hob" });
      await askHob.click();
      const panel = page.locator('section[aria-label="Hob"]');
      await expect(panel).toBeVisible();
      await app.settle();
      // Marked once; a node the shell rebuilt would come back unmarked.
      await page.evaluate(() => {
        for (const el of [
          document.querySelector('section[aria-label="Hob"]'),
          document.querySelector("header"),
        ])
          if (el !== null) (el as unknown as { __e2eMark: boolean }).__e2eMark = true;
      });

      const stack = page.locator(".sticky.top-0").first();
      for (const [index, step] of walk.entries()) {
        await test.step(`${index}: ${step.name}`, async () => {
          if (index > 0) await app.go(step.path);
          await expect.soft(askHob).toHaveAttribute("aria-pressed", "true");
          await expect.soft(panel).toBeVisible();
          const same = await page.evaluate(() => {
            const marked = (el: Element | null) =>
              (el as unknown as { __e2eMark?: boolean } | null)?.__e2eMark === true;
            return {
              panel: marked(document.querySelector('section[aria-label="Hob"]')),
              header: marked(document.querySelector("header")),
            };
          });
          expect
            .soft(same, "the same panel and header nodes")
            .toEqual({ panel: true, header: true });

          const { scrollWidth, clientWidth } = await app.widths();
          expect.soft(scrollWidth, "scrollWidth with the panel open").toBe(clientWidth);

          // Beside a docked panel the rows are narrower than the window;
          // nothing in them may be drawn past the column they have.
          const chrome = await box(stack);
          const pastColumn = await stack.evaluate(
            (el, right) =>
              [...el.querySelectorAll("a, button, [data-slot=badge]")]
                .filter((control) => {
                  const r = control.getBoundingClientRect();
                  return (
                    r.width > 0 && r.height > 0 && getComputedStyle(control).visibility !== "hidden"
                  );
                })
                .filter((control) => control.getBoundingClientRect().right > right + 0.5)
                .map((control) =>
                  (control.textContent || control.getAttribute("aria-label") || "").trim(),
                ),
            chrome.x + chrome.width,
          );
          expect.soft(pastColumn, "chrome past the column's edge").toEqual([]);

          // The inline form is the sidebar's container; the overlay is the
          // sheet, which only it marks `data-mobile`.
          const overlay = page.locator('[data-mobile="true"]').filter({ has: panel });
          expect.soft(await overlay.count(), inline ? "inline" : "an overlay").toBe(inline ? 0 : 1);

          if (!inline) {
            const probe = await box(panel);
            const coversBar = await page.evaluate(
              ({ x, y }) => {
                const hit = document.elementFromPoint(x, y);
                return hit !== null && !document.querySelector(".sticky.top-0")!.contains(hit);
              },
              { x: probe.x + probe.width / 2, y: chrome.y + 10 },
            );
            expect.soft(coversBar, "the overlay covers the bar").toBe(false);
            return;
          }

          const dock = page.locator("[data-slot=sidebar-container]").filter({ has: panel });
          const docked = await box(dock);
          expect.soft(docked.y, "panel top").toBeCloseTo(0, 0);
          expect.soft(docked.height, "panel height").toBeCloseTo(HEIGHT, 0);
          expect.soft(docked.x + docked.width, "panel's right edge").toBeCloseTo(clientWidth, 0);
          expect
            .soft(chrome.x + chrome.width, "the chrome ends where the panel starts")
            .toBeCloseTo(docked.x, 0);
          const main = await box(page.locator("main"));
          expect
            .soft(main.x + main.width, "main ends before the panel")
            .toBeLessThanOrEqual(docked.x + 0.5);

          // Pinned while the window scrolls. Most screens on the walk are
          // shorter than the viewport at 1440, so a spacer makes every step
          // scroll; an inline style rather than a class, because a class no
          // source file names is never emitted (AGENTS.md, "Silent Tailwind").
          const scrolled = await page.evaluate(() => {
            const spacer = document.createElement("div");
            spacer.style.height = "2000px";
            document.querySelector("main")!.append(spacer);
            window.scrollTo(0, 400);
            const dock = document
              .querySelector('section[aria-label="Hob"]')!
              .closest("[data-slot=sidebar-container]")!
              .getBoundingClientRect();
            const answer = {
              scrollY: Math.round(window.scrollY),
              dockTop: Math.round(dock.top),
              dockHeight: Math.round(dock.height),
              stackTop: Math.round(
                document.querySelector(".sticky.top-0")!.getBoundingClientRect().top,
              ),
            };
            window.scrollTo(0, 0);
            spacer.remove();
            return answer;
          });
          expect.soft(scrolled, "after scrolling 400px").toEqual({
            scrollY: 400,
            dockTop: 0,
            dockHeight: HEIGHT,
            stackTop: 0,
          });
        });
      }
    });
  });
}
