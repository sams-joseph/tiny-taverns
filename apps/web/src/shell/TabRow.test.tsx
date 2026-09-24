import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaignId, installStubServer } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * The collapsing tab row, through the row that needs it most: the creator's
 * campaign row, whose six tabs and press do not fit a phone.
 *
 * jsdom applies no container query, so every item and every band's *More* is
 * in the document here and the widths are the Playwright suite's
 * (`apps/web/e2e/`). What is pinned is the plan the classes carry: which
 * items leave the row at which step, and that the trigger shown at each step
 * holds exactly those.
 */

const server = installStubServer();

beforeEach(() => server.reset());
afterEach(cleanup);

const nav = () => screen.getByRole("navigation", { name: "This campaign" });
const triggers = () => within(nav()).getAllByRole("button", { name: "More of this campaign" });

describe("the campaign row's collapse", () => {
  it("keeps Overview and Encounters, and moves the rest to More in the stated order", async () => {
    await renderAt(`/campaigns/${campaignId}/chronicle`);
    await screen.findByRole("heading", { level: 1, name: "Chronicle" });

    const tab = (name: string) => within(nav()).getByRole("link", { name });
    expect(tab("Overview").className).not.toMatch(/@max-\w+:hidden/);
    expect(tab("Encounters").className).not.toMatch(/@max-\w+:hidden/);
    expect(tab("Cast")).toHaveClass("@max-xl:hidden");
    expect(tab("Chronicle")).toHaveClass("@max-xl:hidden");
    expect(tab("Party")).toHaveClass("@max-lg:hidden");
    expect(tab("Notes")).toHaveClass("@max-lg:hidden");

    // One trigger per step of the ladder that hides something, each displayed
    // in its own band only, and lit, because the Chronicle is in each. `md`
    // hides nothing new, so the narrowest band's trigger holds what `lg`'s does.
    expect(triggers()).toHaveLength(3);
    const [wide, narrow, narrowest] = triggers();
    expect(wide).toHaveClass("hidden", "@lg:@max-xl:flex");
    expect(narrow).toHaveClass("hidden", "@md:@max-lg:flex");
    expect(narrowest).toHaveClass("hidden", "@max-md:flex");
    for (const trigger of triggers()) expect(trigger).toHaveAttribute("data-active");

    await userEvent.click(wide!);
    const short = await screen.findByRole("menu");
    expect(
      within(short)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Cast", "Chronicle"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    await userEvent.click(narrowest!);
    const all = await screen.findByRole("menu");
    expect(
      within(all)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Party", "Notes", "Cast", "Chronicle"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    await userEvent.click(narrow!);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Party", "Notes", "Cast", "Chronicle"]);
    expect(within(menu).getByRole("menuitem", { name: "Chronicle" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // A menu item is a real link to the tab it stands for.
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Notes" }));
    await screen.findByRole("heading", { level: 1, name: "Notes" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("does not light More when the page is on the row", async () => {
    await renderAt(`/campaigns/${campaignId}/encounters`);
    await screen.findByRole("heading", { level: 1, name: "Encounters" });
    for (const trigger of triggers()) expect(trigger).not.toHaveAttribute("data-active");
  });
});
