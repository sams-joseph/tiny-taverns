import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { character, characterSeat } from "../campaign/campaign.fixtures";
import {
  beat,
  bridgeEncounterId,
  campaignId,
  installChronicleServer,
  recap12,
  renderChronicle,
  session11,
  session11Id,
  session12,
  session12Id,
  sharedBeat,
} from "./chronicle.fixtures";

/**
 * The DM's Chronicle against a stub server: the nights, what an opened one
 * says, *Jump to*, the `?session=` link, and the states a real campaign puts
 * it in.
 *
 * Installed once at module scope for the `Context.Reference` reason
 * `api/client.test.ts` records — a per-test `vi.stubGlobal("fetch")` would keep
 * serving the first test's answers with nothing to notice.
 */
const server = installChronicleServer();

beforeEach(() => {
  server.reset();
});

const requested = (fragment: string): boolean =>
  server.calls.some((call) => call.pathname.includes(fragment));

/**
 * A night's card, and the button that opens it. By the card rather than by the
 * whole screen: *Jump to* has a "Session 11" button too, and the campaign row's
 * badge says "Session 12".
 */
const night = (n: number): Promise<HTMLElement> =>
  waitFor(() => {
    const card = document.getElementById(`session-${String(n)}`);
    if (card === null) throw new Error(`no card for session ${String(n)}`);
    return card;
  });
const header = async (n: number): Promise<HTMLElement> =>
  within(await night(n)).getByRole("button", { name: new RegExp(`Session ${String(n)}`) });

describe("the nights", () => {
  it("lists every night, newest first, opens the newest, and says how long the record runs", async () => {
    await renderChronicle();

    const newest = await header(12);
    const older = await header(11);
    expect(newest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newest).toHaveAttribute("aria-expanded", "true");
    expect(older).toHaveAttribute("aria-expanded", "false");
    expect(await screen.findByText("2 sessions · since July 2026")).toBeInTheDocument();

    // Only the open card's recap is read. A closed card costs no request.
    await waitFor(() => {
      expect(requested(`${session12Id}/recap`)).toBe(true);
    });
    expect(requested(`${session11Id}/recap`)).toBe(false);
  });

  it("names an untitled night by its number, and a closed one by how long it ran", async () => {
    await renderChronicle();
    const card = await night(11);

    expect(within(card).getByRole("heading", { name: "Session 11" })).toBeInTheDocument();
    expect(within(card).getByText("19 July 2026")).toBeInTheDocument();
    expect(within(card).getByText("18:00–22:30 · 4 hr 30 min")).toBeInTheDocument();
  });

  it("keeps any number of nights open at once, each its own toggle", async () => {
    await renderChronicle();
    const older = await header(11);

    await userEvent.click(older);
    expect(older).toHaveAttribute("aria-expanded", "true");
    expect(await header(12)).toHaveAttribute("aria-expanded", "true");
    expect(requested(`${session11Id}/recap`)).toBe(true);

    await userEvent.click(older);
    expect(older).toHaveAttribute("aria-expanded", "false");
  });
});

describe("an opened night", () => {
  const openEleven = async (): Promise<HTMLElement> => {
    await renderChronicle();
    await userEvent.click(await header(11));
    const card = await night(11);
    await within(card).findByText(sharedBeat.body);
    return card;
  };

  it("bullets the moments the table was told, and boxes the one the DM kept back", async () => {
    const card = await openEleven();

    const moments = within(card).getByRole("list", { name: "Moments" });
    expect(within(moments).getByText(sharedBeat.body)).toBeInTheDocument();
    expect(within(moments).queryByText(beat.body)).toBeNull();

    const kept = within(card).getByText(beat.body).parentElement!.parentElement!;
    expect(within(kept).getByText("DM only")).toBeInTheDocument();
    expect(within(kept).queryByText(sharedBeat.body)).toBeNull();
  });

  it("chips each encounter with its kind's glyph, and opens the ones still there", async () => {
    const card = await openEleven();
    const chips = card.querySelectorAll("[data-slot=encounter-chip]");
    expect([...chips].map((chip) => chip.textContent)).toEqual([
      "Toll bridge standoff",
      "Ambush in the reeds",
    ]);

    // A conversation wears the conversation glyph, not the fight's swords.
    const bridge = within(card).getByRole("link", { name: "Toll bridge standoff" });
    expect(bridge).toHaveAttribute("data-kind", "social");
    expect(bridge.querySelector("svg")).toHaveClass("lucide-users");
    expect(bridge).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/encounters?encounter=${bridgeEncounterId}`,
    );

    // The fight's encounter is gone (`encounterId` is null), so its chip is
    // text: there is nothing left to open.
    const ambush = [...chips].find((chip) => chip.textContent === "Ambush in the reeds")!;
    expect(ambush.tagName).toBe("SPAN");
    expect(ambush.querySelector("svg")).toHaveClass("lucide-swords");
  });

  it("does not tell a fight's story, its read-alouds or its ticked prep", async () => {
    const card = await openEleven();

    expect(within(card).queryByText(/Paused at round/)).toBeNull();
    expect(within(card).queryByText("Read aloud at the water")).toBeNull();
    expect(within(card).queryByText("Pick a name for the ferryman")).toBeNull();
  });

  it("says so when nothing was kept for the night", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/sessions/${session12Id}/recap`, {
      status: 200,
      body: { ...recap12, fights: [], beats: [] },
    });
    await renderChronicle();

    expect(await screen.findByText(/Nothing was written down for this night/)).toBeInTheDocument();
  });
});

describe("what the drawing left off", () => {
  it("has no search, no Read aloud and no Threads still open", async () => {
    await renderChronicle();
    await header(12);

    expect(screen.queryByLabelText("Search the record")).toBeNull();
    expect(screen.queryByRole("button", { name: /Read aloud/ })).toBeNull();
    expect(screen.queryByText("Threads still open")).toBeNull();
    expect(requested("/search")).toBe(false);
  });
});

describe("jump to", () => {
  const scrolled = vi.fn();
  beforeEach(() => {
    // jsdom has no `scrollIntoView`; the screen skips it when it is missing.
    Element.prototype.scrollIntoView = scrolled;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    scrolled.mockReset();
  });

  it("opens the night it names and brings its card into view", async () => {
    await renderChronicle();
    const index = await screen.findByRole("list", { name: "Jump to" });
    const older = await header(11);
    expect(older).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(within(index).getByRole("button", { name: /Session 11/ }));

    expect(older).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(scrolled.mock.contexts.at(-1)).toHaveAttribute("id", "session-11");
  });

  it("opens and scrolls to the night `?session=` names, and only that night", async () => {
    await renderChronicle(`?session=${session11Id}`);

    const older = await header(11);
    expect(older).toHaveAttribute("aria-expanded", "true");
    expect(await header(12)).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(scrolled.mock.contexts.at(-1)).toHaveAttribute("id", "session-11");
  });

  it("opens the newest when `?session=` names a night it does not hold", async () => {
    await renderChronicle("?session=2b1f2a1e-0000-4000-8000-000000000599");

    expect(await header(12)).toHaveAttribute("aria-expanded", "true");
    expect(await header(11)).toHaveAttribute("aria-expanded", "false");
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe("the spotlight", () => {
  const brannocSeatId = characterSeat.id;
  const odoSeatId = "2b1f2a1e-0000-4000-8000-000000000964";
  const retiredSeatId = "2b1f2a1e-0000-4000-8000-000000000965";

  /** Brannoc and Odo at the table, and a night each for the table to count. */
  const seatTheParty = (spots: readonly [string | null, string | null]) => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: [
        { seat: { ...characterSeat, campaignId }, character },
        {
          seat: { ...characterSeat, campaignId, id: odoSeatId, displayName: "Odo" },
          character: null,
        },
      ],
    });
    server.routes.set(`GET /campaigns/${campaignId}/sessions`, {
      status: 200,
      body: [
        { ...session12, spotlightSeatId: spots[0] },
        { ...session11, spotlightSeatId: spots[1] },
      ],
    });
  };

  it("counts each seat's nights and names the one who has had the fewest", async () => {
    seatTheParty([brannocSeatId, brannocSeatId]);
    await renderChronicle();

    const counts = await screen.findByRole("list", { name: "Spotlight" });
    const rows = within(counts).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Brannoc2", "Odo0"]);
    // The fewest wear the accent and the rest the info colour — the semantic
    // tokens, never the ramp steps the drawing named.
    const fill = (row: HTMLElement) => row.querySelector("[data-slot=spotlight-fill]");
    expect(fill(rows[0]!)).toHaveClass("bg-info");
    expect(fill(rows[0]!)).toHaveStyle({ width: "100%" });
    expect(fill(rows[1]!)).toHaveClass("bg-accent");
    expect(fill(rows[1]!)).toHaveStyle({ width: "0%" });
    expect(
      screen.getByText(
        "Odo has had the fewest sessions in the spotlight. Worth giving them a beat next time.",
      ),
    ).toBeInTheDocument();
  });

  it("marks nobody when the table is level", async () => {
    seatTheParty([odoSeatId, brannocSeatId]);
    await renderChronicle();

    const counts = await screen.findByRole("list", { name: "Spotlight" });
    expect(counts.querySelectorAll(".bg-accent")).toHaveLength(0);
    expect(screen.queryByText(/fewest sessions in the spotlight/)).toBeNull();
  });

  it("is not drawn until a night names somebody still at the table", async () => {
    seatTheParty([null, retiredSeatId]);
    await renderChronicle();
    await header(12);

    expect(screen.getByRole("list", { name: "Jump to" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Spotlight" })).toBeNull();
  });
});

describe("a campaign with no history at all", () => {
  it("is the state a new DM sees first, and it says what fills it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/sessions`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: {
        ...JSON.parse(JSON.stringify(server.routes.get(`GET /campaigns/${campaignId}`)?.body)),
        currentSessionId: null,
      },
    });
    await renderChronicle();

    expect(await screen.findByText("Nothing written down yet")).toBeInTheDocument();
    expect(screen.getByText(/every beat you jot/)).toBeInTheDocument();
    expect(screen.getByText("0 sessions")).toBeInTheDocument();
    // No index over an empty list, and nothing to count.
    expect(screen.queryByRole("list", { name: "Jump to" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Spotlight" })).toBeNull();
  });
});

describe("when the load fails", () => {
  it("says so plainly, with a way to try again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);
    await renderChronicle();

    expect(await screen.findByRole("alert")).toHaveTextContent("Not here");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
