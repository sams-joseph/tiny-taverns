import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaign, campaignId, installStubServer, worldId } from "../campaign/campaign.fixtures";
import { sseFrames } from "../characters/characters.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * A Hob card's three answers besides keeping it — *Discard*, *Try again* and,
 * once kept, *Open it* — on each panel that draws cards, through the real
 * shell and the real routes.
 *
 * Each was drawn and did nothing: the conversation handed the card no
 * `discard` or `retry` at all, and *Open it* only on the account's panel and
 * only for a card kept while it was on screen. So every test here presses the
 * control and asserts what it did — the request it made, the card leaving, a
 * new offer arriving, the screen it opened — rather than that it is enabled.
 */

const server = installStubServer();

const threadId = "3c2f2a1e-0000-4000-8000-00000000c001";
const turnId = "3c2f2a1e-0000-4000-8000-00000000c002";
const againId = "3c2f2a1e-0000-4000-8000-00000000c003";
const noteId = "3c2f2a1e-0000-4000-8000-00000000c004";
const entryId = "3c2f2a1e-0000-4000-8000-00000000c005";
const stamp = "2026-09-29T20:00:00.000Z";

interface Surface {
  readonly name: string;
  /** A screen whose panel is this surface's. */
  readonly at: string;
  /** The Hob group's prefix on the wire. */
  readonly hob: string;
  readonly status: Record<string, unknown>;
  readonly threadScope: Record<string, unknown>;
  /** What Hob offers, and its title. */
  readonly proposal: (title: string) => Record<string, unknown>;
  readonly keep: string;
  /** What the accept answers. */
  readonly accepted: Record<string, unknown>;
  /** The pointer a keep stores, for a card read back on a later visit. */
  readonly kept: Record<string, unknown>;
  /** Where *Open it* lands. */
  readonly opens: string;
}

const noteRow = {
  id: noteId,
  campaignId,
  title: "The lantern-keeper",
  body: "She trims the wicks at dusk.",
  kind: "note",
  category: null,
  attachedTo: null,
  links: [],
  visibility: "dm",
  pinnedAt: null,
  origin: "assistant",
  assistantTurnId: turnId,
  createdAt: stamp,
  updatedAt: stamp,
};

const entryRow = {
  id: entryId,
  worldId,
  campaignId: null,
  sessionId: null,
  sourceKind: "manual",
  worldSeq: 7,
  occurredAt: null,
  acceptedAt: stamp,
  title: "The lantern-keeper",
  body: "Both tables now know the hag holds the lantern.",
  facts: {},
  origin: "assistant",
  assistantTurnId: turnId,
  createdByAccountId: null,
  createdAt: stamp,
};

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: "a campaign's creator panel",
    at: `/campaigns/${campaignId}`,
    hob: `/campaigns/${campaignId}/hob`,
    status: { available: true, model: "scripted-local", campaign: "The Salt Road" },
    threadScope: { campaignId, worldId: null },
    proposal: (title) => ({ target: "note", title, body: "She trims the wicks.", kind: "note" }),
    keep: "Save to session",
    accepted: { accepted: "note", note: noteRow },
    kept: { accepted: "note", id: noteId },
    opens: `/campaigns/${campaignId}/notes?note=${noteId}`,
  },
  {
    name: "a Shared World's panel",
    at: `/worlds/${worldId}`,
    hob: `/worlds/${worldId}/hob`,
    status: { available: true, model: "scripted-local", sharedWorld: "The Salt Company" },
    threadScope: { campaignId: null, worldId },
    proposal: (title) => ({ target: "sharedWorldHistory", title, body: "The hag has it." }),
    keep: "Add to Chronicle",
    accepted: { accepted: "sharedWorldHistory", entry: entryRow },
    kept: { accepted: "sharedWorldHistory", id: entryId, worldId },
    opens: `/worlds/${worldId}/chronicle`,
  },
  {
    name: "the account's own panel",
    at: "/characters",
    hob: "/me/hob",
    status: { available: true, model: "scripted-local" },
    threadScope: { campaignId: null, worldId: null },
    proposal: (title) => ({
      target: "campaign",
      name: title,
      partyName: null,
      description: "Salt flats and a road nobody finishes.",
      world: null,
    }),
    keep: "Keep it",
    accepted: {
      accepted: "campaign",
      campaign: { ...campaign, origin: "assistant", assistantTurnId: turnId },
    },
    kept: { accepted: "campaign", id: campaignId },
    opens: `/campaigns/${campaignId}`,
  },
];

const offer = (turn: string, proposal: Record<string, unknown>) =>
  sseFrames([
    { event: "began", data: { threadId, turnId: turn } },
    { event: "delta", data: { text: "Here." } },
    { event: "proposal", data: { turnId: turn, proposal } },
    { event: "done", data: { reason: "stop" } },
  ]);

/** The surface's Hob, configured, with `turns` read back as its newest thread. */
const serve = (surface: Surface, turns: ReadonlyArray<Record<string, unknown>> = []) => {
  server.routes.set(`GET ${surface.hob}`, { status: 200, body: surface.status });
  server.routes.set(`GET ${surface.hob}/threads`, {
    status: 200,
    body:
      turns.length === 0
        ? []
        : [
            {
              id: threadId,
              ...surface.threadScope,
              title: "The lantern-keeper",
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
  });
  server.routes.set(`GET ${surface.hob}/threads/${threadId}/turns`, { status: 200, body: turns });
  server.routes.set(`POST ${surface.hob}/ask`, {
    status: 200,
    sse: offer(turnId, surface.proposal("The lantern-keeper")),
  });
  for (const turn of [turnId, againId]) {
    server.routes.set(`POST ${surface.hob}/threads/${threadId}/turns/${turn}/discard`, {
      status: 204,
    });
    server.routes.set(`POST ${surface.hob}/threads/${threadId}/turns/${turn}/accept`, {
      status: 200,
      body: surface.accepted,
    });
  }
};

beforeEach(() => server.reset());
afterEach(cleanup);

const panel = () => screen.getByRole("region", { name: "Hob" });
const card = (title: string) => {
  const found = within(panel()).getByText(title).closest<HTMLElement>("[data-slot=card]");
  if (found === null) throw new Error(`no card titled ${title}`);
  return found;
};

/** Opens the panel at the surface's screen and asks for an offer. */
const offered = async (surface: Surface) => {
  await renderAt(surface.at);
  await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
  const composer = await within(panel()).findByRole("textbox", { name: "Ask Hob" });
  await userEvent.type(composer, "Something about the lantern-keeper.{Enter}");
  await within(panel()).findByText("The lantern-keeper");
};

const posted = (suffix: string) =>
  server.calls.filter((call) => call.method === "POST" && call.pathname.endsWith(suffix));

for (const surface of SURFACES) {
  describe(surface.name, () => {
    it("discards a card: the server is told which turn, and the card leaves the thread", async () => {
      serve(surface);
      await offered(surface);

      await userEvent.click(
        within(card("The lantern-keeper")).getByRole("button", { name: "Discard" }),
      );

      await waitFor(() => expect(within(panel()).queryByText("The lantern-keeper")).toBeNull());
      expect(posted("/discard").map((call) => [call.pathname, call.body])).toEqual([
        [`${surface.hob}/threads/${threadId}/turns/${turnId}/discard`, "{}"],
      ]);
      // What Hob said stays; only the offer went.
      expect(within(panel()).getAllByText("Here.")).toHaveLength(1);
      expect(posted("/accept")).toEqual([]);
    });

    it("tries again: discards the card, then asks for another in the same thread", async () => {
      serve(surface);
      await offered(surface);
      server.routes.set(`POST ${surface.hob}/ask`, {
        status: 200,
        sse: offer(againId, surface.proposal("The lantern-keeper, again")),
      });

      await userEvent.click(
        within(card("The lantern-keeper")).getByRole("button", { name: "Try again" }),
      );

      expect(await within(panel()).findByText("The lantern-keeper, again")).toBeTruthy();
      expect(within(panel()).queryByText("The lantern-keeper")).toBeNull();
      expect(posted("/discard").map((call) => call.pathname)).toEqual([
        `${surface.hob}/threads/${threadId}/turns/${turnId}/discard`,
      ]);
      const asks = posted("/ask");
      expect(asks).toHaveLength(2);
      expect(JSON.parse(asks[1]!.body)).toEqual({
        threadId,
        text: "Try again: another take on “The lantern-keeper”.",
      });
      // And the question is in the thread, as any question is.
      expect(
        within(panel()).getByText("Try again: another take on “The lantern-keeper”."),
      ).toBeTruthy();
    });

    it("says so in the thread, and asks nothing, when the discard is refused", async () => {
      serve(surface);
      server.routes.set(`POST ${surface.hob}/threads/${threadId}/turns/${turnId}/discard`, {
        status: 409,
        body: { _tag: "Conflict", message: "that is already kept" },
      });
      await offered(surface);

      await userEvent.click(
        within(card("The lantern-keeper")).getByRole("button", { name: "Try again" }),
      );

      expect(
        await within(panel()).findByText("Nothing was discarded: that is already kept."),
      ).toBeTruthy();
      expect(within(panel()).getByText("The lantern-keeper")).toBeTruthy();
      expect(posted("/ask")).toHaveLength(1);
    });

    it("opens what a card kept on an earlier visit made", async () => {
      serve(surface, [
        {
          id: turnId,
          threadId,
          who: "hob",
          text: "Here.",
          proposal: surface.proposal("The lantern-keeper"),
          acceptedAt: stamp,
          discardedAt: null,
          kept: surface.kept,
          createdAt: stamp,
        },
      ]);
      await renderAt(surface.at);
      await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
      await within(panel()).findByText("Saved");

      await userEvent.click(
        within(card("The lantern-keeper")).getByRole("button", { name: "Open it" }),
      );

      await waitFor(() =>
        expect(`${window.location.pathname}${window.location.search}`).toBe(surface.opens),
      );
    });

    it("draws no card for an offer discarded on an earlier visit, and keeps its words", async () => {
      serve(surface, [
        {
          id: turnId,
          threadId,
          who: "hob",
          text: "Here.",
          proposal: surface.proposal("The lantern-keeper"),
          acceptedAt: null,
          discardedAt: stamp,
          kept: null,
          createdAt: stamp,
        },
      ]);
      await renderAt(surface.at);
      await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));

      expect(await within(panel()).findByText("Here.")).toBeTruthy();
      expect(within(panel()).queryByText("The lantern-keeper")).toBeNull();
    });
  });
}

describe("Open it, right after the keep", () => {
  it("opens the note a campaign's panel just kept", async () => {
    const surface = SURFACES[0]!;
    serve(surface);
    await offered(surface);

    await userEvent.click(
      within(card("The lantern-keeper")).getByRole("button", { name: surface.keep }),
    );
    await within(panel()).findByText("Saved");
    await userEvent.click(
      within(card("The lantern-keeper")).getByRole("button", { name: "Open it" }),
    );

    await waitFor(() =>
      expect(`${window.location.pathname}${window.location.search}`).toBe(surface.opens),
    );
  });

  it("opens the Chronicle a Shared World's panel just added to", async () => {
    const surface = SURFACES[1]!;
    serve(surface);
    await offered(surface);

    await userEvent.click(
      within(card("The lantern-keeper")).getByRole("button", { name: surface.keep }),
    );
    await within(panel()).findByText("Saved");
    await userEvent.click(
      within(card("The lantern-keeper")).getByRole("button", { name: "Open it" }),
    );

    await waitFor(() => expect(window.location.pathname).toBe(surface.opens));
  });
});

describe("a card kept before its keep was recorded", () => {
  it("offers no Open it, rather than one that does nothing", async () => {
    const surface = SURFACES[0]!;
    serve(surface, [
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Here.",
        proposal: surface.proposal("The lantern-keeper"),
        acceptedAt: stamp,
        discardedAt: null,
        kept: null,
        createdAt: stamp,
      },
    ]);
    await renderAt(surface.at);
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
    await within(panel()).findByText("Saved");

    expect(
      within(card("The lantern-keeper")).queryByRole("button", { name: "Open it" }),
    ).toBeNull();
  });
});
