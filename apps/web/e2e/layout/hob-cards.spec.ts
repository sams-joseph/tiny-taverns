import type { Locator } from "@playwright/test";
import { campaignId } from "../../src/test/ids";
import { HEIGHT, expect, test } from "../support/app";

/**
 * A Hob card's answers, pressed in a real browser: *Discard* takes the card
 * out of the thread, *Try again* discards it and asks for another, and a kept
 * card's *Open it* opens what the keep made.
 *
 * All three used to be drawn and do nothing — disabled, with no handler behind
 * them — and jsdom can say a handler ran but not that a pointer at the button
 * reaches it. So each step first asks what a pointer at the button's centre
 * hits (`elementFromPoint`), then clicks and checks the effect: the request on
 * the wire and what changed on screen. Inline (1440) and overlaid (760), since
 * the overlay is a sheet over its own scrim and *Open it* closes it.
 */

const INLINE_FROM = 1020;
const TITLE = "Grusk, the toll-keeper";

/** Whether a pointer at the element's centre lands on it, rather than on something over it. */
const reachable = (control: Locator) =>
  control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  });

for (const width of [1440, 760]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("each answer on a Hob card does what it says", async ({ app, page }) => {
      await app.open({
        name: "overview",
        scenario: "creator-hob",
        path: `/campaigns/${campaignId}`,
      });
      const posts: Array<{ readonly path: string; readonly body: string }> = [];
      page.on("request", (request) => {
        if (request.method() === "POST")
          posts.push({ path: new URL(request.url()).pathname, body: request.postData() ?? "" });
      });
      const posted = (suffix: string) => posts.filter((post) => post.path.endsWith(suffix));

      await page.locator("button[aria-pressed]").filter({ hasText: "Ask Hob" }).click();
      const panel = page.locator('section[aria-label="Hob"]');
      const cards = panel.locator("[data-slot=card]");
      const ask = async () => {
        await panel.getByRole("textbox", { name: "Ask Hob" }).fill("Who keeps the toll?");
        await panel.getByRole("button", { name: "Send" }).click();
        await expect(cards).toHaveCount(1);
        await expect(cards.getByText(TITLE)).toBeVisible();
      };
      const press = async (name: string) => {
        const control = cards.getByRole("button", { name });
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeEnabled();
        expect(await reachable(control), `a pointer at ${name} reaches it`).toBe(true);
        await control.click();
      };

      await test.step("Discard takes the card out of the thread", async () => {
        await ask();
        await press("Discard");
        await expect(cards).toHaveCount(0);
        expect(posted("/discard")).toHaveLength(1);
        expect(posted("/accept")).toHaveLength(0);
      });

      await test.step("Try again discards the card and asks for another", async () => {
        await ask();
        await press("Try again");
        await expect(
          panel.getByText(`Try again: another take on “${TITLE}”.`, { exact: true }),
        ).toBeVisible();
        await expect(cards).toHaveCount(1);
        expect(posted("/discard")).toHaveLength(2);
        const asks = posted("/ask");
        expect(asks).toHaveLength(3);
        expect(JSON.parse(asks[2]!.body)).toMatchObject({
          text: `Try again: another take on “${TITLE}”.`,
        });
      });

      await test.step("a kept card's Open it opens the note it made", async () => {
        await press("Save to session");
        await expect(cards.getByText("Saved")).toBeVisible();
        await press("Open it");
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === `/campaigns/${campaignId}/notes` && url.searchParams.has("note"),
        );
        // Overlaid, the panel covered the screen it opened, so it closes.
        if (width < INLINE_FROM) await expect(panel).toBeHidden();
        else await expect(panel).toBeVisible();
      });
    });
  });
}
