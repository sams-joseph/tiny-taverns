import { accountName, expect, signIn, test } from "./support/fixtures";

/**
 * Two people, two browsers: the DM makes a campaign and an invitation, the
 * player signs in and follows the link, and the DM's Party then shows them.
 * Each browser context is its own Clerk client, so each holds its own session.
 */

test("a player follows an invitation into the DM's party", async ({ browser }) => {
  const campaign = `The Salt Road ${String(Date.now())}`;

  const dmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  try {
    const dm = await dmContext.newPage();
    await signIn(dm, "dm");

    await test.step("the DM creates a campaign", async () => {
      await dm.getByRole("button", { name: "New campaign" }).click();
      await dm.getByRole("textbox", { name: "New campaign name" }).fill(campaign);
      await dm.getByRole("button", { name: "Start a campaign" }).click();
      await expect(dm).toHaveURL(/\/campaigns\/[^/]+$/);
    });

    const link = await test.step("and invites a player from the Party", async () => {
      await dm.goto(`${new URL(dm.url()).pathname}/party`);
      await dm.getByRole("button", { name: "Invite player" }).click();
      await dm.getByRole("textbox", { name: "Who is it for?" }).fill("The player");
      await dm.getByRole("button", { name: "Make a link" }).click();
      const shown = dm.getByRole("dialog").locator("code");
      await expect(shown).toContainText("/join/");
      return new URL((await shown.textContent()) ?? "").pathname;
    });

    const player = await playerContext.newPage();
    const playerName = await test.step("the player signs in and takes the seat", async () => {
      await signIn(player, "player");
      const name = await accountName(player);
      await player.goto(link);
      await expect(player.getByText(`has invited you to join ${campaign}.`)).toBeVisible();
      await player.getByRole("button", { name: "Take your seat" }).click();
      await expect(player.getByText(`Your seat at ${campaign} is ready`)).toBeVisible();
      return name;
    });

    await test.step("the DM's Party shows the player", async () => {
      await dm.reload();
      // Joined with no character yet: not a card, a line under *Not playing yet*.
      await expect(dm.getByText("Nobody has a character here yet")).toBeVisible();
      const waiting = dm.getByRole("region", { name: "Not playing yet" });
      const joined = waiting.getByText("No character", { exact: true });
      await expect(joined).toBeVisible();
      await expect(joined.locator("xpath=..")).toContainText(playerName);
    });
  } finally {
    await dmContext.close();
    await playerContext.close();
  }
});
