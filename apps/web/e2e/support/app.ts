import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { Screen } from "../../src/test/screens";
import { SCENARIO_HEADER, UNANSWERED_HEADER } from "../stub/stubApi";

export { expect };
export { screens, type Screen } from "../../src/test/screens";

/**
 * The widths every layout check runs at: wide, just above Hob's inline
 * breakpoint (1020), below the header's wrap breakpoint and the campaign row's
 * `@3xl`, and a phone.
 */
export const WIDTHS = [1440, 1024, 760, 390] as const;
export const HEIGHT = 900;

/** What the screen is ready on: its header, or the heading an Overview's hero draws. */
const READY =
  '[data-slot="page-header"], [data-slot="page-heading"], [data-slot="overview-hero"] h1';

/**
 * The page is signed in by the stub server's stand-in session
 * (`e2e/stub/StubAuthProvider.tsx`), with no Clerk and no token. Signing in
 * through Clerk against a real server is the authenticated suite's
 * (`e2e/auth/`).
 */
export class App {
  constructor(readonly page: Page) {}

  /** Load a screen from cold, over its scenario's wire, and wait for it to settle. */
  async open(screen: Screen): Promise<void> {
    await this.page.setExtraHTTPHeaders({ [SCENARIO_HEADER]: screen.scenario });
    await this.page.goto(screen.path);
    await this.settle();
  }

  /**
   * Navigate in the page, as a click would: the router's browser history
   * re-reads the address bar on `popstate`, so the shell stays mounted.
   */
  async go(path: string): Promise<void> {
    await this.page.evaluate((to) => {
      window.history.pushState(null, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await expect(this.page).toHaveURL((url) => url.pathname === path);
    await this.settle();
  }

  /**
   * The screen's header is up, nothing is loading, the fonts are in, and the
   * DOM has been still for 300ms — so a measurement is of the page a reader
   * sees, not of a frame on the way to it.
   */
  async settle(): Promise<void> {
    await expect(this.page.locator(READY).first()).toBeVisible();
    await expect(this.page.locator('[data-slot="loading"]')).toHaveCount(0);
    await this.page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        let last = performance.now();
        const started = last;
        const observer = new MutationObserver(() => (last = performance.now()));
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        const tick = () => {
          const now = performance.now();
          if (now - last > 300 || now - started > 5000) {
            observer.disconnect();
            resolve();
          } else setTimeout(tick, 50);
        };
        tick();
      });
      // A panel sliding in is still where its transition has it: measure the
      // box it comes to rest at. Infinite ones (a spinner) never finish.
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
  }

  /** The document's `scrollWidth` and `clientWidth`: equal means nothing scrolls sideways. */
  widths(): Promise<{ scrollWidth: number; clientWidth: number }> {
    return this.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
  }
}

/** A locator's box, which the check needs to exist. */
export async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, `${locator} has no box`).not.toBeNull();
  return found!;
}

/**
 * The suite's fixtures. `app` drives the page; a request the scenario could
 * not answer is attached to the test as an `unanswered` annotation, which is a
 * gap in the fixtures rather than the layout, and matters only when the screen
 * then drew a failure notice (every layout test asserts it did not).
 */
export const test = base.extend<{ app: App }>({
  app: async ({ page }, use, testInfo) => {
    const unanswered = new Set<string>();
    page.on("response", (response) => {
      const key = response.headers()[UNANSWERED_HEADER];
      if (key !== undefined) unanswered.add(key);
    });
    await use(new App(page));
    // A route still answering a re-read (the Hob-drawing poll) when the page
    // closes would otherwise fail the test after its last assertion.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    if (unanswered.size > 0)
      testInfo.annotations.push({ type: "unanswered", description: [...unanswered].join(", ") });
  },
});
