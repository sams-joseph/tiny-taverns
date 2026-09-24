import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  archivedCampaign,
  campaign,
  campaignId,
  sharedWorldDetails,
  worldId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  renderCampaigns,
  renderScreen,
  renderSharedWorld,
} from "./campaign.fixtures";

/**
 * Deleting a campaign or a Shared World for good.
 *
 * Three things are under test, and each would rot silently: the controls sit
 * where the captain asked (inside the campaign; on a Shared World card's own
 * menu, which does not open the world; on both archived shelves), the delete
 * is armed only by typing the name exactly, and the dialog says what goes,
 * what stays and that archiving is the reversible alternative.
 */

const server = installStubServer();
installMemoryStorage();

const campaignDelete = `/campaigns/${campaignId}/permanent`;
const worldDelete = `/worlds/${worldId}/permanent`;

const paths = (method: string) =>
  server.calls.filter((call) => call.method === method).map((call) => call.pathname);

/** The fixture campaign with no night open, so nothing but the name gates it. */
const noNight = () =>
  server.routes.set(`GET /campaigns/${campaignId}`, {
    status: 200,
    body: { ...campaign, currentSessionId: null },
  });

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  server.routes.set(`DELETE ${campaignDelete}`, { status: 204, body: undefined });
  server.routes.set(`DELETE ${worldDelete}`, { status: 204, body: undefined });
});

const openCampaignDelete = async () => {
  await renderScreen(mintingSession());
  await userEvent.click(await screen.findByRole("button", { name: "Campaign actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete permanently" }));
  return screen.findByRole("dialog", { name: /Delete The Salt Road permanently/ });
};

describe("deleting a campaign from inside it", () => {
  it("arms the delete only when the name is typed exactly", async () => {
    noNight();
    const dialog = await openCampaignDelete();
    const button = within(dialog).getByRole("button", { name: "Delete permanently" });
    const field = within(dialog).getByLabelText("Type The Salt Road to confirm");

    expect(button).toBeDisabled();
    await userEvent.type(field, "the salt road");
    expect(button).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, "The Salt Roa");
    expect(button).toBeDisabled();
    expect(paths("DELETE")).toEqual([]);

    await userEvent.type(field, "d");
    expect(button).toBeEnabled();
  });

  it("says what goes, what stays, and that archiving can be undone", async () => {
    noNight();
    const dialog = await openCampaignDelete();

    expect(within(dialog).getByText("Delete The Salt Road permanently?")).toBeTruthy();
    expect(dialog.textContent).toContain("This cannot be undone.");
    expect(dialog.textContent).toContain("Archiving keeps everything and can be reversed");
    expect(dialog.textContent).toContain("Characters belong to their players and are kept");
  });

  it("deletes, and returns to the campaign list", async () => {
    noNight();
    const dialog = await openCampaignDelete();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Road");
    server.routes.set("GET /me/campaigns", { status: 200, body: [] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([campaignDelete]));
    await waitFor(() => expect(globalThis.location.hash).toBe("#/campaigns"));
    expect(await screen.findByText("No campaign yet")).toBeTruthy();
  });

  it("refuses while a night is open, and says to finish it", async () => {
    // The fixture campaign points at an open night, which the server refuses.
    const dialog = await openCampaignDelete();

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A night is still open here. Finish it before deleting the campaign.",
    );
    expect(within(dialog).getByLabelText(/to confirm/)).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  });

  it("offers archiving instead, and switches to it", async () => {
    noNight();
    const dialog = await openCampaignDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive instead" }));

    expect(await screen.findByText("Archive The Salt Road?")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Delete The Salt Road permanently/ })).toBeNull();
    expect(paths("DELETE")).toEqual([]);
  });

  it("is also reached from the campaign's settings", async () => {
    noNight();
    await renderScreen(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /campaign settings/ }));
    const settings = await screen.findByRole("dialog", { name: "Campaign settings" });
    await userEvent.click(within(settings).getByRole("button", { name: "Delete permanently" }));

    expect(
      await screen.findByRole("dialog", { name: /Delete The Salt Road permanently/ }),
    ).toBeTruthy();
  });

  it("stays open and says so when the server refuses", async () => {
    noNight();
    server.routes.set(`DELETE ${campaignDelete}`, {
      status: 409,
      body: { _tag: "Conflict", message: "a night is still open at this table" },
    });
    const dialog = await openCampaignDelete();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Road");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([campaignDelete]));
    expect(screen.getByRole("dialog", { name: /Delete The Salt Road permanently/ })).toBeTruthy();
    expect(globalThis.location.hash).toBe(`#/campaigns/${campaignId}`);
  });
});

describe("the archived campaigns shelf", () => {
  it("deletes a shelved campaign through the same typed-name confirmation", async () => {
    server.routes.set("GET /me/campaigns/archived", {
      status: 200,
      body: [
        {
          campaign: { ...archivedCampaign, currentSessionId: null },
          relation: "creator",
          sharedWorld: null,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...archivedCampaign, currentSessionId: null },
    });
    await renderCampaigns("/campaigns", mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /Archived campaigns/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete permanently: The Salt Road" }),
    );

    const dialog = await screen.findByRole("dialog", { name: /Delete The Salt Road permanently/ });
    // Already archived: restoring is the way back, and there is nothing to archive.
    expect(dialog.textContent).toContain("Restoring keeps everything");
    expect(within(dialog).queryByRole("button", { name: "Archive instead" })).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Road");
    server.routes.set("GET /me/campaigns/archived", { status: 200, body: [] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([campaignDelete]));
    // The shelf re-reads and says so.
    expect(await screen.findByText(/Nothing here\./)).toBeTruthy();
  });
});

describe("deleting a Shared World", () => {
  it("puts the owner's archive and delete on the card's own menu, which does not open it", async () => {
    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for The Salt Company" }),
    );

    expect(await screen.findByRole("menuitem", { name: "Archive" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete permanently" })).toBeTruthy();
    expect(globalThis.location.hash).toBe("#/worlds");
  });

  it("offers no menu on a world somebody else owns", async () => {
    server.routes.set("GET /worlds", {
      status: 200,
      body: [
        {
          sharedWorld: {
            ...sharedWorldDetails,
            ownerAccountId: "5a1e2b3c-0000-4000-8000-0000000000ff",
          },
          isOwner: false,
          joinedAt: campaign.createdAt,
        },
      ],
    });
    await renderCampaigns("/worlds", mintingSession());

    expect(await screen.findByText("The Salt Company")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("deletes from the card once the name is typed, and says its campaigns stay", async () => {
    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for The Salt Company" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete permanently" }));

    const dialog = await screen.findByRole("dialog", {
      name: /Delete The Salt Company permanently/,
    });
    expect(dialog.textContent).toContain("Its campaigns are not.");
    expect(dialog.textContent).toContain("Archiving keeps everything and can be reversed");
    const button = within(dialog).getByRole("button", { name: "Delete permanently" });
    expect(button).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Company");
    server.routes.set("GET /worlds", { status: 200, body: [] });
    await userEvent.click(button);

    await waitFor(() => expect(paths("DELETE")).toEqual([worldDelete]));
    expect(await screen.findByText("No Shared World yet")).toBeTruthy();
  });

  it("deletes from the world's own screen and returns to the list", async () => {
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Shared World actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete permanently" }));
    const dialog = await screen.findByRole("dialog", {
      name: /Delete The Salt Company permanently/,
    });
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Company");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([worldDelete]));
    await waitFor(() => expect(globalThis.location.hash).toBe("#/worlds"));
  });

  it("is also reached from the world's settings", async () => {
    await renderSharedWorld(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Shared World settings" }));
    const settings = await screen.findByRole("dialog", { name: "Shared World settings" });
    await userEvent.click(within(settings).getByRole("button", { name: "Delete permanently" }));

    expect(
      await screen.findByRole("dialog", { name: /Delete The Salt Company permanently/ }),
    ).toBeTruthy();
  });

  it("deletes a shelved world from the archived shelf", async () => {
    const shelved = {
      ...sharedWorldDetails,
      archivedAt: "2026-08-11T09:00:00.000Z",
    };
    server.routes.set("GET /worlds/archived", { status: 200, body: [shelved] });
    await renderCampaigns("/worlds", mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: /Archived Shared Worlds/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete permanently: The Salt Company" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Delete The Salt Company permanently/,
    });
    expect(dialog.textContent).toContain("Restoring it from the shelf keeps everything");
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), "The Salt Company");
    server.routes.set("GET /worlds/archived", { status: 200, body: [] });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(paths("DELETE")).toEqual([worldDelete]));
    expect(await screen.findByText(/Nothing here\./)).toBeTruthy();
  });
});
