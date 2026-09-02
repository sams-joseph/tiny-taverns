import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { groupId } from "../campaign/campaign.fixtures";
import {
  brannocSeat,
  campaignId,
  emptyParty,
  installPartyServer,
  liveInvite,
  renderParty,
  sorrelSeatId,
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
    // Scoped to the roster: the screen grew a second list when the campaign
    // screen's Party tab was folded in, and a character's *player name* is
    // legitimately "Ilse" there. The claim is about the roster drawing one
    // person once, not about the string appearing once on the page.
    const roster = screen.getByRole("region", { name: "Who is at the table" });
    expect(within(roster).getAllByText(/Ilse/)).toHaveLength(1);
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

/**
 * The creator's seat verbs — what replaced assignment.
 *
 * Under the continuity decision of 2026-09-01 a character is its owner's,
 * seated by its owner: re-pointing one at another account is not a refused
 * request, it is not *expressible* — no endpoint carries an `accountId`. What
 * the creator manages is the **seat**: whether the table may see it, and
 * whether it stays. Both verbs live on the character list, both name
 * `reads.party`, and the re-read that follows is how the row redraws.
 */
describe("the creator's seat verbs", () => {
  it("shares a seat with the table, and re-reads the party", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");

    const mark = server.calls.length;
    await userEvent.click(
      await screen.findByRole("button", { name: "Share Brannoc with the table" }),
    );

    await waitFor(() => {
      expect(called("PATCH", `/party/${brannocSeat.seat.id}`)).toBe(true);
    });
    const call = server.calls.find(
      (entry) => entry.method === "PATCH" && entry.pathname.includes("/party/"),
    );
    // The seat's own column and nothing else: the shared character does not
    // move, because sharing is a fact about the table, not the sheet.
    expect(JSON.parse(call!.body)).toEqual({ visibility: "shared" });
    await waitFor(() => {
      expect(
        server.calls.filter(
          (entry, index) =>
            index >= mark && entry.method === "GET" && entry.pathname.endsWith("/party"),
        ),
      ).toHaveLength(1);
    });
  });

  it("retires a seat, and the row is history rather than deleted", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");

    await userEvent.click(await screen.findByRole("button", { name: "Retire Sorrel Ash's seat" }));

    // `DELETE` on the wire, `left_at` on the row: the server retires rather
    // than deletes, so the owner keeps the character and a rejoin is a fresh
    // seat. What this screen owes is the request and the re-read.
    await waitFor(() => {
      expect(called("DELETE", `/party/${sorrelSeatId}`)).toBe(true);
    });
  });

  it("offers no way to assign, because assignment is not a thing", async () => {
    await renderParty();
    await screen.findByText("Kofi Adeyemi");

    // The old controls, gone with the model: a member with no character is a
    // person to nudge (see *Needs you*), not a slot the creator fills.
    expect(screen.queryByRole("button", { name: /Give .* a character/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change .*'s character/ })).not.toBeInTheDocument();
  });
});

/**
 * **What the two invitation writes refresh, and what they do not.**
 *
 * Withdrawing is the write on this screen that moves a row the request never
 * mentions: revoking a *spent* invitation revokes the membership it granted, in
 * the same transaction (`repo/Invites.ts`), so the roster loses a person while
 * the response carries only an invitation. That is why `InviteDialog` names
 * `reads.members` beside `reads.invites`, and it is what this pins.
 *
 * Minting is the mirror and pins the other half: it names the invitations
 * alone, so the members are *not* re-read. Both counts would have been the same
 * before — the screen re-read everything either way — which is exactly why they
 * are worth asserting now.
 */
describe("what an invitation write refreshes", () => {
  const reads = (from: number, fragment: string): number =>
    server.calls.filter(
      (call, index) => index >= from && call.method === "GET" && call.pathname.endsWith(fragment),
    ).length;

  it("withdrawing one re-reads the members as well as the invitations", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");
    await userEvent.click(screen.getByRole("button", { name: /Invite a player/ }));
    await screen.findByRole("button", { name: /Make a link/ });

    const mark = server.calls.length;
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(reads(mark, "/invites")).toBe(1));
    // The row the write never sent.
    expect(reads(mark, "/members")).toBe(1);
    // And nothing wider: the campaign, its encounters and its notes are none of
    // an invitation's business.
    expect(reads(mark, "/encounters")).toBe(0);
    expect(reads(mark, "/notes")).toBe(0);
  });

  it("minting one re-reads the invitations and leaves the members alone", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");
    await userEvent.click(screen.getByRole("button", { name: /Invite a player/ }));
    await screen.findByRole("button", { name: /Make a link/ });

    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Make a link/ }));

    await waitFor(() => expect(reads(mark, "/invites")).toBe(1));
    expect(reads(mark, "/members")).toBe(0);
  });

  /**
   * The roster behind the dialog is the same atom the dialog reads, so a mint
   * reaches it without a second request and without a callback — which the
   * screen used to need and no longer passes.
   */
  it("shows a minted invitation on the roster underneath, from the one read", async () => {
    server.routes.set(`GET /groups/${groupId}/invites`, { status: 200, body: [] });
    await renderParty();
    await screen.findByText("Ilse Vantar");
    await userEvent.click(screen.getByRole("button", { name: /Invite a player/ }));
    await screen.findByRole("button", { name: /Make a link/ });

    server.routes.set(`GET /groups/${groupId}/invites`, {
      status: 200,
      body: [liveInvite],
    });
    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Make a link/ }));

    await waitFor(() => expect(reads(mark, "/invites")).toBe(1));

    // Closing the dialog reads nothing — the roster underneath was refreshed by
    // the same invalidation the dialog's own list was, off one request.
    const afterMint = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      within(await screen.findByRole("region", { name: "Who is at the table" })).getByText("Hal"),
    ).toBeInTheDocument();
    expect(server.calls.length).toBe(afterMint);
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

  it("reads the roster, the invitations and the characters once each", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");

    expect(called("GET", "/members")).toBe(true);
    expect(called("GET", "/invites")).toBe(true);
    expect(called("GET", "/party")).toBe(true);

    // **Nothing is read per row**: the join is done here, from three lists, and
    // that is what this test is for. The three the screen needs are read
    // exactly once — `party.list` in particular, which both this screen and
    // `CampaignChrome` want and which must not be asked twice in one round
    // now that the party wears the shared frame. See `loadPartyRoster`.
    const reads = (fragment: string) =>
      server.calls.filter((call) => call.method === "GET" && call.pathname.endsWith(fragment));
    expect(reads("/members")).toHaveLength(1);
    expect(reads("/invites")).toHaveLength(1);
    expect(reads("/party")).toHaveLength(1);
    expect(reads(`/campaigns/${campaignId}`)).toHaveLength(1);
  });

  it("does not read anything Hob's panel would, because it is closed", async () => {
    await renderParty();
    await screen.findByText("Ilse Vantar");
    expect(called("GET", "/hob")).toBe(false);
  });
});
