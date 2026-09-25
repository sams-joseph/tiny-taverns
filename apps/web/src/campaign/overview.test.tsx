import type { PartySeat } from "@taverns/api";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTime, Schema } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { recap11, session11, sessions } from "../chronicle/chronicle.fixtures";
import { dayOf } from "../chronicle/format";
import { liveFight, runningSession } from "../run/run.fixtures";
import {
  campaign,
  campaignId,
  character,
  characterSeat,
  encounter,
  encounterPrep,
  installStubServer,
  liveRun,
  mintingSession,
  page,
  partySeat,
  readAloud,
  renderScreen,
  session,
  sessionId,
  sketch,
} from "./campaign.fixtures";
import { partyLevel } from "./overview";
import { agoOf } from "./when";

/**
 * The Overview's cards, one describe each, against the stubbed wire.
 *
 * The redesign's rule for these cards is that **the rows open nothing** — the
 * Overview is a summary and each card's header link is the way in — so every
 * card is asserted on where its link goes and on its rows not being links.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

const base = `/campaigns/${campaignId}`;

/** The card a heading heads — the nearest `Card` around it. */
/** The campaign row, which carries the campaign's press on every tab. */
const campaignRow = (): HTMLElement =>
  screen.getByRole("navigation", { name: "This campaign" }).parentElement!;

const cardOf = async (title: string): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name: title });
  const card = heading.closest<HTMLElement>("[data-slot='card']");
  expect(card).not.toBeNull();
  return card!;
};

/** A second seat, over a character of its own, with its fields overridden. */
const seatWith = (overrides: Partial<Record<keyof typeof character, unknown>>) => ({
  seat: {
    ...characterSeat,
    id: "2b1f2a1e-0000-4000-8000-000000000952",
    characterId: "2b1f2a1e-0000-4000-8000-000000000902",
    accountId: "2b1f2a1e-0000-4000-8000-0000000000a3",
    displayName: String(overrides.name ?? character.name),
  },
  character: { ...character, id: "2b1f2a1e-0000-4000-8000-000000000902", ...overrides },
});

describe("the party card", () => {
  const level = (levels: ReadonlyArray<number | null>): string | undefined =>
    partyLevel(
      levels.map((value) => ({ seat: {}, character: { level: value } }) as unknown as PartySeat),
    );

  it("says one level when everyone is at it, and the span when they are not", () => {
    expect(level([5, 5, 5])).toBe("Lvl 5");
    expect(level([4, 6, 5])).toBe("Lvl 4–6");
    // Never an average: a level nobody at the table has is not a party level.
    expect(level([3, 4])).toBe("Lvl 3–4");
    // A character with no level written says nothing about the party's.
    expect(level([null, 5])).toBe("Lvl 5");
    expect(level([null])).toBeUndefined();
    expect(level([])).toBeUndefined();
    expect(partyLevel([{ seat: {}, character: null } as unknown as PartySeat])).toBeUndefined();
  });

  it("summarises each seat, with the way to the Party tab and no row that opens anything", async () => {
    await renderScreen(mintingSession());
    const card = await cardOf("Party");

    expect(within(card).getByText("Brannoc")).toBeInTheDocument();
    // Race and class from the columns, then whose character it is.
    expect(within(card).getByText("Half-orc Paladin · Ilse")).toBeInTheDocument();
    expect(within(card).getByText("AC 18")).toBeInTheDocument();
    expect(within(card).getByText("44 / 52")).toBeInTheDocument();
    expect(within(card).getByText("Lvl 3")).toBeInTheDocument();
    // Four at the table, one of them seated.
    expect(within(card).getByText("3 players have no character")).toBeInTheDocument();

    // The header's link is the one link on the card.
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Manage party");
    expect(links[0]).toHaveTextContent("Manage");
    expect(links[0]).toHaveAttribute("href", `${base}/party`);
  });

  it("draws a span of levels, and leaves out a stat nobody has written", async () => {
    server.routes.set(`GET ${base}/party`, {
      status: 200,
      body: [
        partySeat,
        seatWith({
          name: "Wren",
          level: 5,
          ac: null,
          hpMax: null,
          hpCurrent: null,
        }),
      ],
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Party");

    expect(within(card).getByText("Lvl 3–5")).toBeInTheDocument();
    const wren = within(card).getByText("Wren").closest("li")!;
    // No armour class and no hit points written: absent, not "AC —" or "0 / 0".
    expect(within(wren).queryByText(/^AC/)).toBeNull();
    expect(wren.querySelector("[data-slot='hp-fill']")).toBeNull();
    expect(within(card).getAllByText(/^AC \d+$/)).toHaveLength(1);
    expect(within(card).getByText("2 players have no character")).toBeInTheDocument();
  });

  it("says so when nobody has a character, and draws no level", async () => {
    server.routes.set(`GET ${base}/party`, { status: 200, body: [] });
    await renderScreen(mintingSession());
    const card = await cardOf("Party");

    expect(within(card).getByText("Nobody has a character yet.")).toBeInTheDocument();
    expect(within(card).queryByText(/^Lvl/)).toBeNull();
    expect(within(card).getByText("4 players have no character")).toBeInTheDocument();
  });
});

describe("the recent notes card", () => {
  const note = (id: string, title: string, updatedAt: string) => ({
    ...readAloud,
    id: `2b1f2a1e-0000-4000-8000-00000000080${id}`,
    title,
    kind: "note",
    attachedTo: null,
    updatedAt,
  });

  it("shows the three touched last, newest first, with how long ago", async () => {
    const notes = [
      note("2", "Oldest", "2026-06-01T10:00:00.000Z"),
      note("3", "Newest", "2026-09-20T10:00:00.000Z"),
      note("4", "Middle", "2026-08-01T10:00:00.000Z"),
      note("5", "Second", "2026-09-01T10:00:00.000Z"),
    ];
    server.routes.set(`GET ${base}/notes`, { status: 200, body: page(notes) });
    await renderScreen(mintingSession());
    const card = await cardOf("Recent notes");

    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Newest");
    expect(rows[1]).toHaveTextContent("Second");
    expect(rows[2]).toHaveTextContent("Middle");
    expect(within(card).queryByText("Oldest")).toBeNull();
    // The words are `agoOf`'s, against the clock the test runs at.
    const when = agoOf(
      Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-09-20T10:00:00.000Z"),
      Date.now(),
    );
    expect(within(rows[0]!).getByText(when)).toBeInTheDocument();

    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("All notes");
    expect(links[0]).toHaveAttribute("href", `${base}/notes`);
  });

  it("says so when there are none", async () => {
    server.routes.set(`GET ${base}/notes`, { status: 200, body: page([]) });
    await renderScreen(mintingSession());
    const card = await cardOf("Recent notes");

    expect(within(card).getByText(/No notes yet/)).toBeInTheDocument();
    expect(within(card).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("how long ago", () => {
  const at = Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-09-20T10:00:00.000Z");
  const later = (minutes: number) => DateTime.toEpochMillis(at) + minutes * 60_000;

  it("says it in the drawing's words, and falls back to the date", () => {
    expect(agoOf(at, later(0))).toBe("Just now");
    expect(agoOf(at, later(48))).toBe("48 min ago");
    expect(agoOf(at, later(3 * 60))).toBe("3 hr ago");
    expect(agoOf(at, later(26 * 60))).toBe("Yesterday");
    expect(agoOf(at, later(3 * 24 * 60))).toBe("3 days ago");
    expect(agoOf(at, later(9 * 24 * 60))).toBe("Last week");
    expect(agoOf(at, later(20 * 24 * 60))).toBe("2 weeks ago");
    expect(agoOf(at, later(60 * 24 * 60))).toBe("20 September 2026");
    // A clock a little behind the server's is not the future.
    expect(agoOf(at, later(-5))).toBe("Just now");
  });
});

describe("the next session card", () => {
  it("names the night, opens on its read-aloud and lists what is on deck", async () => {
    // `encounter` is the first on deck and the note hangs off it.
    expect(readAloud.attachedTo.id).toBe(encounter.id);
    await renderScreen(mintingSession());
    const card = await cardOf("Session 12");

    expect(within(card).getByText("Next session")).toBeInTheDocument();
    expect(within(card).getByText("2 encounters on deck")).toBeInTheDocument();
    // The first read-aloud written for the first encounter on deck, verbatim
    // and in the read-aloud face.
    const prose = within(card).getByText(readAloud.body);
    expect(prose).toHaveClass("font-serif", "italic", "text-body-l", "leading-loose");
    expect(within(card).getByText("Opening read-aloud")).toBeInTheDocument();

    const rows = within(card).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Ambush in the reeds");
    expect(rows[0]).toHaveTextContent("Medium · 6 creatures · Marsh, Night");
    expect(rows[1]).toHaveTextContent("Unrated · 1 creature · Boss");
    // The row opens its encounter selected on the Encounters tab, from its
    // name's link, which covers the row; its own verbs are buttons above it.
    const open = within(rows[0]!).getByRole("link", { name: "Ambush in the reeds" });
    expect(open).toHaveAttribute("href", `${base}/encounters?encounter=${encounter.id}`);
    expect(open).toHaveAttribute("data-card-link");
    expect(
      within(rows[0]!).getByRole("button", { name: "Run Ambush in the reeds" }),
    ).toBeInTheDocument();
    // Its *Edit* is the encounter builder, a page of its own.
    expect(
      within(rows[0]!).getByRole("button", { name: "Edit Ambush in the reeds" }),
    ).toHaveAttribute("href", `${base}/encounters/${encounter.id}/edit`);

    expect(within(card).getByRole("link", { name: "All encounters" })).toHaveAttribute(
      "href",
      `${base}/encounters`,
    );
    // The checklist the drawing dropped is this card's own section.
    expect(within(card).getByRole("heading", { name: "Before you sit down" })).toBeInTheDocument();
    expect(
      within(card).getByRole("checkbox", { name: "Reread the reeds ambush" }),
    ).toBeInTheDocument();
    // Ready or Draft is the DM's word off each encounter's prep; the
    // redesign's date and CR are not on the wire.
    expect(within(rows[0]!).getByText("Draft")).toBeInTheDocument();
    expect(within(card).queryByText(/CR \d/)).toBeNull();
  });

  it("uses the night's own title when it has one", async () => {
    server.routes.set(`GET ${base}/sessions/${sessionId}`, {
      status: 200,
      body: { ...session, title: "Into the salt flats" },
    });
    await renderScreen(mintingSession());
    expect(await cardOf("Into the salt flats")).toBeTruthy();
  });

  it("draws no read-aloud when the first encounter has none", async () => {
    // The note hangs off the *second* encounter now: not the night's opening.
    server.routes.set(`GET ${base}/notes`, {
      status: 200,
      body: page([{ ...readAloud, attachedTo: { kind: "encounter", id: sketch.id } }]),
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Session 12");

    expect(within(card).queryByText("Opening read-aloud")).toBeNull();
    expect(within(card).queryByText(readAloud.body)).toBeNull();
  });

  it("adds an encounter in the same builder the Encounters tab opens", async () => {
    await renderScreen(mintingSession());
    const card = await cardOf("Session 12");

    const add = within(card).getByRole("button", { name: "Add encounter" });
    // A section's create is never the screen's peach.
    expect(add).not.toHaveClass("bg-accent");
    expect(add).toHaveAttribute("href", `${base}/encounters/new`);
    await userEvent.click(add);
    expect(
      await screen.findByRole("heading", { level: 1, name: "New encounter" }),
    ).toBeInTheDocument();
  });

  it("says Ready on a row the DM has said is ready", async () => {
    server.routes.set(`GET ${base}/encounter-prep`, {
      status: 200,
      body: [{ ...encounterPrep, ready: true }],
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Session 12");
    const rows = within(card).getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Ready")).toBeInTheDocument();
    // No prep read for the second, so no word for it either rather than a guess.
    expect(within(rows[1]!).queryByText(/^(Ready|Draft)$/)).toBeNull();
  });

  it("says so with no night open and nothing built", async () => {
    server.routes.set(`GET ${base}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });
    server.routes.set(`GET ${base}/encounters`, { status: 200, body: page([]) });
    await renderScreen(mintingSession());
    const card = await cardOf("Nothing is running yet");

    expect(within(card).getByText("No encounters yet")).toBeInTheDocument();
    // The press that opens the night is the campaign row's, not the card's.
    expect(within(card).queryByRole("button", { name: "Start session" })).toBeNull();
    expect(
      within(campaignRow()).getByRole("button", { name: "Start session" }),
    ).toBeInTheDocument();
    expect(within(card).getByText(/No session in the works/)).toBeInTheDocument();
    // Nothing is open, so there is nothing to finish.
    expect(screen.queryByRole("button", { name: "Finish the night" })).toBeNull();
  });
});

describe("the live banner", () => {
  /** A fight on the table: `liveFight`'s night, and its run in the night's list. */
  const onTheTable = (startedAt: string | null) => {
    for (const [route, answer] of liveFight()) server.routes.set(route, answer);
    server.routes.set(`GET ${base}/sessions/${sessionId}`, {
      status: 200,
      body: { ...runningSession, startedAt },
    });
    server.routes.set(`GET ${base}/sessions/${sessionId}/runs`, {
      status: 200,
      body: [{ ...liveRun, round: 3 }],
    });
  };

  it("says which night, which fight and how far in, with the way back and the way out", async () => {
    const startedAt = new Date(Date.now() - 48 * 60_000).toISOString();
    onTheTable(startedAt);
    await renderScreen(mintingSession());

    const banner = (await screen.findByText("Session 12 is running")).closest<HTMLElement>(
      "[data-slot='card']",
    )!;
    expect(
      within(banner).getByText("Round 3 of Ambush in the reeds · started 48 min ago"),
    ).toBeInTheDocument();

    // One way back on the whole screen, and it is the campaign row's press:
    // neither the banner nor the *Next session* card draws it a second time.
    const back = await within(campaignRow()).findByRole("button", { name: "Back to the fight" });
    expect(screen.getAllByRole("button", { name: "Back to the fight" })).toEqual([back]);

    // Finishing the night stays reachable while a fight is on the table.
    const finish = screen.getAllByRole("button", { name: "Finish the night" });
    expect(finish).toHaveLength(1);
    expect(banner).toContainElement(finish[0]!);

    // And the row for the fight on the table says so.
    expect(screen.getByRole("button", { name: /On the table now/ })).toBeInTheDocument();
  });

  it("goes back to the fight from the campaign row", async () => {
    onTheTable(null);
    await renderScreen(mintingSession());

    const banner = (await screen.findByText("Session 12 is running")).closest<HTMLElement>(
      "[data-slot='card']",
    )!;
    // No start stamp, so no elapsed time rather than a guessed one.
    expect(within(banner).getByText("Round 3 of Ambush in the reeds")).toBeInTheDocument();

    await userEvent.click(
      await within(campaignRow()).findByRole("button", { name: "Back to the fight" }),
    );
    await waitFor(() =>
      expect(window.location.pathname).toBe(`${base}/sessions/${sessionId}/runs/${liveRun.id}`),
    );
  });

  it("is absent with no fight on the table", async () => {
    await renderScreen(mintingSession());
    await cardOf("Session 12");
    expect(screen.queryByText(/is running$/)).toBeNull();
  });
});

describe("the last time card", () => {
  it("is absent before the table has finished a night", async () => {
    // `fullCampaign`'s only night is the open one.
    await renderScreen(mintingSession());
    await cardOf("Session 12");
    expect(screen.queryByRole("heading", { name: "Last time" })).toBeNull();
    expect(server.calls.some((call) => call.pathname.endsWith("/recap"))).toBe(false);
  });

  it("quotes the last finished night's beats verbatim, with the way to the chronicle", async () => {
    server.routes.set(`GET ${base}/sessions`, { status: 200, body: sessions });
    server.routes.set(`GET ${base}/sessions/${session11.id}/recap`, {
      status: 200,
      body: recap11,
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Last time");

    expect(
      within(card).getByText(
        `Session 11 · ${dayOf(Schema.decodeSync(Schema.DateTimeUtcFromString)(session11.startedAt!))}`,
      ),
    ).toBeInTheDocument();
    expect(within(card).getByText(recap11.beats[0]!.body)).toBeInTheDocument();
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Read the chronicle");
    expect(links[0]).toHaveAttribute("href", `${base}/chronicle`);
  });

  it("tells a night with no beats by its fights, and one with neither says so", async () => {
    server.routes.set(`GET ${base}/sessions`, { status: 200, body: sessions });
    server.routes.set(`GET ${base}/sessions/${session11.id}/recap`, {
      status: 200,
      body: { ...recap11, beats: [] },
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Last time");
    expect(
      within(card).getByText(/Paused at round \d+ when the night ended\./),
    ).toBeInTheDocument();
  });

  it("says so when nothing was written down", async () => {
    server.routes.set(`GET ${base}/sessions`, { status: 200, body: sessions });
    server.routes.set(`GET ${base}/sessions/${session11.id}/recap`, {
      status: 200,
      body: { ...recap11, beats: [], fights: [] },
    });
    await renderScreen(mintingSession());
    const card = await cardOf("Last time");
    expect(within(card).getByText("Nothing was written down that night.")).toBeInTheDocument();
  });
});
