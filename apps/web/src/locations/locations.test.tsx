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
import { gullportId, lambId, libraryShelf, partyMoves, stacksId } from "./locations.fixtures";

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

describe("a place's map", () => {
  it("pins the places inside it, and its owner takes one off", async () => {
    server.routes.set(`PATCH /library/locations/${stacksId}`, {
      status: 200,
      body: { ...libraryShelf[1], pin: null },
    });
    await at(`/library/locations/${gullportId}`);

    const map = await screen.findByRole("application", { name: "Map of Gullport" });
    expect(within(map).getByRole("button", { name: /The Stacks/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Take off the map" }));
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "PATCH").map((call) => call.body),
      ).toEqual([JSON.stringify({ pin: null })]),
    );
  });

  it("offers a place that has never had a picture its one draw", async () => {
    server.routes.set(`POST /library/locations/${stacksId}/draw`, {
      status: 200,
      body: { ...libraryShelf[1], imagePending: true, pictured: true },
    });
    await at(`/library/locations/${stacksId}`);

    await userEvent.click(await screen.findByRole("button", { name: "Draw it" }));
    await waitFor(() => expect(calls("POST")).toEqual([`/library/locations/${stacksId}/draw`]));
    // A place with a picture offers no draw: there is no redraw.
    cleanup();
    await at(`/library/locations/${gullportId}`);
    await screen.findByRole("application", { name: "Map of Gullport" });
    expect(screen.queryByRole("button", { name: "Draw it" })).toBeNull();
  });

  it("zooms into a pin at the table, which opens the map inside it", async () => {
    await at(`/campaigns/${campaignId}/locations?place=${gullportId}`);

    const map = await screen.findByRole("application", { name: "Map of Gullport" });
    await userEvent.click(within(map).getByRole("button", { name: "Open The Stacks" }));
    await waitFor(() => expect(globalThis.location.search).toBe(`?place=${stacksId}`));
    // The Stacks has no picture yet, and says so where its map would be.
    await screen.findByText("No picture yet");
  });
});

describe("the party on the map", () => {
  it("is marked on the pin it stands in, and the creator moves it to another place", async () => {
    server.routes.set(`POST /campaigns/${campaignId}/party-travel`, {
      status: 200,
      body: { ...partyMoves[0], id: "6c0c0000-0000-4000-8000-0000000000b3", locationId: lambId },
    });
    await at(`/campaigns/${campaignId}/locations?place=${gullportId}`);

    const map = await screen.findByRole("application", { name: "Map of Gullport" });
    expect(
      within(map)
        .getByRole("button", { name: /The Stacks/ })
        .hasAttribute("data-party"),
    ).toBe(true);
    const log = screen.getByRole("region", { name: "Where the party has been" });
    expect(within(log).getAllByRole("listitem")[0]?.textContent).toContain("The Stacks");

    const tree = screen.getByRole("list", { name: "Places at this table" });
    const lambRow = within(tree).getByText("The Drowned Lamb").closest("[data-slot=place-row]")!;
    await userEvent.click(
      within(lambRow as HTMLElement).getByRole("button", { name: "Move the party here" }),
    );
    await waitFor(() =>
      expect(
        server.calls
          .filter((call) => call.method === "POST")
          .map((call) => [call.pathname, call.body]),
      ).toEqual([
        [`/campaigns/${campaignId}/party-travel`, JSON.stringify({ locationId: lambId })],
      ]),
    );
  });

  it("tells a player where the party is, without naming a place they were not shown", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "player", sharedWorld, joinedAt: "2026-09-01T12:00:00.000Z" }],
    });
    await at(`/campaigns/${campaignId}/locations`);

    const log = await screen.findByRole("region", { name: "Where the party has been" });
    expect(within(log).getAllByRole("listitem")[0]?.textContent).toContain("The Stacks");
    expect(within(log).queryAllByRole("link")).toEqual([]);
    expect(within(log).queryByRole("button", { name: /Take back/ })).toBeNull();
    expect(calls("GET")).not.toContain(`/campaigns/${campaignId}/party-travel`);
  });
});

describe("laying out a map before it is drawn", () => {
  it("gives its owner a blank canvas to put the places inside it on", async () => {
    await at(`/library/locations/${stacksId}`);

    const map = await screen.findByRole("application", { name: "Map of The Stacks" });
    expect(map.querySelector("[data-slot=place-canvas]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Put on the map" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Draw it" })).toBeEnabled();
  });
});
