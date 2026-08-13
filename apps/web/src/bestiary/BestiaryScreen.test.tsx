import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
} from "../campaign/campaign.fixtures";
import { bandit, goblin, hag, renderBestiary } from "./bestiary.fixtures";

/**
 * The bestiary, against a stubbed wire decoded by the real client.
 *
 * Two properties matter more here than anywhere else in the app and are what
 * most of this file is about:
 *
 *  - **the controls reach the server**, because half the search is full text
 *    over the stat block and a local `.filter` would silently lose it, and
 *  - **provenance is visible**, because one grid holds bundled `system` rows and
 *    the DM's own, and only one of the two is theirs to change.
 */

const server = installStubServer();
installMemoryStorage();

const LIST = `GET /campaigns/${campaignId}/creatures`;

/** What the whole reachable set answers with: the DM's own, then the bundled two. */
const wholeBestiary = () => server.routes.set(LIST, { status: 200, body: [bandit, goblin, hag] });

beforeEach(() => {
  server.reset();
  wholeBestiary();
  window.localStorage.clear();
});

/** The querystring of the last creature list the screen asked for. */
const lastQuery = (): URLSearchParams => {
  const calls = server.calls.filter((call) => call.pathname.endsWith("/creatures"));
  return new URLSearchParams(calls[calls.length - 1]?.search ?? "");
};

describe("BestiaryScreen", () => {
  it("renders the row half of every creature the campaign can reach", async () => {
    await renderBestiary(mintingSession());

    expect(await screen.findByRole("heading", { name: "Bestiary" })).toBeInTheDocument();

    // The card is the *row* form — the integers that filter and sort — never the
    // document's "17 (chain shirt, shield)".
    const boss = (await screen.findByText("Goblin Boss")).closest("[data-slot='card']");
    expect(boss).not.toBeNull();
    expect(
      screen.getByText("3 creatures — this campaign's own, and the shared corpus"),
    ).toBeInTheDocument();

    const card = within(boss as HTMLElement);
    expect(card.getByText("CR 1")).toBeInTheDocument();
    expect(card.getByText("AC 17")).toBeInTheDocument();
    expect(card.getByText("21 hp")).toBeInTheDocument();
    // `size` and `type` are separate columns because this line is why.
    expect(card.getByText("Small Humanoid")).toBeInTheDocument();
    expect(card.getByText("Marsh")).toBeInTheDocument();

    // The rating as written, not as sorted: "1/4" is a string for this reason,
    // and `crSort` is the key beside it that orders it.
    expect(screen.getByText("CR 1/4")).toBeInTheDocument();
  });

  it("marks a bundled creature and leaves the DM's own unmarked", async () => {
    await renderBestiary(mintingSession());

    await screen.findByText("Goblin Boss");

    // Two bundled rows, one of the DM's. Absence of the mark is what says
    // "yours" — a badge on every row would say nothing.
    expect(screen.getAllByText("Shared corpus")).toHaveLength(2);

    const own = screen.getByText("Saltmarsh Bandit").closest("[data-slot='card']");
    expect(own).not.toBeNull();
    expect(within(own as HTMLElement).queryByText("Shared corpus")).toBeNull();
  });

  it("sends the search to the server rather than filtering what it already has", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    server.routes.set(LIST, { status: 200, body: [goblin] });
    await userEvent.type(screen.getByRole("textbox", { name: "Search creatures" }), "nimble");

    // The whole point: "nimble escape" is a *trait*, in no column, and only the
    // server's second matcher can find it. A local substring filter over the
    // loaded list would have answered nothing.
    await waitFor(() => expect(lastQuery().get("q")).toBe("nimble"));
    await waitFor(() => expect(screen.queryByText("Saltmarsh Bandit")).toBeNull());
    expect(screen.getByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.getByText("1 creature matches what you're looking for")).toBeInTheDocument();
  });

  it("filters by environment any-of, without asking the server again", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    // The chips are the vocabulary the loaded creatures actually use, not the
    // prototype's hard-coded four. `bandit` is the only River row.
    const requests = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "River" }));

    await waitFor(() => expect(screen.queryByText("Goblin Boss")).toBeNull());
    expect(screen.getByText("Saltmarsh Bandit")).toBeInTheDocument();
    expect(screen.getByText("1 creature matches what you're looking for")).toBeInTheDocument();
    // The chips do not reach the wire — a one-element array does not survive it
    // (`load.ts`), and it does not need to: every row carries its own
    // `environments`, so this costs no request at all.
    expect(server.calls.length).toBe(requests);

    // Any-of, so a second chip widens rather than narrows.
    await userEvent.click(screen.getByRole("button", { name: "Marsh" }));
    expect(await screen.findByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.getByText("Saltmarsh Bandit")).toBeInTheDocument();
  });

  it("keeps every chip on the row once a filter narrows the list", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    // Only the bandit is left, and it lives in River alone — but the row must
    // still offer Marsh, or there is no way back out of the filter.
    await userEvent.click(screen.getByRole("button", { name: "River" }));

    await waitFor(() => expect(screen.queryByText("Goblin Boss")).toBeNull());
    for (const environment of ["Marsh", "River"]) {
      expect(screen.getByRole("button", { name: environment })).toBeInTheDocument();
    }
  });

  it("orders through the server, because the CR sort is on a key the client has not got", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    expect(lastQuery().get("sort")).toBe("cr");

    await userEvent.click(screen.getByRole("combobox", { name: "Sort creatures" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sort: Name" }));

    await waitFor(() => expect(lastQuery().get("sort")).toBe("name"));
  });

  it("opens the document half in a panel, and says the bundled row is not theirs", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    await userEvent.click(screen.getByRole("button", { name: "Stat block for Goblin Boss" }));

    // The document, with the parenthetical that is the whole reason it is not
    // derived from the `ac` column beside it.
    expect(await screen.findByText("17 (chain shirt, shield)")).toBeInTheDocument();
    expect(screen.getByText("21 (6d6)")).toBeInTheDocument();
    expect(screen.getByText("1 (200 XP)")).toBeInTheDocument();
    expect(screen.getByText("Nimble Escape")).toBeInTheDocument();
    expect(screen.getByText("1d6+2")).toBeInTheDocument();

    // A `system` creature belongs to no campaign. The panel says so rather than
    // letting a DM assume it is theirs to change.
    expect(screen.getByText(/belongs to no campaign/)).toBeInTheDocument();
    expect(screen.getByText(/keeping a copy of your own/)).toBeInTheDocument();
    // Nothing here offers to edit it, because nothing behind this can.
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("says what a creature with no document has, instead of an empty block", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Marsh Hag");

    await userEvent.click(screen.getByRole("button", { name: "Stat block for Marsh Hag" }));

    expect(await screen.findByText(/Nothing is written on this one yet/)).toBeInTheDocument();
    // The columns still answer: the row half is real on its own.
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("draws the designers' empty state, and names how the corpus arrives", async () => {
    server.routes.set(LIST, { status: 200, body: [] });
    await renderBestiary(mintingSession());

    expect(await screen.findByText("Nothing lives here")).toBeInTheDocument();
    expect(screen.getByText(/has not been imported/)).toBeInTheDocument();
    expect(screen.getByText("pnpm -F server bestiary:import")).toBeInTheDocument();
  });

  it("says something different when it is the filter that emptied the list", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    server.routes.set(LIST, { status: 200, body: [] });
    await userEvent.type(screen.getByRole("textbox", { name: "Search creatures" }), "dragon");

    expect(await screen.findByText(/Loosen a filter/)).toBeInTheDocument();
    expect(screen.queryByText(/bestiary:import/)).toBeNull();

    // And there is a way back out of it.
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    wholeBestiary();
    await waitFor(() => expect(lastQuery().get("q")).toBe(""));
  });

  it("says where a credential comes from when there is none", async () => {
    server.routes.set(LIST, {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    await renderBestiary();

    expect(await screen.findByText("No credential yet")).toBeInTheDocument();
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeInTheDocument();
  });

  it("says the server did not answer, and offers to try again", async () => {
    server.transportDown = true;
    await renderBestiary(mintingSession());

    expect(await screen.findByText("The server did not answer")).toBeInTheDocument();

    server.transportDown = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Goblin Boss")).toBeInTheDocument();
  });

  it("hangs a way back to the campaign in the top nav, and lights Bestiary", async () => {
    await renderBestiary(mintingSession());

    const back = await screen.findByRole("link", { name: "The Salt Road" });
    expect(back).toHaveAttribute("href", `/#/campaigns/${campaignId}`);

    const nav = screen.getByRole("link", { name: "Bestiary" });
    expect(nav).toHaveAttribute("href", `/#/campaigns/${campaignId}/bestiary`);
    expect(nav).toHaveAttribute("aria-current", "page");
  });
});
