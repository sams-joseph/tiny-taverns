import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import { drawnPortrait } from "../campaign/campaign.fixtures";
import {
  brannocSeat,
  campaignId,
  dmMember,
  emptyParty,
  goneSeatId,
  ilse,
  installPartyServer,
  liveInvite,
  renderParty,
  sorrelSeatId,
} from "./party.fixtures";

/**
 * The Party tab against a stub server: the cards and their − and +, the
 * header's line, *Passives and saves*, *Not playing yet*, and the states a
 * real table puts it in.
 *
 * Installed once at module scope for the `Context.Reference` reason
 * `api/client.test.ts` records — a per-test `vi.stubGlobal("fetch")` would keep
 * serving the first test's answers with nothing to notice.
 */
const server = installPartyServer();

beforeEach(() => {
  server.reset();
});

const base = `/campaigns/${campaignId}`;

const called = (method: string, fragment: string): boolean =>
  server.calls.some((call) => call.method === method && call.pathname.includes(fragment));

/** Every GET of exactly `path` from the `from`th call on. */
const readsOf = (path: string, from = 0): number =>
  server.calls.filter(
    (call, index) => index >= from && call.method === "GET" && call.pathname === path,
  ).length;

/** The card whose name link is `name`. */
const card = async (name: string): Promise<HTMLElement> => {
  const link = await screen.findByRole("link", { name });
  return link.closest<HTMLElement>('[data-slot="seat-card"]')!;
};

describe("the cards", () => {
  it("draws one card per seat from party.list, in the seats' order", async () => {
    await renderParty();
    const grid = await screen.findByRole("region", { name: "Characters" });
    expect(
      within(grid)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Brannoc", "Sorrel Ash", "Pell", "Odo"]);
  });

  it("draws who they are, where they are, and the tiles the sheet answers", async () => {
    await renderParty();
    const brannoc = await card("Brannoc");

    expect(within(brannoc).getByText("Half-orc Paladin 3 · Oath of the Open Road")).toBeVisible();
    expect(within(brannoc).getByText("Played by Ilse")).toBeVisible();
    expect(within(brannoc).getByText("44 / 52")).toBeVisible();
    // The four tiles, each with an answer on this sheet, in the drawn order.
    expect(
      within(brannoc)
        .getAllByRole("term")
        .map((tile) => tile.textContent),
    ).toEqual(["AC", "Speed", "Spell DC", "Passive"]);
    expect(
      within(brannoc)
        .getAllByRole("definition")
        .map((tile) => tile.textContent),
    ).toEqual(["18", "30", "14", "11"]);
    // The DM's condition and the temporary hit points, as badges.
    const badges = within(within(brannoc).getByRole("list", { name: "Conditions" }));
    expect(badges.getByText("Poisoned")).toBeVisible();
    expect(badges.getByText("+3 temp")).toBeVisible();
  });

  it("leaves out a tile the sheet cannot answer rather than drawing a dash", async () => {
    await renderParty();
    const sorrel = await card("Sorrel Ash");
    // No spellcasting on a ranger's sheet: no Spell DC tile at all.
    expect(within(sorrel).queryByText("Spell DC")).not.toBeInTheDocument();
    expect(within(sorrel).queryByText("–")).not.toBeInTheDocument();
    expect(within(sorrel).queryByText("—")).not.toBeInTheDocument();
    // A cleric's is written, and drawn as written.
    const pell = await card("Pell");
    expect(
      within(pell)
        .getAllByRole("definition")
        .map((tile) => tile.textContent),
    ).toEqual(["16", "25", "13", "13"]);
    expect(within(pell).getByText("Spell DC")).toBeVisible();
  });

  it("says only the max for a character nobody has damaged", async () => {
    await renderParty();
    const sorrel = await card("Sorrel Ash");
    expect(within(sorrel).getByText("52")).toBeVisible();
    expect(within(sorrel).queryByText(/\//)).not.toBeInTheDocument();
  });

  it("keeps a deleted character's seat as a card with its snapshot and no numbers", async () => {
    await renderParty();
    const odo = await card("Odo");
    expect(within(odo).getByText("Character deleted")).toBeVisible();
    // The DM's own seat, named from the members the creator reads.
    expect(within(odo).getByText("Played by Wren Alderby")).toBeVisible();
    expect(within(odo).queryByRole("button")).not.toBeInTheDocument();
    expect(within(odo).queryByRole("definition")).not.toBeInTheDocument();
  });

  it("opens the seat's page from the card, where the seat is managed", async () => {
    await renderParty();
    const link = await screen.findByRole("link", { name: "Brannoc" });
    expect(link).toHaveAttribute("href", `${base}/party/${brannocSeat.seat.id}`);
    expect(await screen.findByRole("link", { name: "Odo" })).toHaveAttribute(
      "href",
      `${base}/party/${goneSeatId}`,
    );

    await userEvent.click(link);
    expect(await screen.findByRole("region", { name: "Hit points" })).toBeVisible();
  });

  it("lays a character's portrait over its initials, on that card only", async () => {
    await renderParty();
    await card("Pell");
    const portraits = Array.from(document.querySelectorAll("img")).filter((img) =>
      img.getAttribute("src")?.includes("/portraits/"),
    );
    expect(portraits.map((img) => img.getAttribute("src"))).toEqual([
      apiUrl(drawnPortrait.cardUrl),
    ]);
    // The initials stay under the picture, for its loading and failed states.
    expect(portraits[0]?.parentElement?.textContent).toBe("P");
  });

  it("offers nothing on a card that manages the seat: that is the seat's page", async () => {
    await renderParty();
    const brannoc = await card("Brannoc");
    expect(
      within(brannoc)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Inspiration for Brannoc", "Damage Brannoc", "Heal Brannoc"]);
  });
});

describe("the card's inspiration", () => {
  const brannocSeatPath = `${base}/party/${brannocSeat.seat.id}`;

  it("awards it through the seat at once, going nowhere", async () => {
    await renderParty();
    const brannoc = await card("Brannoc");
    const toggle = within(brannoc).getByRole("button", { name: "Inspiration for Brannoc" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(within(brannoc).queryByText("Inspired")).not.toBeInTheDocument();

    const mark = server.calls.length;
    await userEvent.click(toggle);
    // The press shows before the server answers, and stays through the re-read.
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(called("PATCH", brannocSeatPath)).toBe(true));
    const patch = server.calls.find((call) => call.method === "PATCH")!;
    expect(patch.pathname).toBe(brannocSeatPath);
    expect(JSON.parse(patch.body)).toEqual({ inspiration: true });
    await waitFor(() => expect(readsOf(`${base}/party`, mark)).toBe(1));
    // Still the Party tab: the press did not open the seat.
    expect(screen.getByRole("region", { name: "Characters" })).toBeVisible();
  });

  it("says an award the DM made, and takes it back through the same toggle", async () => {
    const inspired = {
      ...brannocSeat,
      character: { ...brannocSeat.character!, inspiration: true },
    };
    server.routes.set(`GET ${base}/party`, { status: 200, body: [inspired] });
    await renderParty();
    const brannoc = await card("Brannoc");
    // Beside the conditions, in the owner's sheet's outline rather than peach.
    expect(within(brannoc).getByText("Inspired")).toBeVisible();
    const toggle = within(brannoc).getByRole("button", { name: "Inspiration for Brannoc" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    await waitFor(() => expect(called("PATCH", brannocSeatPath)).toBe(true));
    const patch = server.calls.find((call) => call.method === "PATCH")!;
    expect(JSON.parse(patch.body)).toEqual({ inspiration: false });
  });

  it("says a refused award, and the toggle returns to the server's", async () => {
    server.routes.set(`PATCH ${base}/party/${sorrelSeatId}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign_character", id: sorrelSeatId },
    });
    await renderParty();
    const sorrel = await card("Sorrel Ash");
    const toggle = within(sorrel).getByRole("button", { name: "Inspiration for Sorrel Ash" });
    await userEvent.click(toggle);

    expect(await within(sorrel).findByRole("alert")).toBeVisible();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the card's − and +", () => {
  it("moves the number at once and sends the presses as one delta, going nowhere", async () => {
    await renderParty();
    const brannoc = await card("Brannoc");
    const damage = within(brannoc).getByRole("button", { name: "Damage Brannoc" });

    const mark = server.calls.length;
    await userEvent.click(damage);
    await userEvent.click(damage);
    await userEvent.click(damage);
    expect(within(brannoc).getByText("41 / 52")).toBeVisible();

    await waitFor(() => expect(called("POST", "/damage")).toBe(true), { timeout: 3000 });
    const posts = server.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.pathname).toBe(`${base}/party/${brannocSeat.seat.id}/damage`);
    const body = JSON.parse(posts[0]!.body) as { amount: number; requestId: string };
    expect(body.amount).toBe(3);
    expect(body.requestId).toEqual(expect.any(String));
    // The write names the party, and the frame re-reads it once.
    await waitFor(() => expect(readsOf(`${base}/party`, mark)).toBe(1));
    // Still the Party tab: the press did not open the seat.
    expect(screen.queryByRole("region", { name: "Hit points" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Characters" })).toBeVisible();
  });

  it("heals as a negative delta, and a heal at full moves nothing", async () => {
    await renderParty();
    const brannoc = await card("Brannoc");
    await userEvent.click(within(brannoc).getByRole("button", { name: "Heal Brannoc" }));
    await userEvent.click(within(brannoc).getByRole("button", { name: "Heal Brannoc" }));
    expect(within(brannoc).getByText("46 / 52")).toBeVisible();
    await waitFor(() => expect(called("POST", "/damage")).toBe(true), { timeout: 3000 });
    const post = server.calls.find((call) => call.method === "POST")!;
    expect(JSON.parse(post.body)).toMatchObject({ amount: -2 });

    // Sorrel is at full (nobody has said otherwise): + is not offered.
    const sorrel = await card("Sorrel Ash");
    expect(within(sorrel).getByRole("button", { name: "Heal Sorrel Ash" })).toBeDisabled();
    expect(within(sorrel).getByRole("button", { name: "Damage Sorrel Ash" })).toBeEnabled();
  });

  it("says a refused write, and the number returns to the server's", async () => {
    server.routes.set(`POST ${base}/party/${sorrelSeatId}/damage`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign_character", id: sorrelSeatId },
    });
    await renderParty();
    const sorrel = await card("Sorrel Ash");
    await userEvent.click(within(sorrel).getByRole("button", { name: "Damage Sorrel Ash" }));
    expect(within(sorrel).getByText("51 / 52")).toBeVisible();

    expect(await within(sorrel).findByRole("alert", {}, { timeout: 3000 })).toBeVisible();
    expect(within(sorrel).getByText("52")).toBeVisible();
  });
});

describe("the header", () => {
  it("says how many, what level, the party's hit points and who is hurting", async () => {
    await renderParty();
    // 44 + 52 (nobody has said, so the max) + 9 of 52 each; Pell's 9 is the
    // bar's low band. The deleted seat is not a character.
    expect(
      await screen.findByText("3 characters · Lvl 1–3 · 105 / 156 hp · Pell is low"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite player" })).toBeVisible();
  });
});

describe("passives and saves", () => {
  const table = () => screen.getByRole("table", { name: "Passives and saves" });
  const row = (name: string) =>
    within(table())
      .getAllByRole("row")
      .find((candidate) => within(candidate).queryByRole("rowheader", { name }) !== null)!;
  const cellText = (name: string) =>
    within(row(name))
      .getAllByRole("cell")
      .map((cell) => cell.lastElementChild?.textContent ?? "");

  it("draws the three passives and six saves each sheet answers, blank where it does not", async () => {
    await renderParty();
    await screen.findByRole("table", { name: "Passives and saves" });

    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Character",
      "Perception",
      "Insight",
      "Investigation",
      "STR",
      "DEX",
      "CON",
      "INT",
      "WIS",
      "CHA",
    ]);
    expect(cellText("Brannoc")).toEqual(["11", "11", "9", "+7", "+1", "", "", "+4", "+6"]);
    expect(cellText("Sorrel Ash")).toEqual(["14", "12", "10", "+3", "+5", "+1", "0", "+2", "-1"]);
    // No saves written on Pell's sheet: six blank cells, never a dash.
    expect(cellText("Pell")).toEqual(["13", "15", "10", "", "", "", "", "", ""]);
    // The deleted character has no sheet and no row.
    expect(within(table()).queryByRole("rowheader", { name: "Odo" })).not.toBeInTheDocument();
  });

  it("highlights the party's best in each column, every one of a tie", async () => {
    await renderParty();
    await screen.findByRole("table", { name: "Passives and saves" });
    const best = (name: string) =>
      within(row(name))
        .getAllByRole("cell")
        .map((cell) => cell.lastElementChild?.classList.contains("text-accent-ink") ?? false);
    // Investigation is tied at 10 between Sorrel and Pell: both are best.
    expect(best("Sorrel Ash")).toEqual([true, false, true, false, true, true, true, false, false]);
    expect(best("Pell")).toEqual([false, true, true, false, false, false, false, false, false]);
    expect(best("Brannoc")).toEqual([false, false, false, true, false, false, false, true, true]);
  });
});

describe("not playing yet", () => {
  it("lists the member with no character and the invitation nobody has taken", async () => {
    await renderParty();
    const list = await screen.findByRole("region", { name: "Not playing yet" });

    expect(within(list).getByText("Kofi Adeyemi")).toBeVisible();
    expect(within(list).getByText("Joined the table, and has no character yet.")).toBeVisible();
    expect(within(list).getByText("No character")).toBeVisible();
    // The invitation is a person, because one invitation grants one membership;
    // it has been waiting long enough to say how long.
    expect(within(list).getByText("Hal")).toBeVisible();
    expect(within(list).getByText(/^Invited \d+ days ago, and it runs out on/)).toBeVisible();
    // The spent invitation is Ilse, who is playing: not here, and not twice.
    expect(within(list).queryByText(/Ilse/)).not.toBeInTheDocument();
    // Neither the DM nor anybody playing is on it.
    expect(within(list).queryByText("Wren Alderby")).not.toBeInTheDocument();
  });

  it("is not drawn when everyone has a character and nothing is outstanding", async () => {
    server.routes.set(`GET ${base}/members`, { status: 200, body: [dmMember, ilse] });
    server.routes.set(`GET ${base}/invites`, { status: 200, body: [] });
    await renderParty();
    await card("Brannoc");
    expect(screen.queryByRole("region", { name: "Not playing yet" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Not playing yet/)).not.toBeInTheDocument();
  });
});

/**
 * **What the two invitation writes refresh, and what they do not.**
 *
 * Withdrawing is the write on this screen that moves a row the request never
 * mentions: revoking a *spent* invitation revokes the membership it granted, in
 * the same transaction (`repo/Invites.ts`), so the list loses a person while
 * the response carries only an invitation. That is why `InviteDialog` names
 * `reads.members` beside `reads.campaignInvites`, and it is what this pins.
 *
 * Minting is the mirror and pins the other half: it names the invitations
 * alone, so the members are *not* re-read.
 */
describe("what an invitation write refreshes", () => {
  const reads = (from: number, fragment: string): number =>
    server.calls.filter(
      (call, index) => index >= from && call.method === "GET" && call.pathname.endsWith(fragment),
    ).length;

  it("withdrawing one re-reads the members as well as the invitations", async () => {
    await renderParty();
    await card("Brannoc");
    await userEvent.click(screen.getByRole("button", { name: /Invite player/ }));
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
    await card("Brannoc");
    await userEvent.click(screen.getByRole("button", { name: /Invite player/ }));
    await screen.findByRole("button", { name: /Make a link/ });

    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Make a link/ }));

    await waitFor(() => expect(reads(mark, "/invites")).toBe(1));
    expect(reads(mark, "/members")).toBe(0);
  });

  /**
   * The list behind the dialog reads the same atom the dialog does, so a mint
   * reaches it without a second request and without a callback.
   */
  it("shows a minted invitation on the list underneath, from the one read", async () => {
    server.routes.set(`GET ${base}/members`, { status: 200, body: [dmMember, ilse] });
    server.routes.set(`GET ${base}/invites`, { status: 200, body: [] });
    await renderParty();
    await card("Brannoc");
    await userEvent.click(screen.getByRole("button", { name: /Invite player/ }));
    await screen.findByRole("button", { name: /Make a link/ });

    server.routes.set(`GET ${base}/invites`, { status: 200, body: [liveInvite] });
    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Make a link/ }));

    await waitFor(() => expect(reads(mark, "/invites")).toBe(1));

    // Closing the dialog reads nothing — the list underneath was refreshed by
    // the same invalidation the dialog's own list was, off one request.
    const afterMint = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      within(await screen.findByRole("region", { name: "Not playing yet" })).getByText("Hal"),
    ).toBeInTheDocument();
    expect(server.calls.length).toBe(afterMint);
  });

  it("opens the one invitation surface rather than drawing a second", async () => {
    await renderParty();
    await userEvent.click(await screen.findByRole("button", { name: /Invite player/ }));

    // `InviteDialog`, reused whole: its own copy, its own list, its own
    // withdrawn-before-taken precedence.
    expect(await screen.findByText(/gets a seat in this campaign/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Make a link/ })).toBeInTheDocument();
  });
});

describe("the states a real screen has", () => {
  it("says what a campaign with no characters should do next", async () => {
    server.routes = emptyParty();
    await renderParty();

    expect(await screen.findByText("Nobody has a character here yet")).toBeInTheDocument();
    // A private campaign says so here, because an invitation sent before it is
    // shared lands somebody on a blank page.
    expect(screen.getByText(/share it from the campaign screen/)).toBeInTheDocument();
    // No cards, no table, and nobody waiting: no list either.
    expect(screen.queryByRole("region", { name: "Characters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Not playing yet" })).not.toBeInTheDocument();
  });

  it("still lists who is waiting on a table with no characters yet", async () => {
    server.routes = emptyParty();
    server.routes.set(`GET ${base}/invites`, { status: 200, body: [liveInvite] });
    await renderParty();

    expect(await screen.findByText("Nobody has a character here yet")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Not playing yet" })).getByText("Hal"),
    ).toBeVisible();
  });

  it("says the server did not answer, and offers to try again", async () => {
    server.transportDown = true;
    await renderParty();

    expect(await screen.findByText("The server did not answer")).toBeInTheDocument();
    server.transportDown = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Brannoc" })).toBeInTheDocument();
  });

  it("answers a player at this URL the way the server does", async () => {
    server.routes.set(`GET ${base}/members`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderParty();

    // `party.list` answers a player too, so the page is creator-only through
    // its roster read: the `DmActor` gate refuses with the ordinary `NotFound`
    // and the screen says "Not here" rather than drawing cards it cannot write.
    expect(await screen.findByText("Not here")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Characters" })).not.toBeInTheDocument();
  });

  it("reads the roster, the invitations and the characters once each", async () => {
    await renderParty();
    await card("Brannoc");

    // **Nothing is read per card**: `party.list` in particular, which both this
    // screen and `CampaignChrome` want, is asked once.
    expect(readsOf(`${base}/members`)).toBe(1);
    expect(readsOf(`${base}/invites`)).toBe(1);
    expect(readsOf(`${base}/party`)).toBe(1);
    expect(readsOf(base)).toBe(1);
    expect(called("GET", "/party-prep")).toBe(false);
    expect(called("GET", "/hob")).toBe(false);
  });
});
