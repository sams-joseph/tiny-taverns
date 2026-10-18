import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  campaign,
  campaignId,
  installStubServer,
  sharedWorld,
  worldId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";
import { gullportId } from "./locations.fixtures";

/**
 * Places on screen: the creator's tree with this table's reveals and their
 * own placements, the player's narrow list, and the shelf's delete, which
 * names every table the place is in before it goes.
 */

const server = installStubServer();

beforeEach(() => server.reset());
afterEach(cleanup);

const at = (path: string) =>
  renderAt(path, (route) => (
    <HostedSessionScope session={TEST_SESSION}>{route}</HostedSessionScope>
  ));

const calls = (method: string) =>
  server.calls.filter((call) => call.method === method).map((call) => call.pathname);

describe("a table's places, for its creator", () => {
  it("nests the world's places, reveals one and takes the creator's own back out", async () => {
    server.routes.set(`PUT /campaigns/${campaignId}/locations/${gullportId}/reveal`, {
      status: 204,
      body: undefined,
    });
    server.routes.set(`DELETE /campaigns/${campaignId}/locations/${gullportId}/placement`, {
      status: 204,
      body: undefined,
    });
    await at(`/campaigns/${campaignId}/locations`);

    const tree = await screen.findByRole("list", { name: "Places at this table" });
    // The district sits inside the town, the tavern inside the district.
    const town = within(tree).getByText("Gullport").closest("li")!;
    expect(within(town).getByText("The Stacks")).toBeTruthy();
    expect(within(town).getByText("The Drowned Lamb")).toBeTruthy();
    // Another creator's place says whose it is, and offers no *Take out*.
    const marsh = within(tree).getByText("Blackwater Marsh").closest("[data-slot=place-row]")!;
    expect(within(marsh as HTMLElement).getByText("From Tamsin Reed")).toBeTruthy();
    expect(within(marsh as HTMLElement).queryByRole("button", { name: "Take out" })).toBeNull();

    const townRow = within(tree).getByText("Gullport").closest("[data-slot=place-row]")!;
    await userEvent.click(within(townRow as HTMLElement).getByRole("button", { name: /Hidden/ }));
    await waitFor(() =>
      expect(calls("PUT")).toEqual([`/campaigns/${campaignId}/locations/${gullportId}/reveal`]),
    );

    await userEvent.click(within(townRow as HTMLElement).getByRole("button", { name: "Take out" }));
    await waitFor(() =>
      expect(calls("DELETE")).toEqual([
        `/campaigns/${campaignId}/locations/${gullportId}/placement`,
      ]),
    );
    // Only a place the creator placed themselves has the button.
    const stacksRow = within(tree).getByText("The Stacks").closest("[data-slot=place-row]")!;
    expect(within(stacksRow as HTMLElement).queryByRole("button", { name: "Take out" })).toBeNull();
  });
});

describe("a table's places, for a player", () => {
  it("reads the narrow list and never the creator's", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "player", sharedWorld, joinedAt: "2026-09-01T12:00:00.000Z" }],
    });
    await at(`/campaigns/${campaignId}/locations`);

    const list = await screen.findByRole("list", { name: "Places you know" });
    expect(within(list).getByText("The Drowned Lamb")).toBeTruthy();
    expect(within(list).queryByText("Gullport")).toBeNull();
    expect(calls("GET")).toContain(`/campaigns/${campaignId}/player-locations`);
    expect(calls("GET")).not.toContain(`/campaigns/${campaignId}/locations`);
  });
});

describe("the Library's Locations shelf", () => {
  it("names every table a place is in before deleting it and everything inside it", async () => {
    server.routes.set(`GET /library/locations/${gullportId}/appearances`, {
      status: 200,
      body: [
        {
          contextId: worldId,
          worldName: "The Drowned Coast",
          campaigns: [{ id: campaignId, name: "The Salt Road" }],
        },
      ],
    });
    server.routes.set(`DELETE /library/locations/${gullportId}`, { status: 204, body: undefined });
    await at("/library/locations");

    await userEvent.click(await screen.findByRole("button", { name: "Delete Gullport" }));
    const dialog = await screen.findByRole("dialog", { name: /Delete Gullport/ });
    await within(dialog).findByText("The Drowned Coast: The Salt Road");
    expect(dialog.textContent).toContain("the 2 places inside it are deleted");

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete place" }));
    await waitFor(() => expect(calls("DELETE")).toEqual([`/library/locations/${gullportId}`]));
  });
});
