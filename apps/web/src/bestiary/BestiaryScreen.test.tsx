import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  page,
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
const VOCABULARY = `GET /campaigns/${campaignId}/creatures/environments`;

/** What the whole reachable set answers with: the DM's own, then the bundled two. */
const wholeBestiary = () =>
  server.routes.set(LIST, { status: 200, body: page([bandit, goblin, hag]) });

beforeEach(() => {
  server.reset();
  wholeBestiary();
  // The chip row is its own read now — over the corpus rather than over an
  // answer, which is what a paged list forced. See `bestiary/load.ts`.
  server.routes.set(VOCABULARY, { status: 200, body: ["Marsh", "River"] });
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

    server.routes.set(LIST, { status: 200, body: page([goblin]) });
    await userEvent.type(screen.getByRole("textbox", { name: "Search creatures" }), "nimble");

    // The whole point: "nimble escape" is a *trait*, in no column, and only the
    // server's second matcher can find it. A local substring filter over the
    // loaded list would have answered nothing.
    await waitFor(() => expect(lastQuery().get("q")).toBe("nimble"));
    await waitFor(() => expect(screen.queryByText("Saltmarsh Bandit")).toBeNull());
    expect(screen.getByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.getByText("1 creature matches what you're looking for")).toBeInTheDocument();
  });

  it("sends one environment chip to the server — the case the wire used to refuse", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    // **The defect, from the client's side.** `UrlParams.fromInput` emits one
    // `?environments=River` for a one-element array and the server read it as a
    // scalar, so a single chip was a 400 and the screen filtered what it already
    // had instead. `queryArray` in `packages/api` is the fix, and it had to
    // arrive with pagination: a chip applied to a *page* filters twenty-four
    // rows and calls the result the list.
    server.routes.set(LIST, { status: 200, body: page([bandit]) });
    await userEvent.click(screen.getByRole("button", { name: "River" }));

    await waitFor(() => expect(lastQuery().getAll("environments")).toEqual(["River"]));
    await waitFor(() => expect(screen.queryByText("Goblin Boss")).toBeNull());
    expect(screen.getByText("Saltmarsh Bandit")).toBeInTheDocument();
    expect(screen.getByText("1 creature matches what you're looking for")).toBeInTheDocument();

    // Any-of, so a second chip widens rather than narrows — and reaches the wire
    // as two occurrences of the same key.
    server.routes.set(LIST, { status: 200, body: page([bandit, goblin, hag]) });
    await userEvent.click(screen.getByRole("button", { name: "Marsh" }));
    await waitFor(() =>
      expect([...lastQuery().getAll("environments")].sort()).toEqual(["Marsh", "River"]),
    );
    expect(await screen.findByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.getByText("Saltmarsh Bandit")).toBeInTheDocument();
  });

  it("keeps every chip on the row once a filter narrows the list", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    // Only the bandit is left, and it lives in River alone — but the row must
    // still offer Marsh, or there is no way back out of the filter. That is why
    // the vocabulary is a read over the corpus rather than a fold over the
    // answers: the narrowed answer no longer mentions Marsh at all.
    server.routes.set(LIST, { status: 200, body: page([bandit]) });
    await userEvent.click(screen.getByRole("button", { name: "River" }));

    await waitFor(() => expect(screen.queryByText("Goblin Boss")).toBeNull());
    for (const environment of ["Marsh", "River"]) {
      expect(screen.getByRole("button", { name: environment })).toBeInTheDocument();
    }
  });

  it("reads the next page when asked, and says the list is only the first of them", async () => {
    const cursor = "eyJvIjoiY3IiLCJrIjpbMSwiR29ibGluIEJvc3MiLCJ4Il19";
    server.routes.set(LIST, { status: 200, body: page([bandit, goblin], cursor) });
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    expect(screen.getByText("The first 2 creatures")).toBeInTheDocument();
    expect(screen.queryByText("Marsh Hag")).toBeNull();

    server.routes.set(LIST, { status: 200, body: page([hag]) });
    await userEvent.click(screen.getByRole("button", { name: /Show more/ }));

    // The cursor the server minted goes back exactly as it came, and the rows
    // are appended rather than replacing what is on screen.
    await waitFor(() => expect(lastQuery().get("cursor")).toBe(cursor));
    expect(await screen.findByText("Marsh Hag")).toBeInTheDocument();
    expect(screen.getByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(
      screen.getByText("3 creatures — this campaign's own, and the shared corpus"),
    ).toBeInTheDocument();
  });

  it("throws away the pages it read when the query changes", async () => {
    const cursor = "eyJvIjoiY3IiLCJrIjpbMSwiR29ibGluIEJvc3MiLCJ4Il19";
    server.routes.set(LIST, { status: 200, body: page([bandit, goblin], cursor) });
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    server.routes.set(LIST, { status: 200, body: page([hag]) });
    await userEvent.click(screen.getByRole("button", { name: /Show more/ }));
    expect(await screen.findByText("Marsh Hag")).toBeInTheDocument();

    // A page belongs to the query it was read for. Typing a new one must not
    // leave the old rows underneath the new list.
    server.routes.set(LIST, { status: 200, body: page([goblin]) });
    await userEvent.type(screen.getByRole("textbox", { name: "Search creatures" }), "gob");

    await waitFor(() => expect(screen.queryByText("Marsh Hag")).toBeNull());
    expect(screen.getByText("Goblin Boss")).toBeInTheDocument();
    expect(screen.queryByText("Saltmarsh Bandit")).toBeNull();
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
    server.routes.set(LIST, { status: 200, body: page([]) });
    server.routes.set(VOCABULARY, { status: 200, body: [] });
    await renderBestiary(mintingSession());

    expect(await screen.findByText("Nothing lives here")).toBeInTheDocument();
    expect(screen.getByText(/has not been imported/)).toBeInTheDocument();
    expect(screen.getByText("pnpm -F server bestiary:import")).toBeInTheDocument();
  });

  it("says something different when it is the filter that emptied the list", async () => {
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    server.routes.set(LIST, { status: 200, body: page([]) });
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

  it("hangs a way back to the campaign in the campaign row, and lights its Overview", async () => {
    await renderBestiary(mintingSession());

    // **The way back is the campaign row's title since the sixth delivery**,
    // and the shell builds the link rather than this screen passing one. Its
    // accessible name carries the campaign *and* what pressing it does, because
    // the visible name is hidden on a narrow bar and the back-chevron is then
    // the whole control — a label that was only the campaign's name would leave
    // that state saying nothing.
    const back = await screen.findByRole("link", { name: "The Salt Road — campaign home" });
    expect(back).toHaveAttribute("href", `/#/campaigns/${campaignId}`);

    // **This screen is no longer an item on the row**, since the Library took
    // it up a tier — so it lights the campaign's Overview, the way a fight does.
    // A section with no item would leave the row dark inside a campaign.
    expect(screen.queryByRole("link", { name: "Bestiary" })).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("still answers what this one campaign reaches, which the Library cannot be asked", async () => {
    // The reason the route survived the item moving: `creatures.list` is
    // campaign-scoped by path, and `LibraryFilter` — a search, the chips and a
    // sort — carries no campaign narrowing at all. This list is the only place
    // the question gets an answer.
    await renderBestiary(mintingSession());
    await screen.findByText("Goblin Boss");

    expect(server.calls.some((call) => call.pathname === "/library/creatures")).toBe(false);
    expect(
      server.calls.some((call) => call.pathname === `/campaigns/${campaignId}/creatures`),
    ).toBe(true);
  });
});
