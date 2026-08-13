import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  brannocOwned,
  campaignId,
  emptyParty,
  installPartyServer,
  renderParty,
} from "./party.fixtures";

/**
 * The party screen against a stub server: the roster, the invitations, *Needs
 * you*, and the states a real table puts it in.
 *
 * Installed once at module scope for the `Context.Reference` reason
 * `api/client.test.ts` records — a per-test `vi.stubGlobal("fetch")` would keep
 * serving the first test's answers with nothing to notice.
 */
const server = installPartyServer();

beforeEach(() => {
  server.reset();
});

const called = (method: string, fragment: string): boolean =>
  server.calls.some((call) => call.method === method && call.pathname.includes(fragment));

describe("the roster", () => {
  it("draws a member with a character and one without, and somebody invited", async () => {
    await renderParty();

    expect(await screen.findByText("Ilse Vantar")).toBeInTheDocument();
    expect(screen.getByText("Playing")).toBeInTheDocument();
    expect(screen.getByText(/Brannoc · Level 3 Half-orc Paladin/)).toBeInTheDocument();

    expect(screen.getByText("Kofi Adeyemi")).toBeInTheDocument();
    expect(screen.getByText("No character")).toBeInTheDocument();

    // The invitation is a person, because one invitation grants one membership.
    expect(screen.getByText("Hal")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("names the DM, and says what is true instead of counting seats", async () => {
    await renderParty();

    const dm = await screen.findByText("Wren Alderby");
    // Scoped to the roster row: the shell's role switch carries a *DM* of its
    // own on every screen now, and the badge under test is this person's.
    expect(within(dm.parentElement ?? dm).getByText("DM")).toBeInTheDocument();
    expect(screen.getByText("2 players, 1 invitation outstanding")).toBeInTheDocument();

    // The three the decision removed, none of which has anything behind it.
    expect(screen.queryByText(/seat/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add seat/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/approve characters/i)).not.toBeInTheDocument();
  });

  it("draws a redeemed invitation as the member it granted, and not twice", async () => {
    await renderParty();

    await screen.findByText("Ilse Vantar");
    // `takenInvite` is labelled "Ilse" and is in the list the screen read.
    expect(screen.getAllByText(/Ilse/)).toHaveLength(1);
  });
});

describe("needs you", () => {
  it("names the member with no character and the invitation nobody has taken", async () => {
    await renderParty();

    expect(
      await screen.findByText("Kofi Adeyemi has joined the table and has no character yet."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hal has been waiting \d+ days/)).toBeInTheDocument();
    // The level line: levels 3, 1 and 3, so the party's middle level is 3 and
    // one character is behind it.
    expect(screen.getByText(/Sorrel Ash is level 1 and the party is mostly level 3/)).toBeVisible();
  });
});

describe("assigning a character", () => {
  it("gives an unassigned character to a member who has none", async () => {
    await renderParty();

    await userEvent.click(
      await screen.findByRole("button", { name: "Give Kofi Adeyemi a character" }),
    );

    // The select is keyboard-driven; the option list is what matters here.
    expect(await screen.findByText(/Only characters nobody holds are listed/)).toBeInTheDocument();
    // Brannoc is Ilse's, so he is not on offer.
    expect(screen.queryByRole("option", { name: /Brannoc/ })).not.toBeInTheDocument();
  });

  it("takes a character back, and re-reads the roster", async () => {
    await renderParty();

    await userEvent.click(
      await screen.findByRole("button", { name: "Change Ilse Vantar's character" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /Take it back/ }));

    await waitFor(() => {
      expect(called("POST", `/characters/${brannocOwned.id}/assign`)).toBe(true);
    });
    const call = server.calls.find((entry) => entry.pathname.includes("/assign"));
    // `null` unassigns — the endpoint's own second meaning, and the only way a
    // mistyped assignment is fixable from the screen that shows it.
    expect(JSON.parse(call!.body)).toEqual({ accountId: null });
  });

  it("says where characters are written down when there is nothing to give", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/characters`, {
      status: 200,
      body: [brannocOwned],
    });
    await renderParty();

    await userEvent.click(
      await screen.findByRole("button", { name: "Give Kofi Adeyemi a character" }),
    );
    expect(
      await screen.findByText(/No character in this campaign is unassigned/),
    ).toBeInTheDocument();
  });
});

describe("the invitations", () => {
  it("opens the one invitation surface rather than drawing a second", async () => {
    await renderParty();

    await userEvent.click(await screen.findByRole("button", { name: /Invite a player/ }));

    // `InviteDialog`, reused whole: its own copy, its own list, its own
    // withdrawn-before-taken precedence.
    expect(await screen.findByText(/A link is an invitation to join, not a way in/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Make a link/ })).toBeInTheDocument();
    // The drawn reusable link is not a thing this product has.
    expect(screen.queryByText(/uses/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Link accepts new players/i)).not.toBeInTheDocument();
  });
});

describe("the states a real screen has", () => {
  it("says what a campaign with nobody at it should do next", async () => {
    server.routes = emptyParty();
    await renderParty();

    expect(await screen.findByText("Nobody else at the table yet")).toBeInTheDocument();
    // The one affordance, named in the sentence and standing in the bar.
    expect(screen.getAllByText(/Invite a player/).length).toBeGreaterThan(0);
    // A private campaign says so here, because an invitation sent before it is
    // shared lands somebody on a blank page.
    expect(screen.getByText(/share it from the campaign screen/)).toBeInTheDocument();
    expect(screen.getByText(/Once somebody joins, whatever wants doing/)).toBeInTheDocument();
  });

  it("says the server did not answer, and offers to try again", async () => {
    server.transportDown = true;
    await renderParty();

    expect(await screen.findByText("The server did not answer")).toBeInTheDocument();
    server.transportDown = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ilse Vantar")).toBeInTheDocument();
  });

  it("answers a roster this credential cannot read the way the server does", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/members`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderParty();

    // The `DmActor` gate refuses a player with the ordinary `NotFound`, and the
    // screen says "Not here" rather than inventing a narrower page.
    expect(await screen.findByText("Not here")).toBeInTheDocument();
  });

  it("reads the roster, the invitations and the characters in one round", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");

    expect(called("GET", "/members")).toBe(true);
    expect(called("GET", "/invites")).toBe(true);
    expect(called("GET", "/characters")).toBe(true);
    // Nothing is read per row: the join is done here, from three lists.
    expect(server.calls.filter((call) => call.method === "GET")).toHaveLength(4);
  });

  it("does not read anything Hob's panel would, because it is closed", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");
    expect(called("GET", "/hob")).toBe(false);
  });
});
