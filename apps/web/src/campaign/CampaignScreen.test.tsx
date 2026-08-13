import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaign,
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  prepItemId,
  renderScreen,
  sessionId,
} from "./campaign.fixtures";

/**
 * The campaign view *reading*, against a stubbed wire decoded by the real
 * client. The writes are `authoring.test.tsx`; the fixtures are shared.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

describe("CampaignScreen", () => {
  it("renders the campaign the six endpoints describe", async () => {
    renderScreen(mintingSession());

    expect(await screen.findByRole("heading", { name: "The Salt Road" })).toBeInTheDocument();
    // The subtitle is assembled from two rows: the session's number, the
    // campaign's party name, and how many are at the table — that last one moved
    // here from the rail's footer when the rail became a 56px top bar.
    expect(screen.getByText("Session 12 · The Gilded Spoon · 4 players")).toBeInTheDocument();

    expect(screen.getByText("Ambush in the reeds")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Marsh")).toBeInTheDocument();
    // `sum(encounter_creature.count)` leads the description, as the prototype
    // draws it; the note hanging off this encounter follows.
    expect(screen.getByText("6 creatures · 1 note")).toBeInTheDocument();
    // Null difficulty is its own state, not a missing badge.
    expect(screen.getByText("Unrated")).toBeInTheDocument();
  });

  it("sets read-aloud prose apart, in the prose face", async () => {
    renderScreen(mintingSession());

    await screen.findByRole("tab", { name: "Notes" });
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));

    const prose = await screen.findByText(/The reeds are taller than you are/);
    // `--type-read-aloud`: italic Alegreya at --fs-body-l / --lh-loose. The one
    // register shift in the product, and it has to be visible, not just tonal.
    expect(prose).toHaveClass("font-serif", "italic", "text-body-l", "leading-loose");
    expect(screen.getByText("Read aloud")).toBeInTheDocument();
  });

  it("assembles a party row out of the separate columns", async () => {
    renderScreen(mintingSession());

    await screen.findByRole("tab", { name: "Party" });
    await userEvent.click(screen.getByRole("tab", { name: "Party" }));

    expect(await screen.findByText("Brannoc")).toBeInTheDocument();
    // The half-line is the server's derived `descriptor` — `0012` made it a
    // generated column over `level`, `species` and `class_name` — joined to the
    // player's name here, which is the one part of the line the client assembles.
    expect(screen.getByText("Level 3 Half-orc Paladin · Ilse")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    // Where they are now, over what they can take — the live half (`0014`).
    // The party list stopped being prep data the moment a fight could write it:
    // this is the same number the initiative row shows, written by the same
    // transaction. A row nobody has said anything about shows only its maximum.
    expect(screen.getByText("44 / 52")).toBeInTheDocument();
  });

  it("ticks a prep item off and saves it", async () => {
    renderScreen(mintingSession());

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
    renderScreen(mintingSession());

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    await userEvent.click(item);

    expect(await screen.findByRole("alert")).toHaveTextContent("That did not save");
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("fetches a fresh session token for every round of calls", async () => {
    const hosted = mintingSession();
    renderScreen(hosted);

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
    renderScreen();

    await screen.findByRole("heading", { name: "The Salt Road" });
    expect(server.calls[0]?.authorization).toBe("Bearer a-machine-token");
  });

  it("says what to do when there is no credential at all", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("No credential yet");
    // The unconfigured branch: this is a normal way to run the app, so it points
    // at the machine token rather than a sign-in that does not exist here.
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeInTheDocument();
  });

  it("tells a transport failure apart from a refusal", async () => {
    server.transportDown = true;
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server did not answer");
    expect(screen.getByText(/pnpm db:up/)).toBeInTheDocument();
  });

  it("draws the empty states a brand-new campaign lands on", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, name: "The Reed Marches", partyName: null, currentSessionId: null },
    });
    server.routes.set(`GET /campaigns/${campaignId}/encounters`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}/characters`, { status: 200, body: [] });
    renderScreen(mintingSession());

    expect(await screen.findByText("No encounters yet")).toBeInTheDocument();
    // No session means no checklist to hang items on — a state, not a blank card.
    expect(screen.getByText(/The checklist belongs to the night you are preparing/)).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(await screen.findByText("No notes yet")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Party" }));
    expect(await screen.findByText("Nobody at the table yet")).toBeInTheDocument();
  });

  it("filters what is on screen without moving a card's own note count", async () => {
    renderScreen(mintingSession());

    const search = await screen.findByRole("textbox", { name: "Search this campaign" });
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
    const replace = vi.fn();
    vi.spyOn(globalThis, "location", "get").mockReturnValue({
      ...globalThis.location,
      replace,
    } as unknown as Location);
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, role: "player", joinedAt: campaign.createdAt }],
    });

    renderScreen(mintingSession());

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`#/play/campaigns/${campaignId}`);
    });
    // Not one control of this screen is drawn on the way.
    expect(screen.queryByRole("button", { name: "New encounter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Party" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
