import type { Locator, Page } from "@playwright/test";
import { box, expect, screens, test, type App } from "../support/app";

/**
 * The page stays where it is whether or not it scrolls.
 *
 * A classic scrollbar (Linux, Windows) takes its width out of the viewport, so
 * without a reserved gutter everything centred or right-aligned moves sideways
 * when a page grows past the fold. `html { scrollbar-gutter: stable }`
 * (`packages/ui` styles) holds the gutter whether or not there is a scrollbar
 * in it. macOS's overlay scrollbars take no width
 * and never showed the jump; headless Chromium hides scrollbars altogether
 * unless told not to, which is why this file launches its own browser with
 * them showing.
 *
 * The page's width is `app.widths()`'s, which says why it is not the root's
 * `clientWidth`.
 *
 * jsdom has no scrollbar and no layout, so none of this is visible there.
 */

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

const screen = (name: string) => screens.find((s) => s.name === name)!;

/**
 * The top bar's right-hand control, which moves with the viewport's right
 * edge. By text rather than role: an open modal hides the page behind it from
 * the accessibility tree.
 */
const askHob = (page: Page) => page.locator("header button", { hasText: "Ask Hob" }).first();

/**
 * Where the things that follow the page's width are, with whether the page
 * scrolls. `follows` is an element whose box depends on that width: centred,
 * or stretched to it.
 */
async function measure(app: App, follows: Locator) {
  const { page } = app;
  const at = await box(follows);
  return {
    scrolls: await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    ),
    width: (await app.widths()).clientWidth,
    left: at.x,
    right: at.x + at.width,
    topBar: (await box(askHob(page))).x,
  };
}

test("a page that grows past the fold does not move sideways", async ({ app, page }) => {
  // One screen, one centred element: the Overview's hero is centred, and the
  // same page is short in a tall window and long in the usual one.
  const hero = page.locator('[data-slot="overview-hero"] h1');
  await page.setViewportSize({ width: 1440, height: 2400 });
  await app.open(screen("overview"));
  const short = await measure(app, hero);
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.settle();
  const long = await measure(app, hero);

  expect(short.scrolls, "the tall window's page scrolls").toBe(false);
  expect(long.scrolls, "the usual window's page scrolls").toBe(true);
  expect.soft(long.width, "the page's width").toBe(short.width);
  expect.soft(long.left, "the hero heading's left edge").toBe(short.left);
  expect.soft(long.topBar, "the top bar's right control").toBe(short.topBar);
});

test("navigating from a short page to a long one does not move the top bar", async ({
  app,
  page,
}) => {
  await app.open(screen("encounters"));
  const short = await measure(app, page.locator("main"));
  await app.go(screen("overview").path);
  const long = await measure(app, page.locator("main"));

  expect(short.scrolls, "Encounters scrolls").toBe(false);
  expect(long.scrolls, "the Overview scrolls").toBe(true);
  expect.soft(long.width, "the page's width").toBe(short.width);
  expect.soft(long.right, "main's right edge").toBe(short.right);
  expect.soft(long.topBar, "the top bar's right control").toBe(short.topBar);
});

// A dialog locks the page's scroll. Base UI's lock holds the scrollbar's
// gutter on a long page and leaves a short one alone, so the page under the
// dialog stays put; these guard that the reserved gutter does not double up
// with the lock's.
const dialogs = [
  { name: "campaigns", trigger: "Archived campaigns", scrolls: false },
  { name: "sheet", trigger: "Edit abilities", scrolls: true },
] as const;

for (const { name, trigger, scrolls } of dialogs) {
  test(`opening a dialog on ${name} does not move the page`, async ({ app, page }) => {
    await app.open(screen(name));
    // The page header's heading runs to the header's actions, so its right
    // edge follows the page's width.
    const heading = page.locator('[data-slot="page-header"] h1');
    const before = await measure(app, heading);
    expect(before.scrolls, `${name} scrolls`).toBe(scrolls);

    await page.locator("main").getByRole("button", { name: trigger, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await app.settle();
    const open = await measure(app, heading);

    expect.soft(open.width, "the page's width").toBe(before.width);
    expect.soft(open.right, "the page heading's right edge").toBe(before.right);
    expect.soft(open.topBar, "the top bar's right control").toBe(before.topBar);
  });
}
