import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  campaignId,
  drafted,
  draftedNothing,
  draftThreadId,
  draftTurnId,
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
 * Since the Hob slice there are two paths onto it, and the fourth thing worth
 * asserting is that **they land in the same place**: a draft that never arrives
 * is one press from the form, and a draft that does becomes a real row through
 * an accept that carries no content.
 *
 * The pure half — which tables, and how a draft becomes a payload — is
 * `create.test.ts`, and the server half is `player-create.test.ts` and
 * `apps/server/test/hob-character.test.ts`.
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

/**
 * Take the *Fill it in myself* fork.
 *
 * The screen opens on the drawn step 1 — a prose composer and *Have Hob draft
 * the sheet* — and the form is the other fork. It is a press rather than a
 * separate route on purpose (`CharacterCreateScreen`), so every test about the
 * form starts here and every test about the draft does not.
 */
const fillItIn = async () => {
  await userEvent.click(await screen.findByRole("button", { name: /Fill it in myself/i }));
};

/** A campaign this account is at no table of. */
const strangerCampaignId = "2b1f2a1e-0000-4000-8000-0000000000ff";

describe("writing down a character of your own", () => {
  it("names the campaign in the path and nothing about the account in the body", async () => {
    await renderCreate();
    await fillItIn();

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
    await fillItIn();
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
    await fillItIn();
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    expect(await screen.findByText("Give them a name.")).toBeTruthy();
    // Nothing left the browser. The contract would have refused it locally
    // anyway, but with a sentence written for whoever wrote the schema.
    expect(server.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("tells the player who will be able to read it", async () => {
    await renderCreate();
    await fillItIn();
    // A new row is `dm` by column default and the form has no control to change
    // that, so the answer is said before the press rather than discovered after
    // it.
    expect(await screen.findByText(/Only you and your DM can see them/)).toBeTruthy();
  });

  it("draws Hob's draft and keeps it with an accept that carries no content", async () => {
    server.routes.set(
      `POST /campaigns/${campaignId}/hob/threads/${draftThreadId}/turns/${draftTurnId}/accept`,
      {
        status: 200,
        body: { accepted: "character", character: brannoc },
      },
    );

    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));

    // The drawn step 2: the sheet as Hob wrote it, and the reasons beside it.
    expect(await screen.findByText("Sorrel Ash")).toBeTruthy();
    expect(screen.getByText(/Wood elf Druid · Circle of the Land \(Marsh\)/)).toBeTruthy();
    expect(screen.getByText("Nature")).toBeTruthy();
    expect(screen.getByText("Herbalism kit")).toBeTruthy();
    // `rationale` is a parameter of `proposeCharacter` and is on the proposal,
    // so this is Hob's own argument rather than something the screen derived.
    expect(screen.getByText(/Wisdom is highest because druid casting keys off it/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Keep them/i }));

    // **The accept carries three ids and nothing else.** `repo/Proposals.ts` is
    // built around that: if it took the content, any client could post its own
    // prose and have it recorded as the assistant's. The empty object is the
    // declared payload, and there is nowhere in it to put a sheet.
    const accept = server.calls.find((call) => call.pathname.includes("/accept"));
    expect(accept?.pathname).toBe(
      `/campaigns/${campaignId}/hob/threads/${draftThreadId}/turns/${draftTurnId}/accept`,
    );
    expect(JSON.parse(accept?.body ?? "{}")).toEqual({});
    // No `POST /me/campaigns/:c/characters` anywhere: the row is made by the
    // accept, from the proposal the server stored.
    expect(server.calls.filter((call) => call.pathname === createPath)).toHaveLength(0);

    // And it lands on the shipped sheet, exactly as the form does.
    await screen.findAllByText("Brannoc Duskharrow");
    expect(window.location.hash).toBe(`#/play/characters/${brannocId}`);
  });

  it("asks again in the same thread, so Hob can see what it already drafted", async () => {
    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));
    await screen.findByText("Sorrel Ash");

    await userEvent.click(screen.getByRole("button", { name: "Darker backstory" }));

    const asks = server.calls
      .filter((call) => call.pathname === `/campaigns/${campaignId}/hob/ask`)
      .map((call) => JSON.parse(call.body) as Record<string, unknown>);
    expect(asks).toHaveLength(2);
    // **The first question starts a thread and the second continues it**, which
    // is what lets `promptFor`'s `offered()` show the model the druid it wrote.
    // Without it, "make her a ranger instead" drafts a fresh person from the
    // original paragraph — the failure §4.3 of the plan names.
    expect(asks[0]).not.toHaveProperty("threadId");
    expect(asks[1]).toEqual({ threadId: draftThreadId, text: "Darker backstory" });
  });

  it("never dead-ends when the model does not draft", async () => {
    // **Measured, not hypothetical**: with all tools offered, the captain's own
    // configured 4B chose the propose tool one time in five. So a finished
    // answer with no card is an ordinary outcome, and the screen has to say so
    // and leave the player one press from the form.
    server.routes.set(`POST /campaigns/${campaignId}/hob/ask`, draftedNothing());

    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));

    expect(await screen.findByText(/Tell me more about where she is from/)).toBeTruthy();
    expect(screen.getByText(/No sheet came back this time/)).toBeTruthy();
    // Nothing to keep, and nothing pretending there is.
    expect(screen.queryByRole("button", { name: /Keep them/i })).toBeNull();

    await fillItIn();
    await type(/^Name$/, "Sorrel Ash");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    expect(bodyOf(server, "POST", createPath)).toMatchObject({ name: "Sorrel Ash" });
  });

  it("offers no composer when no model is configured, and says why", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/hob`, {
      status: 200,
      body: { available: false, model: null, campaign: "The Salt Road" },
    });

    await renderCreate();

    expect(await screen.findByText(/No model is configured behind Hob/)).toBeTruthy();
    const draftIt = screen.getByRole("button", { name: /Have Hob draft the sheet/i });
    expect((draftIt as HTMLButtonElement).disabled).toBe(true);
    // The spine is untouched: *Fill it in myself* is the same press it always was.
    await fillItIn();
    expect(await screen.findByLabelText(/^Name$/)).toBeTruthy();
  });

  it("says nothing was kept when the accept is refused, and keeps the draft", async () => {
    server.routes.set(
      `POST /campaigns/${campaignId}/hob/threads/${draftThreadId}/turns/${draftTurnId}/accept`,
      {
        status: 409,
        body: { _tag: "Conflict", message: "that is already in the campaign" },
      },
    );

    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));
    await screen.findByText("Sorrel Ash");
    await userEvent.click(screen.getByRole("button", { name: /Keep them/i }));

    expect(await screen.findByText("that is already in the campaign")).toBeTruthy();
    // The card is still there — a refused accept that threw the draft away
    // would be the worse failure, and the redraft loop is still reachable.
    expect(screen.getByText("Sorrel Ash")).toBeTruthy();
    expect(window.location.hash).toBe(`#/play/campaigns/${campaignId}/characters/new`);
  });

  it("ignores a proposal that is not a character", async () => {
    // The union is four wide on the wire and this surface can only ever be
    // offered one member of it, because the player toolkit has one propose
    // tool. Narrowed rather than asserted, so a member arriving from a toolkit
    // change is an offer this screen ignores rather than a card it draws
    // wrongly.
    server.routes.set(
      `POST /campaigns/${campaignId}/hob/ask`,
      drafted({ target: "beat", body: "The ferryman took the coin." }),
    );

    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));

    expect(await screen.findByText(/No sheet came back this time/)).toBeTruthy();
    expect(screen.queryByText("The ferryman took the coin.")).toBeNull();
  });

  it("draws no form at a table this account is not a player at", async () => {
    // The read the screen already makes is what answers it, so the form is never
    // drawn over a table the save would refuse. `GET /me/campaigns` composes the
    // same membership clause `ensureCampaignReadable` does.
    await renderCreate(strangerCampaignId);
    expect(await screen.findByText("Not your table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Fill it in myself/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // Nothing was asked of Hob either: the screen knows it is drawing a refusal
    // before it would have asked whether a model is configured.
    expect(server.calls.some((call) => call.pathname.includes("/hob"))).toBe(false);
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
    expect(screen.queryByRole("button", { name: /Fill it in myself/i })).toBeNull();
  });

  it("says the server did not answer rather than drawing an empty form", async () => {
    server.transportDown = true;
    await renderCreate();

    await screen.findByText("The server did not answer");
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Fill it in myself/i })).toBeNull();
  });

  it("keeps what was typed when the save is refused", async () => {
    server.routes.set(`POST ${createPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderCreate();
    await fillItIn();
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
