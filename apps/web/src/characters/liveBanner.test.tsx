import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  brannocId,
  campaignId,
  hagCombatantId,
  installCharacterServer,
  otherCampaignId,
  playing,
  quiet,
  renderSheet,
  sorrelId,
  strangerId,
  yourCombatantId,
} from "./characters.fixtures";

/**
 * The live banner on the character sheet, and the way to the table.
 *
 * `live.test.ts` is the sentence; this is the screen — that the read is made at
 * all, that the card and the action appear together and disappear together, and
 * that the action is a **real link** to a screen that exists.
 *
 * The absence assertions are the point of half of it. A banner is a control that
 * appears without being asked for, so *"nothing is running"* has to draw nothing
 * rather than a card explaining that nothing is running — and the action has to
 * be gone with it, because a *Go to the table* that led to a quiet table is the
 * stubbed field this product refuses everywhere else.
 */
const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => document.body.replaceChildren());

const banner = () => screen.queryByText(/is playing right now/);
const toTheTable = () => screen.queryByRole("button", { name: /Go to the table/i });

describe("when the table is playing", () => {
  it("names the night and the round, and offers a real way to the table", async () => {
    server.routes.set(...playing(campaignId));
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(screen.getByText("The Salt Road is playing right now")).toBeTruthy();
    expect(screen.getByText("Session 12 · round 3 · it's your turn")).toBeTruthy();
    // A route rendered as a button keeps the `button` role and is a real `<a>` —
    // `nativeButton={false}`. **Exactly one** of them: the card says what is
    // happening and the bar is how you get there, which is how the delivery
    // draws this screen and what keeps two identical controls off it.
    const links = screen.getAllByRole("button", { name: /Go to the table/i });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(`/#/play/campaigns/${campaignId}`);
  });

  it("reads the campaign the character is in, and no other", async () => {
    server.routes.set(...playing(campaignId));
    await renderSheet();
    await screen.findByText(/is playing right now/);

    const asked = server.calls
      .filter((call) => call.pathname.endsWith("/table"))
      .map((call) => call.pathname);
    // One request, for the one campaign this character sits in. The other table
    // this account is at is not asked about — the sheet is about one character.
    expect(asked).toEqual([`/campaigns/${campaignId}/table`]);
  });

  it("says who is up when it is somebody else's turn", async () => {
    server.routes.set(
      ...playing(campaignId, {
        upNext: { combatantId: hagCombatantId, displayName: "Marsh Hag" },
      }),
    );
    await renderSheet();
    await screen.findByText(/is playing right now/);

    expect(screen.getByText("Session 12 · round 3 · Marsh Hag is up")).toBeTruthy();
  });

  it("says so when the fight on the table is not this character's", async () => {
    server.routes.set(
      ...playing(campaignId, {
        upNext: { combatantId: hagCombatantId, displayName: "Marsh Hag" },
        seats: [],
      }),
    );
    await renderSheet();
    await screen.findByText(/is playing right now/);

    expect(
      screen.getByText(
        "Session 12 · round 3 · Marsh Hag is up · Brannoc Duskharrow is not in this fight",
      ),
    ).toBeTruthy();
    // Still a way there: the table is the table, whether or not you are in the
    // initiative order tonight.
    expect(toTheTable()).toBeTruthy();
  });

  it("draws a night with nothing on the table", async () => {
    server.routes.set(...playing(campaignId, null));
    await renderSheet();
    await screen.findByText(/is playing right now/);

    expect(screen.getByText("Session 12 · nothing on the table")).toBeTruthy();
  });

  it("carries no hit points, no armour class and no band into the banner", async () => {
    // The card is two lines and a button, and the contract is why: there is no
    // field on `PlayerLiveTable` for any of these, so the assertion is that the
    // *shape* stayed narrow rather than that this render happened to be tidy.
    server.routes.set(
      ...playing(campaignId, {
        upNext: { combatantId: hagCombatantId, displayName: "Marsh Hag" },
      }),
    );
    await renderSheet();
    const card = (await screen.findByText(/is playing right now/)).closest("div")?.parentElement;

    expect(card?.textContent).toBe(
      "The Salt Road is playing right nowSession 12 · round 3 · Marsh Hag is up",
    );
  });
});

describe("when nothing is running", () => {
  it("draws no card and no way to the table", async () => {
    // The default fixture: both tables quiet. A card saying nobody is playing
    // would be on this screen almost every time it is opened.
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(banner()).toBeNull();
    expect(toTheTable()).toBeNull();
  });

  it("still asks, so opening the sheet during a game shows it", async () => {
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(server.calls.some((call) => call.pathname === `/campaigns/${campaignId}/table`)).toBe(
      true,
    );
  });

  it("asks about the other table for the other character", async () => {
    server.routes.set(...playing(otherCampaignId, null));
    await renderSheet(sorrelId);
    await screen.findByRole("heading", { name: "Sorrel Ash" });

    // The campaign is the character's, not the account's first one — the sheet
    // names no campaign in its route, so this is the only thing that says the
    // join was made from the right row.
    expect(screen.getByText("The Hag's Bargain is playing right now")).toBeTruthy();
    expect(toTheTable()?.getAttribute("href")).toBe(`/#/play/campaigns/${otherCampaignId}`);
  });

  it("asks nothing at all for a character that is not this account's", async () => {
    await renderSheet(strangerId);
    await screen.findByText(/Not here/i);

    expect(server.calls.some((call) => call.pathname.endsWith("/table"))).toBe(false);
    expect(banner()).toBeNull();
  });
});

describe("when the live read is refused", () => {
  it("shows the failure rather than hiding the banner", async () => {
    // A `NotFound` here can only mean the membership went away between the two
    // rounds, which is a real disagreement about whether this table is still
    // yours — so it is said rather than swallowed into a quiet banner. See
    // `loadCharacterSheet`.
    server.routes.set(`GET /campaigns/${campaignId}/table`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderSheet();

    expect(await screen.findByText(/Not here/i)).toBeTruthy();
    expect(banner()).toBeNull();
    expect(toTheTable()).toBeNull();
  });
});

/** Kept honest: `quiet` really is what the default fixture installs. */
it("installs a quiet table for every campaign by default", () => {
  expect(server.routes.get(quiet(campaignId)[0])).toEqual(quiet(campaignId)[1]);
  expect(server.routes.get(quiet(otherCampaignId)[0])).toEqual(quiet(otherCampaignId)[1]);
  expect(brannocId).toBeTruthy();
  expect(yourCombatantId).toBeTruthy();
});
