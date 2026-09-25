import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  brannocSheetSeat,
  campaignId,
  deletedSeat,
  deletedSeatId,
  installPartyServer,
  pellSeat,
  renderSeat,
  seatId,
  sorrelSeat,
} from "./party.fixtures";

/**
 * The creator's seat page against a stub server: the vitals and their writes,
 * the seat's two verbs, the character's sheet read-only, and who may reach it.
 *
 * Installed once at module scope for the `Context.Reference` reason
 * `api/client.test.ts` records.
 */
const server = installPartyServer();

beforeEach(() => {
  server.reset();
  server.routes.set(`GET /campaigns/${campaignId}/party`, {
    status: 200,
    body: [brannocSheetSeat, sorrelSeat, pellSeat, deletedSeat],
  });
});

const base = `/campaigns/${campaignId}/party/${seatId}`;

/** The body of the one request to `method` at exactly `path`. */
const sent = (method: string, path: string): unknown => {
  const call = server.calls.find((entry) => entry.method === method && entry.pathname === path);
  return call === undefined ? undefined : JSON.parse(call.body);
};

/** How many times the party was read at or after `from`. */
const partyReads = (from: number): number =>
  server.calls.filter(
    (call, index) =>
      index >= from && call.method === "GET" && call.pathname === `/campaigns/${campaignId}/party`,
  ).length;

const vitals = () => screen.getByRole("region", { name: "Hit points" }).parentElement!;
const sheet = () => screen.getByRole("region", { name: "Brannoc's sheet" });

describe("the seat page", () => {
  it("draws the character through the seat: who, where they are, and their numbers", async () => {
    await renderSeat();

    expect(await screen.findByRole("heading", { level: 2, name: "Brannoc" })).toBeVisible();
    expect(screen.getByText("Half-orc Paladin 3 · Oath of the Open Road")).toBeVisible();
    expect(screen.getByText("Played by Ilse")).toBeVisible();
    // The track: where they are, of what, and the temporary hit points.
    expect(within(vitals()).getByText("44")).toBeVisible();
    expect(within(vitals()).getByText("/ 52 hp")).toBeVisible();
    expect(within(vitals()).getByText("+3 temp")).toBeVisible();
    // The tiles the card draws, each only when answered.
    expect(within(vitals()).getByText("AC")).toBeVisible();
    expect(within(vitals()).getByText("30")).toBeVisible();
    expect(within(vitals()).getByText("Spell DC")).toBeVisible();
    // The header says which tab this is within, the way back is to it, and
    // the campaign row keeps *Party* lit on a page within it.
    expect(screen.getByRole("heading", { level: 1, name: "Party" })).toBeVisible();
    const tab = within(screen.getByRole("navigation", { name: "This campaign" })).getByRole(
      "link",
      { name: "Party" },
    );
    expect(tab).toHaveAttribute("aria-current");
    const back = screen.getAllByRole("link", { name: "Party" }).filter((link) => link !== tab);
    expect(back).toHaveLength(1);
    expect(back[0]).toHaveAttribute("href", `/campaigns/${campaignId}/party`);
  });

  it("links the sheet the owner keeps elsewhere", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: [
        {
          ...brannocSheetSeat,
          character: { ...brannocSheetSeat.character, sheetUrl: "https://example.test/brannoc" },
        },
      ],
    });
    await renderSeat();
    expect(
      await screen.findByRole("link", { name: "The sheet they keep elsewhere" }),
    ).toHaveAttribute("href", "https://example.test/brannoc");
  });

  it("draws no such link for a character with no sheet elsewhere", async () => {
    await renderSeat();
    await screen.findByRole("heading", { level: 2, name: "Brannoc" });
    expect(screen.queryByRole("link", { name: "The sheet they keep elsewhere" })).toBeNull();
  });

  it("answers a player at the URL the way the server does", async () => {
    // `members.list` is behind the `DmActor` gate, and it is this page's read:
    // a player can read `party.list`, so the frame alone would draw them a
    // page whose every write the server refuses.
    server.routes.set(`GET /campaigns/${campaignId}/members`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderSeat();

    expect(await screen.findByText("Not here")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hit points" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Brannoc's sheet" })).not.toBeInTheDocument();
  });

  it("says a seat that is not this table's any more is gone, and points at the party", async () => {
    await renderSeat("2b1f2a1e-0000-4000-8000-0000000009aa");

    expect(await screen.findByText("No such seat")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Seat actions" })).not.toBeInTheDocument();
  });

  it("falls back to the Party tab on a malformed seat id", async () => {
    await renderSeat("not-a-uuid");

    expect(await screen.findByRole("region", { name: "Characters" })).toBeVisible();
    expect(window.location.pathname).toBe(`/campaigns/${campaignId}/party/not-a-uuid`);
  });

  it("keeps a deleted character's seat, with its settings and no sheet", async () => {
    await renderSeat(deletedSeatId);

    expect(await screen.findByRole("heading", { level: 2, name: "Odo" })).toBeVisible();
    expect(screen.getByText(/Character deleted/)).toBeVisible();
    expect(screen.getByText("Played by Kofi")).toBeVisible();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /sheet/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hit points" })).not.toBeInTheDocument();
  });
});

describe("the vitals", () => {
  it("damages by the amount typed, and heals by it, as one delta each", async () => {
    await renderSeat();
    const amount = await screen.findByRole("textbox", { name: "Hit points to move" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "12");

    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Damage Brannoc" }));
    await waitFor(() => expect(sent("POST", `${base}/damage`)).toBeDefined());
    // Positive damages; the request id is what lets a fight's dedupe see a repeat.
    expect(sent("POST", `${base}/damage`)).toEqual({ amount: 12, requestId: expect.any(String) });
    await waitFor(() => expect(partyReads(mark)).toBe(1));

    server.calls.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Heal Brannoc" }));
    await waitFor(() =>
      expect(sent("POST", `${base}/damage`)).toEqual({
        amount: -12,
        requestId: expect.any(String),
      }),
    );
  });

  it("refuses to send an amount that is not a whole number", async () => {
    await renderSeat();
    const amount = await screen.findByRole("textbox", { name: "Hit points to move" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "two");

    expect(screen.getByRole("button", { name: "Damage Brannoc" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Heal Brannoc" })).toBeDisabled();
  });

  it("sets the temporary hit points as a number, not a fixed step", async () => {
    await renderSeat();
    const temp = await screen.findByRole("textbox", { name: "Temporary hit points" });
    const set = screen.getByRole("button", { name: "Set" });
    // Nothing to send until the number moves.
    expect(set).toBeDisabled();

    await userEvent.clear(temp);
    await userEvent.type(temp, "8");
    await userEvent.click(set);

    await waitFor(() => expect(sent("PATCH", base)).toEqual({ tempHp: 8 }));
  });

  it("adds a condition and removes one, sending the whole list each time", async () => {
    await renderSeat();
    await userEvent.type(await screen.findByRole("textbox", { name: "Conditions" }), "Prone");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(sent("PATCH", base)).toEqual({ conditions: ["Poisoned", "Prone"] }));

    server.calls.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Remove Poisoned" }));
    await waitFor(() => expect(sent("PATCH", base)).toEqual({ conditions: [] }));
  });

  it("awards inspiration through the seat, and says whose it is", async () => {
    await renderSeat();
    const toggle = await screen.findByRole("button", { name: "Inspiration for Brannoc" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    const mark = server.calls.length;
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(sent("PATCH", base)).toEqual({ inspiration: true }));
    await waitFor(() => expect(partyReads(mark)).toBe(1));
  });

  it("does not send a condition the seat already carries", async () => {
    await renderSeat();
    await userEvent.type(await screen.findByRole("textbox", { name: "Conditions" }), "Poisoned");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });
});

describe("the seat's verbs", () => {
  it("shares the seat with the table through the one visibility control", async () => {
    await renderSeat();
    await screen.findByRole("heading", { level: 2, name: "Brannoc" });

    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("switch"));

    // The seat's own column and nothing else.
    await waitFor(() => expect(sent("PATCH", base)).toEqual({ visibility: "shared" }));
    await waitFor(() => expect(partyReads(mark)).toBe(1));
  });

  it("asks before retiring, then retires and lands on the Party tab", async () => {
    await renderSeat();
    await screen.findByRole("heading", { level: 2, name: "Brannoc" });

    await userEvent.click(screen.getByRole("button", { name: "Seat actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retire seat" }));

    const dialog = await screen.findByRole("dialog", { name: "Retire Brannoc’s seat?" });
    expect(within(dialog).getByText(/Their player keeps the character/)).toBeVisible();
    // Opening the confirmation sends nothing.
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);

    await userEvent.click(within(dialog).getByRole("button", { name: "Retire seat" }));

    await waitFor(() =>
      expect(server.calls.some((call) => call.method === "DELETE" && call.pathname === base)).toBe(
        true,
      ),
    );
    await waitFor(() => expect(window.location.pathname).toBe(`/campaigns/${campaignId}/party`));
  });

  it("keeps the seat when the confirmation is put away", async () => {
    await renderSeat();
    await screen.findByRole("heading", { level: 2, name: "Brannoc" });
    await userEvent.click(screen.getByRole("button", { name: "Seat actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Retire seat" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep the seat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(window.location.pathname).toBe(base);
  });
});

describe("the character's sheet, read through the seat", () => {
  it("draws what the document holds", async () => {
    await renderSeat();
    await screen.findByRole("region", { name: "Brannoc's sheet" });

    expect(within(sheet()).getByText("Athletics")).toBeVisible();
    expect(within(sheet()).getAllByText("Halberd").length).toBeGreaterThan(0);
    expect(within(sheet()).getByText("Bless")).toBeVisible();
    expect(within(sheet()).getAllByText("Lay on Hands").length).toBeGreaterThan(0);
    expect(within(sheet()).getByText(/The temple on the salt road/)).toBeVisible();
    // The numbers the owner rolls from, drawn as numbers.
    expect(within(sheet()).getAllByText("+7").length).toBeGreaterThan(0);
    expect(within(sheet()).getByText("1d10+4")).toBeVisible();
    expect(within(sheet()).getByText("3 of 4 left")).toBeVisible();
    expect(within(sheet()).getByText("15/25 hp · long rest")).toBeVisible();
  });

  it("offers nothing to press on it: nobody writes another account's sheet", async () => {
    await renderSeat();
    await screen.findByRole("region", { name: "Brannoc's sheet" });

    // Every pressable thing in the sheet: none. No section edit, no dice, no
    // spend, no *Your rolls* and no roll mode.
    expect(within(sheet()).queryAllByRole("button")).toEqual([]);
    expect(within(sheet()).queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryByText("Your rolls")).not.toBeInTheDocument();
    // And the owner's prompts, addressed to whoever can fill a section, are not
    // drawn at somebody who cannot.
    expect(screen.queryByText(/Take the standard array/)).not.toBeInTheDocument();
  });

  it("draws only the sections the document fills", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, {
      status: 200,
      body: [
        {
          ...brannocSheetSeat,
          character: {
            ...brannocSheetSeat.character,
            sheet: { notes: "", abilities: [], traits: [{ name: "Darkvision", text: "60 ft." }] },
          },
        },
      ],
    });
    await renderSeat();
    await screen.findByRole("region", { name: "Brannoc's sheet" });

    expect(within(sheet()).getByText("Features & traits")).toBeVisible();
    for (const empty of ["Abilities & skills", "Gear & coin", "Story", "Spellcasting"]) {
      expect(within(sheet()).queryByText(empty)).not.toBeInTheDocument();
    }
  });
});
