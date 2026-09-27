import type { Locator } from "@playwright/test";
import { HEIGHT, expect, screens, test } from "../support/app";

/**
 * A text-entry field is filled darker than the surface it sits on: the
 * delivery's "wells (inputs, footers) are `--surface-sunken`". Drawn in
 * `--surface-card`, an input vanished into the card or dialog around it, which
 * are that same colour.
 *
 * jsdom resolves no Tailwind and no token, so it cannot see the failure this
 * guards: a field class that applies and resolves to its container's colour.
 */

/**
 * The relative luminance of an element's own fill, and of the nearest
 * ancestor that paints one: the surface the field is seen against.
 */
const luminances = (field: Locator) =>
  field.evaluate((el) => {
    const luminance = (color: string) => {
      const [r, g, b] = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((part) => {
          const c = Number(part) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const painted = (node: Element) => {
      const color = getComputedStyle(node).backgroundColor;
      return color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color);
    };
    let surface = el.parentElement;
    while (surface !== null && !painted(surface)) surface = surface.parentElement;
    return {
      field: luminance(getComputedStyle(el).backgroundColor),
      surface: luminance(getComputedStyle(surface ?? document.body).backgroundColor),
    };
  });

const campaigns = screens.find((screen) => screen.name === "campaigns")!;
const challenge = screens.find((screen) => screen.name === "run-challenge")!;

test.describe("1440px", () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } });

  test("the New campaign dialog's fields", async ({ app, page }) => {
    await app.open(campaigns);
    await page.getByRole("button", { name: "New campaign" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await app.settle();

    for (const label of ["New campaign name", "New campaign description"]) {
      const { field, surface } = await luminances(dialog.getByRole("textbox", { name: label }));
      expect.soft(field, `${label} against the dialog`).toBeLessThan(surface);
    }
  });

  test("the Make a check card's fields", async ({ app, page }) => {
    await app.open(challenge);
    const card = page.getByRole("region", { name: "Make a check" });
    await expect(card).toBeVisible();
    await app.settle();

    const { field, surface } = await luminances(card.getByRole("textbox").first());
    expect.soft(field, "a field against the card").toBeLessThan(surface);
  });
});
