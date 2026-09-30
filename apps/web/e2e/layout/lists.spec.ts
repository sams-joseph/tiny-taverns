import type { Page } from "@playwright/test";
import { HEIGHT, box, expect, screens, test } from "../support/app";

/**
 * Every top-level list — Campaigns, Shared Worlds, My Characters and each
 * Library shelf — draws its body in the Overview's centred frame
 * (`max-w-overview`): its cards, its empty state and its load all share the
 * campaign Overview's edges, and a phone never scrolls sideways. Its header's
 * band spans the window, but its title row (and the Library's tab strip) is
 * centred in the same frame, so the title and its actions stand over the
 * cards' edges. jsdom has no boxes, so only a browser can say so.
 *
 * The empty lists are the scenario's wire with each list read answered empty;
 * the load is held open by leaving the list's read unanswered.
 */

const overview = screens.find((screen) => screen.name === "overview")!;
const screenNamed = (name: string) => screens.find((screen) => screen.name === name)!;
/** A read, whatever query it carries. */
const read = (path: string) => new RegExp(`/stub${path}(\\?|$)`);
const nothing = { items: [], nextCursor: null };

interface List {
  readonly name: string;
  /** The read the list waits on: left unanswered, the skeleton stays up. */
  readonly read: RegExp;
  /** Every read that must answer empty for the list to be empty. */
  readonly empty: ReadonlyArray<readonly [RegExp, unknown]>;
  /** The Library's shelves carry a tab strip under the title row. */
  readonly tabs?: boolean;
}

const lists: ReadonlyArray<List> = [
  { name: "campaigns", read: read("/me/campaigns"), empty: [[read("/me/campaigns"), []]] },
  { name: "worlds", read: read("/worlds"), empty: [[read("/worlds"), []]] },
  { name: "characters", read: read("/me/characters"), empty: [[read("/me/characters"), []]] },
  ...(
    [
      ["library", "/library/creatures", nothing],
      ["compendium", "/library/compendium", nothing],
      ["spells", "/library/spells", nothing],
      ["equipment", "/library/equipment", nothing],
      ["magic-items", "/library/magic-items", nothing],
      ["library-npcs", "/library/npcs", []],
    ] as const
  ).map(([name, path, body]) => ({
    name,
    read: read(path),
    empty: [[read(path), body] as const],
    tabs: true,
  })),
  {
    name: "library-rules",
    read: read("/library/options"),
    empty: [
      [read("/library/options"), []],
      [read("/library/feats"), nothing],
    ],
    tabs: true,
  },
];

/** A card in the body: the Compendium's are bare `article`s rather than `Card`s. */
const CARD = 'main :is([data-slot="card"], article)';

/** The frame's left and right edges. */
const edges = async (page: Page) => {
  const frame = await box(page.locator("main .max-w-overview").first());
  return { left: frame.x, right: frame.x + frame.width };
};

const expectEdges = (
  measured: { left: number; right: number },
  reference: { left: number; right: number },
  what: string,
) => {
  expect.soft(measured.left, `${what}: left edge`).toBeCloseTo(reference.left, 1);
  expect.soft(measured.right, `${what}: right edge`).toBeCloseTo(reference.right, 1);
};

/** Answer every one of the list's reads empty. */
const answerEmpty = async (page: Page, list: List) => {
  for (const [route, json] of list.empty) await page.route(route, (it) => it.fulfill({ json }));
};

const unrouteEmpty = async (page: Page, list: List) => {
  for (const [route] of list.empty) await page.unroute(route);
};

for (const width of [1280, 768] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const list of lists) {
      const screen = screenNamed(list.name);
      test(`${screen.name} shares the Overview's frame`, async ({ app, page }) => {
        await app.open(overview);
        const reference = await edges(page);

        await test.step("with cards", async () => {
          await app.open(screen);
          await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
          await expect(page.locator(CARD).first()).toBeVisible();
          expectEdges(await edges(page), reference, "frame");
          const grid = await box(page.locator(CARD).first().locator(".."));
          const gridEdges = { left: grid.x, right: grid.x + grid.width };
          expectEdges(gridEdges, reference, "card grid");
          const row = await box(
            page.locator('[data-slot="page-header"] [data-slot="page-header-row"]'),
          );
          expectEdges(
            { left: row.x, right: row.x + row.width },
            gridEdges,
            "header row over the grid",
          );
          if (list.tabs === true) {
            const tabs = await box(
              page.locator('[data-slot="page-header"] [data-slot="page-header-tabs"]'),
            );
            expectEdges(
              { left: tabs.x, right: tabs.x + tabs.width },
              gridEdges,
              "tab strip over the grid",
            );
          }
        });

        await test.step("empty", async () => {
          await answerEmpty(page, list);
          await app.open(screen);
          const empty = await box(page.locator('main [data-slot="empty-state"]').first());
          expect.soft(empty.x, "empty state: left edge").toBeCloseTo(reference.left, 1);
          expect
            .soft(empty.x + empty.width, "empty state: inside the frame")
            .toBeLessThanOrEqual(reference.right + 0.5);
          expectEdges(await edges(page), reference, "empty frame");
          await unrouteEmpty(page, list);
        });

        await test.step("loading", async () => {
          await page.route(list.read, () => {
            // Never answered: the skeleton stays up to be measured.
          });
          await page.reload();
          const loading = page.locator('main [data-slot="loading"]');
          await expect(loading).toBeVisible();
          const skeleton = await box(loading);
          expectEdges(
            { left: skeleton.x, right: skeleton.x + skeleton.width },
            reference,
            "skeleton",
          );
        });
      });
    }
  });
}

test.describe("360px", () => {
  test.use({ viewport: { width: 360, height: HEIGHT } });

  for (const list of lists) {
    const screen = screenNamed(list.name);
    test(`${screen.name} does not scroll sideways`, async ({ app, page }) => {
      await app.open(screen);
      await expect(page.locator('[data-slot="failure-notice"]')).toHaveCount(0);
      let { scrollWidth, clientWidth } = await app.widths();
      expect.soft(scrollWidth, "with cards").toBeLessThanOrEqual(clientWidth);

      await answerEmpty(page, list);
      await app.open(screen);
      await expect(page.locator('main [data-slot="empty-state"]').first()).toBeVisible();
      ({ scrollWidth, clientWidth } = await app.widths());
      expect.soft(scrollWidth, "empty").toBeLessThanOrEqual(clientWidth);
    });
  }
});
