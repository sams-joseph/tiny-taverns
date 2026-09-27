import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { seatId } from "../test/ids";
import { beat, sharedBeat, summary11 } from "./chronicle.fixtures";
import {
  campaignId,
  installPlayerChronicleServer,
  playerChronicle,
  renderPlayerChronicle,
  session11Id,
} from "./player.fixtures";

/**
 * The player's Chronicle against a stub server.
 *
 * The property worth more than the rest is pinned first: **the screen reads the
 * narrow endpoint and only the narrow endpoint**, which is what makes a mistake
 * here a blank page rather than a disclosure. The rest is the DM's layout,
 * through the same components, less what is the DM's.
 */
const server = installPlayerChronicleServer();

beforeEach(() => {
  server.reset();
});

const paths = (): ReadonlyArray<string> => server.calls.map((call) => call.pathname);

/** A night's card, and the button that opens it — see `ChronicleScreen.test.tsx`. */
const night = (n: number): Promise<HTMLElement> =>
  waitFor(() => {
    const card = document.getElementById(`session-${String(n)}`);
    if (card === null) throw new Error(`no card for session ${String(n)}`);
    return card;
  });
const header = async (n: number): Promise<HTMLElement> =>
  within(await night(n)).getByRole("button", { name: new RegExp(`Session ${String(n)}`) });

const recordPath = `/campaigns/${campaignId}/chronicle/player`;

/** Answers `GET …/chronicle/player` with these nights instead of the fixture's. */
const recordIs = (nights: ReadonlyArray<unknown>): void => {
  server.routes.set(`GET ${recordPath}`, { status: 200, body: nights });
};

describe("what it reads", () => {
  it("asks for the player's record and never for the DM's", async () => {
    await renderPlayerChronicle();
    await header(12);

    expect(paths()).toContain(recordPath);
    // The DM's is `…/chronicle` exactly, and it is behind the creator gate. A
    // suffix test rather than a substring one: `…/chronicle/player` contains it.
    expect(paths().some((path) => path.endsWith("/chronicle"))).toBe(false);
    expect(paths().some((path) => path.endsWith("/recap"))).toBe(false);
    expect(paths().some((path) => path.endsWith("/prep"))).toBe(false);
    expect(paths().some((path) => path.endsWith("/search"))).toBe(false);
  });

  it("reads the record once, and opening a night reads nothing more", async () => {
    await renderPlayerChronicle();
    const older = await header(11);
    const before = server.calls.length;

    await userEvent.click(older);
    await within(await night(11)).findByText(sharedBeat.body);
    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));

    expect(server.calls.length).toBe(before);
    expect(paths().filter((path) => path === recordPath)).toHaveLength(1);
    expect(paths().some((path) => path.includes("/recap"))).toBe(false);
  });
});

describe("the nights", () => {
  it("says how many were shared and since when, and indexes them", async () => {
    await renderPlayerChronicle();

    expect(await screen.findByText("2 sessions shared with you · since July 2026")).toBeVisible();
    const index = screen.getByRole("list", { name: "Jump to" });
    expect(
      within(index)
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual(["12Session 12", "11Session 11"]);
  });

  it("draws no Spotlight, even over nights that name a seat", async () => {
    // The pointer is the player's to read on a shared night (the server
    // nulls it for a seat they cannot see), and their own party read names
    // it on the night's card; the counts are the DM's.
    recordIs(
      playerChronicle.map((night) => ({
        ...night,
        session: { ...night.session, spotlightSeatId: seatId },
      })),
    );
    await renderPlayerChronicle();
    await header(12);

    expect(screen.getByRole("list", { name: "Jump to" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Spotlight" })).toBeNull();
    expect(screen.queryByText(/in the spotlight/)).toBeNull();
  });

  it("clamps a shared night's summary on its closed card", async () => {
    await renderPlayerChronicle();
    const preview = (await night(11)).querySelector("[data-slot=night-preview]")!;

    expect(preview).toHaveTextContent(summary11);
    expect(preview).toHaveClass("line-clamp-2");
  });

  it("expands and collapses every night", async () => {
    await renderPlayerChronicle();
    const newest = await header(12);
    const older = await header(11);

    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(newest).toHaveAttribute("aria-expanded", "true");
    expect(older).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(newest).toHaveAttribute("aria-expanded", "false");
    expect(older).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the night `?session=` names", async () => {
    await renderPlayerChronicle(`?session=${session11Id}`);

    expect(await header(11)).toHaveAttribute("aria-expanded", "true");
    expect(await header(12)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("an opened night, as a player is told it", () => {
  const openEleven = async (): Promise<HTMLElement> => {
    await renderPlayerChronicle();
    await userEvent.click(await header(11));
    const card = await night(11);
    await within(card).findByText(sharedBeat.body);
    return card;
  };

  it("bullets the moments the DM shared, and draws no DM-only box", async () => {
    const card = await openEleven();

    const moments = within(card).getByRole("list", { name: "Moments" });
    expect(within(moments).getByText(sharedBeat.body)).toBeInTheDocument();
    expect(card).not.toHaveTextContent("DM only");
    expect(card).not.toHaveTextContent(beat.body);
  });

  it("names encounters by kind, as the server told them, and links none of them", async () => {
    const card = await openEleven();

    const chips = [...card.querySelectorAll("[data-slot=encounter-chip]")];
    // The conversation's encounter is not Shared and Ready, so the server
    // told its kind rather than its name.
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "A conversation",
      "Ambush in the reeds",
    ]);
    expect(chips.map((chip) => chip.getAttribute("data-kind"))).toEqual(["social", "combat"]);
    expect(chips[0]!.querySelector("svg")).toHaveClass("lucide-users");
    expect(within(card).queryAllByRole("link")).toHaveLength(0);
    expect(card).not.toHaveTextContent("Toll bridge standoff");
  });

  it("says no monster's numbers and no fight's story", async () => {
    const card = await openEleven();

    // The fixture's monsters carry bands on this read and nothing else; the
    // card draws no roll call at all.
    expect(card).not.toHaveTextContent(/Bloodied|Marsh Hag|\bAC\b|6\/52/);
    expect(card).not.toHaveTextContent(/Paused at round/);
  });

  it("says so when the DM shared the night and nothing in it", async () => {
    recordIs([{ ...playerChronicle[0], runs: [], beats: [] }, playerChronicle[1]]);
    await renderPlayerChronicle();

    expect(
      await screen.findByText("Nothing from this night has been shared beyond the date."),
    ).toBeInTheDocument();
  });
});

describe("a table that has shared nothing", () => {
  it("is what a player who joined last night sees, and it names who decides", async () => {
    recordIs([]);
    await renderPlayerChronicle();

    expect(await screen.findByText("No nights shared yet")).toBeInTheDocument();
    expect(screen.getByText(/Your DM decides which nights/)).toBeInTheDocument();
    expect(screen.getByText("0 sessions shared with you")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Jump to" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand all" })).toBeNull();
  });
});

describe("when the load fails", () => {
  it("says so plainly, with a way to try again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);
    await renderPlayerChronicle();

    expect(await screen.findByRole("alert")).toHaveTextContent("Not here");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
