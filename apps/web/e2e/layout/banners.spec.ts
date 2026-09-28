import type { Locator } from "@playwright/test";
import { HEIGHT, WIDTHS, expect, screens, test } from "../support/app";

/**
 * The portrait bands (`party/SeatCard.tsx`, `cast/NpcCard.tsx`,
 * `cast/NpcDrawer.tsx`) at every width: a band draws the character's or the
 * NPC's 2:1 banner, never stretched (`object-fit: cover` over the whole band),
 * and keeps most of it, where the square it replaces kept well under half;
 * and a subject drawn before banners still fills its band with the square.
 * What is drawn, at what size and how much of it is cropped, is layout jsdom
 * does not compute.
 *
 * Read over the creator scenario: Sorrel's seat has a portrait and a banner,
 * Pell's a portrait only (`fullPartySeats`); Master Hollis has both
 * (`castShelf`). The stub serves each picture at its drawn shape.
 */

const party = screens.find((screen) => screen.name === "party")!;
const cast = screens.find((screen) => screen.name === "cast")!;

/** How much of a picture of this shape a band of that shape shows, by area. */
const kept = (band: number, picture: number) => Math.min(band, picture) / Math.max(band, picture);

/** The picture in a band once it has loaded, measured against the band it fills. */
const measure = async (band: Locator) => {
  const img = band.locator("img");
  await expect(img).toHaveAttribute("data-loaded", "");
  return img.evaluate((el) => {
    const image = el as HTMLImageElement;
    // The band's padding box, inside its border, is what the picture fills.
    const frame = image.parentElement!.parentElement!;
    const rect = image.getBoundingClientRect();
    return {
      src: image.currentSrc,
      fit: getComputedStyle(image).objectFit,
      natural: image.naturalWidth / image.naturalHeight,
      band: frame.clientWidth / frame.clientHeight,
      fills:
        Math.abs(rect.width - frame.clientWidth) < 1 &&
        Math.abs(rect.height - frame.clientHeight) < 1,
    };
  });
};

const assertBanner = (drawn: Awaited<ReturnType<typeof measure>>, route: string, label: string) => {
  expect.soft(drawn.src, `${label} draws the banner`).toContain(route);
  expect.soft(drawn.fit, `${label} is covered, not stretched`).toBe("cover");
  expect.soft(drawn.fills, `${label} fills its band`).toBe(true);
  expect.soft(drawn.natural, `${label} is 2:1`).toBeCloseTo(2, 2);
  // The bands run from about 1.8:1 to 2.5:1, so a 2:1 banner keeps at least
  // three quarters of itself; the square kept under half.
  expect.soft(kept(drawn.band, drawn.natural), `${label} kept`).toBeGreaterThan(0.75);
};

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test("portrait bands", async ({ app, page }) => {
      await app.open(party);
      const seat = (name: string) =>
        page
          .locator('[data-slot="seat-card"]')
          .filter({ has: page.getByRole("link", { name }) })
          .locator(":scope > div")
          .first();

      await test.step("a seat card's band draws the banner, whole and uncropped", async () => {
        const sorrel = seat("Sorrel");
        await sorrel.scrollIntoViewIfNeeded();
        assertBanner(await measure(sorrel), "/portrait-banners/", "Sorrel's band");
      });

      await test.step("a seat drawn before banners fills its band with the square", async () => {
        const pell = seat("Pell");
        await pell.scrollIntoViewIfNeeded();
        const drawn = await measure(pell);
        expect.soft(drawn.src, "Pell's band draws the square").toContain("/portraits/");
        expect.soft(drawn.fit, "the square is covered, not stretched").toBe("cover");
        expect.soft(drawn.fills, "the square fills its band").toBe(true);
      });

      await app.go(cast.path);
      const hollis = page
        .locator('[data-slot="npc-card"]')
        .filter({ has: page.getByRole("link", { name: "Master Hollis" }) });

      await test.step("a cast card's band draws the banner, whole and uncropped", async () => {
        const band = hollis.locator(":scope > div").first();
        await band.scrollIntoViewIfNeeded();
        assertBanner(await measure(band), "/npc-banners/", "Hollis's band");
      });

      await test.step("the NPC drawer's header draws the banner, whole and uncropped", async () => {
        await hollis.getByRole("link", { name: "Master Hollis" }).click();
        const drawer = page.locator('[data-slot="npc-drawer"]');
        await expect(drawer).toBeVisible();
        const header = drawer.locator("div.h-cast-drawer-portrait");
        assertBanner(await measure(header), "/npc-banners/", "the drawer's header");
      });
    });
  });
}
