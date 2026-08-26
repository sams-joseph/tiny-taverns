import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  campaignId,
  installCharacterServer,
  onlyDmTables,
  renderCreate,
  savedAs,
} from "./characters.fixtures";

/**
 * The create form — **the first screen in the product on which a non-DM creates
 * anything.**
 *
 * What is asserted here is the three things about it that would be wrong
 * silently:
 *
 *   1. the payload it sends, and every column it deliberately cannot name;
 *   2. where it goes afterwards, which is the *shipped sheet* rather than a
 *      second editor;
 *   3. what it does at a table this account is not a player at, which the read
 *      it already makes is what answers.
 *
 * The pure half — which tables, and how a draft becomes a payload — is
 * `create.test.ts`, and the server half is `player-create.test.ts`.
 */

const server = installCharacterServer();

const createPath = `/me/campaigns/${campaignId}/characters`;

beforeEach(() => {
  server.reset();
  server.routes.set(`POST ${createPath}`, savedAs(brannoc));
});
afterEach(() => {
  // RTL first, then the body: the form portals nothing itself, but the rule is
  // the file-level one and a test that ends mid-navigation should not depend on
  // that staying true.
  cleanup();
  document.body.replaceChildren();
});

/**
 * The form, once it is there.
 *
 * `findByLabelText` rather than `getByLabelText`: the screen reads
 * `GET /me/campaigns` before it knows whether this is a table you play at, so
 * there is a loading pass and the first field has to be waited for.
 */
const type = async (label: RegExp | string, value: string) => {
  await userEvent.type(await screen.findByLabelText(label), value);
};

/** A campaign this account is at no table of. */
const strangerCampaignId = "2b1f2a1e-0000-4000-8000-0000000000ff";

describe("writing down a character of your own", () => {
  it("names the campaign in the path and nothing about the account in the body", async () => {
    await renderCreate();
    await screen.findByRole("button", { name: /Create character/i });

    await type(/^Name$/, "Sorrel Ash");
    await type(/^Player$/, "Ilse");
    await type(/^Level$/, "1");
    await type(/^Species$/, "Wood elf");
    await type(/^Class$/, "Druid");
    await type(/^AC$/, "14");
    await type(/Hit points/, "9");
    await type(/Who they are/, "Raised by the road.");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    const post = server.calls.find((call) => call.method === "POST");
    // The campaign is a path segment — the one thing a player's write ever
    // names, and only because an insert has no row to derive it from. It is a
    // claim, and `ensureCampaignReadable` is what refuses a false one.
    expect(post?.pathname).toBe(createPath);

    const body = bodyOf(server, "POST", createPath) as Record<string, unknown>;
    expect(body).toEqual({
      name: "Sorrel Ash",
      playerName: "Ilse",
      level: 1,
      species: "Wood elf",
      className: "Druid",
      ac: 14,
      hpMax: 9,
      sheet: { notes: "Raised by the road.", abilities: [], traits: [] },
    });
    // The whole disclosure property in one assertion: the row comes out at its
    // column defaults because nothing here can say otherwise. There is no
    // control for any of these and one would not compile — `CharacterOwnCreate`
    // has no field for them — and the encoder drops an excess key anyway.
    for (const key of ["accountId", "hpCurrent", "tempHp", "conditions", "visibility"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("lands on the shipped sheet, and does not leave the form in the history", async () => {
    await renderCreate();
    await type(/^Name$/, "Sorrel Ash");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    // **Not a second editor.** Campaign-first is what buys this: the row exists
    // by the time the player is correcting it, so the sheet's three shipped
    // dialogs work on it unchanged. `findAllByText` because the sheet draws the
    // name in its bar and in its identity column both.
    await screen.findAllByText("Brannoc Duskharrow");
    // The sheet's own tabs, which is the thing a second editor would not have.
    expect((await screen.findAllByRole("tab")).map((tab) => tab.textContent)).toContain("Story");
    // And the form is gone rather than layered under it.
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
    // `replace: true`, so *Back* from the sheet goes to wherever the player
    // started rather than to a form for a character they have already made.
    expect(window.location.hash).toBe(`#/play/characters/${brannocId}`);
  });

  it("says what is wrong before it sends anything", async () => {
    await renderCreate();
    await screen.findByRole("button", { name: /Create character/i });
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    expect(await screen.findByText("Give them a name.")).toBeTruthy();
    // Nothing left the browser. The contract would have refused it locally
    // anyway, but with a sentence written for whoever wrote the schema.
    expect(server.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("tells the player who will be able to read it", async () => {
    await renderCreate();
    // A new row is `dm` by column default and the form has no control to change
    // that, so the answer is said before the press rather than discovered after
    // it.
    expect(await screen.findByText(/Only you and your DM can see them/)).toBeTruthy();
  });

  it("draws no form at a table this account is not a player at", async () => {
    // The read the screen already makes is what answers it, so the form is never
    // drawn over a table the save would refuse. `GET /me/campaigns` composes the
    // same membership clause `ensureCampaignReadable` does.
    await renderCreate(strangerCampaignId);
    expect(await screen.findByText("Not your table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("draws no form at a table this account runs, and says which refusal it is", async () => {
    // A DM would pass `ensureCampaignReadable` through `isDm`, and the server
    // calls that harmless — but the pill is a *mode*, and a table you run has no
    // player screen to be on. `tablesForNewCharacter` is where that is decided
    // for the picker; this is the screen agreeing with it, so a typed URL cannot
    // reach a form the picker would never have offered.
    server.routes = onlyDmTables();
    server.routes.set(`POST ${createPath}`, savedAs(brannoc));
    await renderCreate();

    // A different sentence from the one above, because it is a different
    // situation: this table you can reach, and it is still the wrong door.
    expect(await screen.findByText("You run this table")).toBeTruthy();
    expect(screen.queryByText("Not your table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
  });

  it("says the server did not answer rather than drawing an empty form", async () => {
    server.transportDown = true;
    await renderCreate();

    await screen.findByText("The server did not answer");
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
  });

  it("keeps what was typed when the save is refused", async () => {
    server.routes.set(`POST ${createPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderCreate();
    await type(/^Name$/, "Sorrel Ash");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    // The failure renders beside the button rather than at the end of a
    // scrolling body, and the form is still there — a refused save that threw
    // away five minutes of typing would be the worse failure.
    await screen.findByText("That campaign is gone, or it belongs to someone else.");
    expect((screen.getByLabelText(/^Name$/) as HTMLInputElement).value).toBe("Sorrel Ash");
    expect(window.location.hash).toBe(`#/play/campaigns/${campaignId}/characters/new`);
  });
});
