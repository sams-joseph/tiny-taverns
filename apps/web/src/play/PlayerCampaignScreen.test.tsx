import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { apiUrl } from "../api/client";
import {
  campaign,
  campaignId,
  character,
  drawnCover,
  drawnPortrait,
  installStubServer,
  partySeat,
  mintingSession,
  npcId,
  readAloud,
  page,
} from "../campaign/campaign.fixtures";
import { beat, session11, sessions } from "../chronicle/chronicle.fixtures";
import { marshHag, playerRecap11 } from "../chronicle/player.fixtures";

/**
 * A table you sit at, chosen by this account's relation to the campaign.
 *
 * Much of what is under test is what it does *not* do. The player and creator
 * projections may diverge freely, and the reason this screen exists at all is
 * that the creator's load composes reads a player may not call. So the
 * assertions are: which endpoints it reaches (only ones a player may call), and
 * that no creator chrome is on it.
 *
 * The fixtures are the campaign screen's, for the reason that file gives — they
 * are the JSON the server sends, so a field the contract renames fails here
 * rather than rendering `undefined`. What a player is *not* answered — a seat or
 * a note kept to the DM, a monster's numbers — is the server's to withhold
 * (`repo/visibility.ts`, `PlayerRecap.ts`) and its tests'; what is under test
 * here is that the page reaches only the player's endpoints and draws nothing
 * from what they did not answer.
 */

const server = installStubServer();
const session = mintingSession();

const renderScreen = async (): Promise<void> => {
  // The player's membership is what makes this URL render the participant
  // projection — the same URL the creator opens, chosen by relation.
  server.routes.set("GET /me/campaigns", {
    status: 200,
    body: [
      {
        campaign,
        relation: "player",
        sharedWorld: null,
        joinedAt: "2026-06-01T10:00:00.000Z",
      },
    ],
  });
  await renderAt(`/campaigns/${campaignId}`, (screen) => (
    <HostedSessionScope session={session}>{screen}</HostedSessionScope>
  ));
};

const pathsCalled = (): ReadonlyArray<string> => server.calls.map((call) => call.pathname);

const base = `/campaigns/${campaignId}`;
const hero = () => document.querySelector<HTMLElement>("[data-slot=overview-hero]");
const cover = () => hero()?.querySelector("[data-slot=hob-cover]") ?? null;
const overlaps = () => hero()?.matches(":has([data-picture])") ?? false;

/** The Overview card titled `title` — its header's heading, up to the card. */
const cardOf = async (title: string): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name: title });
  return heading.closest<HTMLElement>("[data-slot=card]")!;
};

/** A table that has finished and shared a night: session 11, as a player is told it. */
const withLastNight = (over: object = {}) => {
  server.routes.set(`GET ${base}/sessions`, { status: 200, body: sessions });
  server.routes.set(`GET ${base}/sessions/${session11.id}/recap/player`, {
    status: 200,
    body: { ...playerRecap11, ...over },
  });
};

beforeEach(() => {
  server.reset();
});

describe("a table you sit at", () => {
  it("reads only what a player may read", async () => {
    await renderScreen();

    // Twice: the campaign row, and the hero's `h1`. Waited for together — the
    // row reads the name for itself and may draw it a render apart from the
    // screen.
    await waitFor(() => expect(screen.getAllByText(campaign.name)).toHaveLength(2));
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}`);
    // The party read — `party.list`, the seats over shared characters — is the
    // one a player may make; the old campaign-scoped character list is gone
    // with the continuity decision.
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/party`);
    // The player's own projection of the shared notes; the creator's `notes`
    // read answers a player `NotFound`.
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/player-notes`);
    expect(pathsCalled()).not.toContain(`/campaigns/${campaignId}/notes`);
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/npcs/-/player`);
    // The creator's load composes these, and the creator gate refuses a player
    // the first of them — which is the whole reason this screen is not that
    // screen narrowed. The other two are screens of their own.
    expect(pathsCalled().some((path) => path.endsWith("/runs"))).toBe(false);
    expect(pathsCalled().some((path) => path.endsWith("/prep"))).toBe(false);
    // The only night in `fullCampaign` is still open, so there is no recap to read.
    expect(pathsCalled().some((path) => path.includes("/recap"))).toBe(false);
  });

  it("reads the last shared night through the player's recap, never the DM's", async () => {
    withLastNight();
    await renderScreen();

    await cardOf("Last time");
    expect(pathsCalled()).toContain(`${base}/sessions/${session11.id}/recap/player`);
    expect(pathsCalled().some((path) => path.endsWith("/recap"))).toBe(false);
  });

  it("shows the party and what the DM shared, and offers no way to change either", async () => {
    await renderScreen();

    expect(await screen.findByText(character.name)).toBeTruthy();
    const shared = document.getElementById("shared-with-you")!;
    expect(within(shared).getByText(readAloud.title)).toBeTruthy();
    expect(within(shared).getByText(readAloud.body)).toBeTruthy();
    // Read-only, and structurally so: nothing here renders an editor.
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    // A player talks to Hob only from the character-drafting composer. The DM's
    // docked session-writing panel is not offered on this overview.
    expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
    expect(screen.getByText(/Only you can read that transcript/)).toBeTruthy();
    expect(screen.getByText(/does not automatically update NPC memory/)).toBeTruthy();
    // A shared NPC's card carries its public look beside its summary.
    expect(
      screen.getByText("Stooped and weathered, river-grey eyes, a lantern hung from his pole."),
    ).toBeTruthy();
    const talk = screen.getByRole("button", { name: /Talk privately/ });
    expect(talk.getAttribute("href")).toBe(`/campaigns/${campaignId}/cast/${npcId}/talk`);
  });

  it("lays a party member's portrait over their initials", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: [{ ...partySeat, character: { ...character, portrait: drawnPortrait } }],
    });
    await renderScreen();

    const row = (await screen.findByText(character.name)).closest("li");
    const plate = row?.querySelector("img");
    expect(plate?.getAttribute("src")).toBe(apiUrl(drawnPortrait.thumbUrl));
  });

  it("keeps the DM's nav off the player's bar", async () => {
    await renderScreen();

    expect(await screen.findByRole("button", { name: /Campaigns/ })).toBeTruthy();
    // Bestiary and the DM party-management screen are not player destinations;
    // a nav item that goes nowhere is the same lie as a stubbed field.
    expect(screen.queryByRole("link", { name: /Bestiary/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Party/ })).toBeNull();

    // *Chronicle* is here because its screen now is, and it points at the
    // player's own route — `recap.readAsPlayer`, not the gated `recap.read`.
    expect(screen.getByRole("link", { name: /Chronicle/ }).getAttribute("href")).toBe(
      `/campaigns/${campaignId}/chronicle`,
    );
  });

  it("says what an empty table means rather than looking broken", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}/player-notes`, {
      status: 200,
      body: page([]),
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/player`, { status: 200, body: [] });

    await renderScreen();

    // The ordinary outcome of joining: a table its DM has shared but has put
    // nothing shared inside. The master toggle and the row-level one working in
    // sequence, not a gap.
    expect(await screen.findByText("Nothing shared yet")).toBeTruthy();
    const party = await cardOf("Party");
    expect(party).toHaveTextContent("Nobody at the table has been shared with you yet.");
    expect(screen.queryByRole("heading", { name: "Recent notes" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Last time" })).toBeNull();
  });

  it("renders a failed load with a way to try it again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);

    await renderScreen();

    expect(await screen.findByRole("button", { name: /Try again/ })).toBeTruthy();
  });
});

describe("the player Overview's hero", () => {
  it("titles the page with the campaign's name, over the same meta line as the creator's", async () => {
    await renderScreen();
    const title = await screen.findByRole("heading", { level: 1, name: campaign.name });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(hero()?.contains(title)).toBe(true);
    expect(title.closest("[data-slot=page-heading]")).toBeNull();
    expect(hero()!.querySelector("header p")).toHaveTextContent(
      "The Gilded Spoon·Since August 2026",
    );
    // Centred with the columns, so the header's left edge is theirs.
    expect(hero()!.parentElement).toHaveClass("mx-auto", "max-w-overview");
  });

  it("carries New character as the page's one peach, and none of the creator's management", async () => {
    await renderScreen();
    await screen.findByRole("heading", { level: 1, name: campaign.name });
    const header = within(hero()!.querySelector("header")!);

    const create = header.getByRole("button", { name: "New character" });
    expect(create.getAttribute("href")).toBe(`${base}/characters/new`);
    expect(
      screen.getAllByRole("button").filter((button) => button.classList.contains("bg-accent")),
    ).toEqual([create]);
    for (const name of [/Invite/, /Settings/, /Campaign actions/])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("lays the header over a drawn cover", async () => {
    server.routes.set(`GET ${base}`, { status: 200, body: { ...campaign, image: drawnCover } });
    await renderScreen();
    await waitFor(() => expect(cover()).toHaveAttribute("data-picture"));
    expect(overlaps()).toBe(true);
  });

  for (const description of [null, "Four strangers walk a salt caravan to the coast."])
    it(`keeps New character below a drawn cover ${description ? "with" : "without"} a pitch`, async () => {
      server.routes.set(`GET ${base}`, {
        status: 200,
        body: { ...campaign, image: drawnCover, description },
      });
      await renderScreen();
      await waitFor(() => expect(overlaps()).toBe(true));
      const header = hero()!.querySelector("header")!;
      // The name's block rises over the picture and is at least the overlap
      // tall, so the row under it, where the actions are, starts below it.
      expect(header.querySelector("h1")!.parentElement).toHaveClass(
        "group-has-data-picture/hero:min-h-overview-overlap",
      );
      const actions = header.querySelector<HTMLElement>("[data-slot=overview-hero-actions]")!;
      // The description's slot shares the actions' wrapping row, so it is never
      // shorter than they are while they sit beside it, pitch or none.
      const slot = header.querySelector<HTMLElement>("[data-slot=overview-hero-description]")!;
      expect(slot.parentElement).toBe(actions.parentElement);
      expect(slot.parentElement).toHaveClass("flex", "flex-wrap");
      expect(slot).toHaveTextContent(description ?? /^$/);
      expect(within(actions).getByRole("button", { name: "New character" })).toBeInTheDocument();
    });

  it("sits flat with no cover", async () => {
    await renderScreen();
    await screen.findByRole("heading", { level: 1, name: campaign.name });
    expect(hero()).not.toBeNull();
    expect(cover()).toBeNull();
    expect(overlaps()).toBe(false);
  });

  it("drops to flat when the cover will not load", async () => {
    server.routes.set(`GET ${base}`, { status: 200, body: { ...campaign, image: drawnCover } });
    await renderScreen();
    await waitFor(() => expect(overlaps()).toBe(true));
    fireEvent.error(cover()!.querySelector("img")!);
    await waitFor(() => expect(overlaps()).toBe(false));
  });
});

describe("the player Overview's cards", () => {
  it("summarises the seats this player may see, with their numbers and no way to manage them", async () => {
    await renderScreen();
    const party = await cardOf("Party");

    expect(within(party).getByText(character.name)).toBeInTheDocument();
    expect(within(party).getByText("AC 18")).toBeInTheDocument();
    expect(within(party).getByText("44 / 52")).toBeInTheDocument();
    expect(within(party).getByText("Lvl 3")).toBeInTheDocument();
    // A player has no Party tab, so there is nowhere for *Manage* to go.
    expect(within(party).queryByRole("link")).toBeNull();
    // Four players, one visible seat: over a partial roster the count of
    // players without a character would count the hidden seats' players.
    expect(party).not.toHaveTextContent(/no character/);
  });

  it("draws no hit points for a seat whose character has none written", async () => {
    server.routes.set(`GET ${base}/party`, {
      status: 200,
      body: [{ ...partySeat, character: { ...character, hpCurrent: null, hpMax: null, ac: null } }],
    });
    await renderScreen();
    const party = await cardOf("Party");
    expect(within(party).getByText(character.name)).toBeInTheDocument();
    expect(party).not.toHaveTextContent(/AC|\d+ \/ \d+/);
  });

  it("quotes the last shared night's beats, with the way to the chronicle", async () => {
    withLastNight();
    await renderScreen();
    const card = await cardOf("Last time");

    expect(within(card).getByText(/^Session 11 · /)).toBeInTheDocument();
    expect(within(card).getByText(beat.body)).toBeInTheDocument();
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Read the chronicle");
    expect(links[0]).toHaveAttribute("href", `${base}/chronicle`);
  });

  it("tells a night with no shared beats by its fights, saying nothing of a monster's numbers", async () => {
    withLastNight({ beats: [] });
    await renderScreen();
    const card = await cardOf("Last time");
    expect(
      within(card).getByText(/Paused at round \d+ when the night ended\./),
    ).toBeInTheDocument();
    // The band is the whole of what a player is told, and the card does not
    // even say that much.
    expect(card).not.toHaveTextContent(marshHag.displayName);
    expect(card).not.toHaveTextContent(marshHag.hpBand);
  });

  it("says a night with nothing shared is that, not a night where nothing was written", async () => {
    withLastNight({ beats: [], fights: [] });
    await renderScreen();
    const card = await cardOf("Last time");
    expect(card).toHaveTextContent("Nothing from that night has been shared with you.");
    expect(card).not.toHaveTextContent("Nothing was written down");
  });

  it("summarises the shared notes, and its All notes goes to them in full on this page", async () => {
    await renderScreen();
    const card = await cardOf("Recent notes");

    expect(within(card).getByText(readAloud.title)).toBeInTheDocument();
    // A summary: the body is the section's, and the row opens nothing.
    expect(within(card).queryByText(readAloud.body)).toBeNull();
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("All notes");
    expect(links[0]).toHaveAttribute("href", "#shared-with-you");
    expect(document.getElementById("shared-with-you")).toHaveTextContent(readAloud.body);
    // A player has no Notes tab to be sent to.
    expect(screen.queryByRole("link", { name: /^Notes$/ })).toBeNull();
  });

  it("puts the night and what was shared in the main column, and the table in the aside", async () => {
    withLastNight();
    await renderScreen();
    const aside = (await cardOf("Party")).closest("aside")!;

    expect(within(aside).getByRole("heading", { name: "Recent notes" })).toBeInTheDocument();
    for (const title of ["Last time", "People you can talk to", "Shared with you"])
      expect(aside.contains(screen.getByRole("heading", { name: title }))).toBe(false);
  });
});
