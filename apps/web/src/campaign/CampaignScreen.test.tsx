import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaign,
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  prepItemId,
  renderEncounters,
  renderNotes,
  renderScreen,
  sessionId,
  page,
} from "./campaign.fixtures";

/**
 * The campaign view *reading*, against a stubbed wire decoded by the real
 * client. The writes are `authoring.test.tsx`; the fixtures are shared.
 *
 * **The sixth delivery split this screen into three**, and these tests split
 * with it: what used to be a click on a tab is now a render at a URL. That is
 * the property the split was for, so asserting it this way is not a workaround
 * — a tab could not be linked to, bookmarked or reloaded into, and these can.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

describe("CampaignScreen", () => {
  it("renders the campaign the six endpoints describe", async () => {
    await renderScreen(mintingSession());

    // **The campaign's name is the campaign row's title now, not the page's
    // heading** — the bar has two rows since the sixth delivery and the lower
    // one is titled with the table you are in, which is also the way home. The
    // page's own heading is which of the campaign's screens this is.
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const home = screen.getByTitle("Campaign home");
    expect(home).toHaveTextContent("The Salt Road");
    expect(home).toHaveAttribute("href", `/#/campaigns/${campaignId}`);
    // The subtitle is assembled from two rows: the session's number, the
    // campaign's party name, and how many are at the table — that last one moved
    // here from the rail's footer when the rail became a top bar.
    expect(screen.getByText("Session 12 · The Gilded Spoon · 4 players")).toBeInTheDocument();

    // Twice, and both are the delivery's: the "Next session" card names the
    // first encounter as a stat, and the grid under it draws its card.
    expect(screen.getAllByText("Ambush in the reeds")).toHaveLength(2);
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Marsh")).toBeInTheDocument();
    // `sum(encounter_creature.count)` leads the description, as the prototype
    // draws it; the note hanging off this encounter follows.
    expect(screen.getByText("6 creatures · 1 note")).toBeInTheDocument();
    // Null difficulty is its own state, not a missing badge.
    expect(screen.getByText("Unrated")).toBeInTheDocument();
  });

  it("sets read-aloud prose apart, in the prose face", async () => {
    await renderNotes(mintingSession());

    const prose = await screen.findByText(/The reeds are taller than you are/);
    // `--type-read-aloud`: italic Alegreya at --fs-body-l / --lh-loose. The one
    // register shift in the product, and it has to be visible, not just tonal.
    expect(prose).toHaveClass("font-serif", "italic", "text-body-l", "leading-loose");
    expect(screen.getByText("Read aloud")).toBeInTheDocument();
  });

  it("draws the party as a strip, with the way to the screen that authors it", async () => {
    // **The characters moved to the Party screen with the delivery's nav** —
    // the campaign row has one *Party* destination, so the strip here is the
    // Overview's summary of it rather than the list. The list itself, with the
    // derived descriptor and the live hit points, is `party/PartyScreen`.
    await renderScreen(mintingSession());

    expect(await screen.findByText("Brannoc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage party" })).toHaveAttribute(
      "href",
      `/#/campaigns/${campaignId}/party`,
    );
  });

  it("ticks a prep item off and saves it", async () => {
    await renderScreen(mintingSession());

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    expect(screen.getByText("0/1")).toBeInTheDocument();

    await userEvent.click(item);

    expect(screen.getByText("1/1")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        server.calls.some(
          (call) => call.method === "PATCH" && (JSON.parse(call.body) as { done: boolean }).done,
        ),
      ).toBe(true),
    );
  });

  it("puts the tick back when the save fails", async () => {
    server.routes.delete(`PATCH /campaigns/${campaignId}/sessions/${sessionId}/prep/${prepItemId}`);
    await renderScreen(mintingSession());

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    await userEvent.click(item);

    expect(await screen.findByRole("alert")).toHaveTextContent("That did not save");
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("fetches a fresh session token for every round of calls", async () => {
    const hosted = mintingSession();
    await renderScreen(hosted);

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    expect(hosted.minted()).toBe(1);

    // Hosted session tokens live 60 seconds. A token read once at mount works
    // until the first refresh and then 401s silently, so the write must reach
    // for a new one rather than reuse the one the load used.
    await userEvent.click(item);
    await waitFor(() => expect(hosted.minted()).toBe(2));

    const patch = server.calls.find((call) => call.method === "PATCH");
    expect(patch?.authorization).toBe("Bearer session-token-2");
  });

  it("falls back to the pasted machine token when nobody is signed in", async () => {
    window.localStorage.setItem("taverns.token", "a-machine-token");
    await renderScreen();

    await screen.findByRole("heading", { name: "Overview" });
    expect(server.calls[0]?.authorization).toBe("Bearer a-machine-token");
  });

  it("says what to do when there is no credential at all", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    await renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("No credential yet");
    // The unconfigured branch: this is a normal way to run the app, so it points
    // at the machine token rather than a sign-in that does not exist here.
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeInTheDocument();
  });

  it("tells a transport failure apart from a refusal", async () => {
    server.transportDown = true;
    await renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server did not answer");
    expect(screen.getByText(/pnpm db:up/)).toBeInTheDocument();
  });

  it("draws the empty states a brand-new campaign lands on", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, name: "The Reed Marches", partyName: null, currentSessionId: null },
    });
    server.routes.set(`GET /campaigns/${campaignId}/encounters`, { status: 200, body: page([]) });
    server.routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: page([]) });
    server.routes.set(`GET /campaigns/${campaignId}/characters`, { status: 200, body: [] });
    await renderScreen(mintingSession());

    expect(await screen.findByText("No encounters yet")).toBeInTheDocument();
    // No session means no checklist to hang items on — a state, not a blank card.
    expect(screen.getByText(/The checklist belongs to the night you are preparing/)).toBeVisible();

    // Each of the three now says its own — which is a render at a URL rather
    // than a click on a tab.
    cleanup();
    await renderEncounters(mintingSession());
    expect(await screen.findByText("No encounters yet")).toBeInTheDocument();

    cleanup();
    await renderNotes(mintingSession());
    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  });

  it("filters what is on screen without moving a card's own note count", async () => {
    // The one search box became one per screen — an encounter list and a note
    // list are different questions, and the delivery gives each its own box.
    await renderEncounters(mintingSession());

    const search = await screen.findByRole("textbox", { name: "Search encounters" });
    await userEvent.type(search, "crate");

    expect(screen.queryByText("Ambush in the reeds")).not.toBeInTheDocument();
    expect(screen.getByText("Whatever is in the crate")).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "nothing by that name");

    // Searching to nothing is not the same state as having nothing, and says so.
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    expect(screen.getByText(/Loosen the search, or clear it/)).toBeInTheDocument();
  });

  it("hands a player the screen that works, rather than drawing the DM's over their data", async () => {
    // Nothing in the product links a player here any more, but a bookmark or a
    // pasted link still can — and it would not fail loudly: every read this
    // screen's first round makes succeeds for a player, narrowed. So it would
    // draw *New encounter*, *Ask Hob* and the sharing control over rows a
    // player may see, and break only on the press.
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, role: "player", joinedAt: campaign.createdAt }],
    });

    await renderScreen(mintingSession());

    // **The router performs the move now, and the assertion moved with it.**
    // It used to spy on `location.replace`, which is what the screen called
    // before there was a router; that is a check on a mechanism rather than on
    // the outcome, and it would keep passing if the screen replaced the URL
    // with something nobody could read. What is asserted instead is where the
    // reader ends up — the player's own screen, on `replace` so *Back* returns
    // them where they came from rather than here.
    await waitFor(() => {
      expect(globalThis.location.hash).toBe(`#/play/campaigns/${campaignId}`);
    });
    // Not one control of this screen is drawn on the way.
    // Not one control of *this screen* is drawn on the way — the sharing
    // control, the create button and the whole body are withheld until the role
    // is known.
    expect(screen.queryByRole("button", { name: /Private|Shared/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    // The campaign row **is** drawn on the way, and that is correct rather than
    // a leak: it is a function of the route and the mode, both known before
    // anything loads, which is what keeps the bar from changing height under a
    // reader mid-load. By now it is the *player's* row — the destination's —
    // and it offers the two screens a player has.
    expect(
      within(screen.getByRole("navigation", { name: "This campaign" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Overview", "Chronicle"]);
  });
});
