import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  campaignId,
  campaignOptions,
  drafted,
  draftedNothing,
  draftThreadId,
  draftTurnId,
  hobRoutes,
  installCharacterServer,
  longswordRow,
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

/**
 * Pick from one of the three vocabularies.
 *
 * Race, class and background are `Select`s rather than boxes since the captain's
 * decision to use the campaign's 2014 rules rows, so a test drives them the way
 * every other select in this suite is driven, by the trigger's own accessible
 * name.
 */
const pick = async (label: string, option: string) => {
  await userEvent.click(await screen.findByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

/** Type over a box the pick has already filled in. */
const retype = async (label: RegExp | string, value: string) => {
  const box = await screen.findByLabelText(label);
  await userEvent.clear(box);
  await userEvent.type(box, value);
};

/** A campaign this account is at no table of. */
const strangerCampaignId = "2b1f2a1e-0000-4000-8000-0000000000ff";

describe("writing down a character of your own", () => {
  it("names the campaign in the path and nothing about the account in the body", async () => {
    await renderCreate();
    await fillItIn();

    await type(/^Name$/, "Sorrel Ash");
    await type(/^Player$/, "Ilse");
    await pick("Race", "Elf");
    await pick("Class", "Druid");
    // Both are seeded by the picks above; typing over them is what the form is
    // for, and is what takes them out of the seed's reach.
    await retype(/^AC$/, "14");
    await retype(/Hit points/, "9");
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
      // Level 1 without anybody typing it, and the two labels are the
      // vocabulary's own words — which is what makes them readable back.
      level: 1,
      race: "Elf",
      className: "Druid",
      ac: 14,
      hpMax: 9,
      sheet: {
        notes: "Raised by the road.",
        abilities: [],
        traits: [],
        // The corpora's identity keys — the race answers the speed and the
        // class the hit die, through the same `sheetGrantsFor` Hob composes.
        identity: { speed: "30 ft.", hitDice: "1/1 d8" },
        // And the one counter every class has, its hit dice, on `resources`.
        resources: [
          {
            id: "hit-dice",
            name: "Hit dice",
            used: 0,
            max: 1,
            recharge: "long",
            unit: "d8",
            derived: true,
          },
        ],
      },
    });
    // The whole disclosure property in one assertion: the row comes out at its
    // column defaults because nothing here can say otherwise. There is no
    // control for any of these and one would not compile — `CharacterOwnCreate`
    // has no field for them — and the encoder drops an excess key anyway.
    for (const key of ["accountId", "hpCurrent", "tempHp", "conditions", "visibility"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  /**
   * **The kit picker: both sides listed, the pick decides.** The Fighter's
   * source says *(a) a martial weapon and a shield or (b) two martial
   * weapons*; the form draws the sides as a select and, inside the chosen
   * side, a select per pick over the category's rows. What lands on the
   * sheet is the pick — a Longsword line on the gear with its equipment id,
   * and the Longsword attack on `actions` derived from it — through the same
   * `sheetGrantsFor` Hob composes.
   */
  it("lists the kit's sides and derives the attack from the weapon picked", async () => {
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Brannoc");
    await pick("Class", "Fighter");

    // Side (a) is the default, and its category line is a select of its own.
    expect(
      screen.getByText("(a) a martial weapon and a shield or (b) two martial weapons"),
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Kit choice 1" }).textContent).toContain(
      "Any martial weapon, Shield",
    );
    await pick("Any martial weapon", "Longsword");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    const body = bodyOf(server, "POST", createPath) as { sheet: Record<string, unknown> };
    expect(body.sheet["inventory"]).toEqual([
      { name: "Longsword", equipmentId: longswordRow.id },
      { name: "Shield", equipmentId: "2b1f2a1e-0000-4000-8000-0000000e0003" },
    ]);
    expect(body.sheet["actions"]).toEqual([
      expect.objectContaining({
        id: "atk:longsword",
        name: "Longsword",
        cost: "action",
        // No scores set: a bare 10, so the bonus is the proficiency alone.
        hit: "+2",
        dice: "1d8",
        damageType: "Slashing",
        source: "weapon",
        equipmentId: longswordRow.id,
        derived: true,
      }),
      expect.objectContaining({ name: "Second Wind", cost: "bonus", dice: "1d10+1" }),
    ]);
    expect(body.sheet["resources"]).toEqual([
      expect.objectContaining({ id: "hit-dice", max: 1, unit: "d10" }),
      expect.objectContaining({ id: "res:second-wind", max: 1, recharge: "short" }),
    ]);
  });

  it("takes the other side of a kit choice and drops the picks made against the first", async () => {
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Brannoc");
    await pick("Class", "Fighter");
    await pick("Any martial weapon", "Longsword");
    await pick("Kit choice 1", "2 × Any martial weapon");

    // Two picks now, both empty again.
    expect(screen.getByRole("combobox", { name: "Any martial weapon (1)" }).textContent).toContain(
      "Pick one",
    );
    expect(screen.getByRole("combobox", { name: "Any martial weapon (2)" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));

    const body = bodyOf(server, "POST", createPath) as { sheet: Record<string, unknown> };
    // An unpicked category is a line with no weapon behind it, never a weapon
    // nobody chose.
    expect(body.sheet["inventory"]).toEqual([
      { name: "Any martial weapon", quantity: 2, note: "Your pick" },
    ]);
    expect(
      (body.sheet["actions"] as ReadonlyArray<{ name: string }>).map((action) => action.name),
    ).toEqual(["Second Wind"]);
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
    // The sheet's own spine, which the create form never draws.
    expect(
      within(await screen.findByRole("navigation", { name: "Sheet sections" }))
        .getAllByRole("button")
        .map((item) => item.getAttribute("aria-label")),
    ).toContain("Story");
    // And the form is gone rather than layered under it.
    expect(screen.queryByRole("button", { name: /Create character/i })).toBeNull();
    // `replace: true`, so *Back* from the sheet goes to wherever the player
    // started rather than to a form for a character they have already made.
    expect(window.location.hash).toBe(`#/characters/${brannocId}`);
  });

  it("writes the background label without changing creation arithmetic", async () => {
    // In the 2014 ruleset backgrounds carry proficiencies and story hooks; the
    // ability-score arithmetic belongs to race and subrace. Picking a
    // background therefore writes the sheet facts and leaves the two numbers
    // alone.
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Sorrel Ash");
    await pick("Class", "Druid");
    // d8 with no scores set: the die and a bare 10.
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("8");

    await pick("Background", "Soldier");
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("8");
    expect(screen.queryByText(/on top of the scores above/)).toBeNull();

    await pick("Background", "Salt-runner");
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("8");
    expect(screen.queryByText(/on top of the scores above/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    const body = bodyOf(server, "POST", createPath) as Record<string, unknown>;
    // The label goes in the document rather than in a column: nothing filters
    // or sorts on a background and it is not one of the fields `descriptor` is
    // built from. The 2014 background's proficiencies, equipment, gold and
    // feature are sheet data beside it.
    expect(body.sheet).toEqual({
      notes: "",
      abilities: [],
      traits: [{ name: "Riverwise", text: "You know who watches the crossings." }],
      identity: { hitDice: "1/1 d8", background: "Salt-runner" },
      proficiencies: ["Athletics", "River cant"],
      resources: [
        {
          id: "hit-dice",
          name: "Hit dice",
          used: 0,
          max: 1,
          recharge: "long",
          unit: "d8",
          derived: true,
        },
      ],
      inventory: [{ name: "Travel-stained clothes" }, { name: "ferryman's token" }],
      currency: { gp: 15 },
    });
  });

  it("writes the race-raised cells, so the sheet and the two numbers cannot disagree", async () => {
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Sorrel Ash");
    await pick("Class", "Druid");
    await pick("Background", "Salt-runner");
    // The shipped abilities editor, over the create form. Standard array in
    // draw order puts 13 in constitution.
    await userEvent.click(screen.getByRole("button", { name: /Set ability scores/i }));
    const scores = await screen.findByRole("dialog");
    await userEvent.click(within(scores).getByRole("button", { name: /Standard array/i }));
    await userEvent.click(within(scores).getByRole("button", { name: /Use these scores/i }));

    // CON 13 is the score the seed reads; backgrounds no longer raise it, so
    // the d8 seeds from `+1`.
    await waitFor(() => {
      expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("9");
    });

    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    const body = bodyOf(server, "POST", createPath) as Record<string, unknown>;
    const sheet = body.sheet as { readonly abilities: ReadonlyArray<Record<string, string>> };
    // **The property the whole shape exists for.** Written cells that did not
    // carry the grant would leave the sheet saying CON 13 beside hit points
    // worked out from 15 — right on both sides and wrong together.
    expect(sheet.abilities).toContainEqual({ label: "CON", score: "13", modifier: "+1" });
    expect(sheet.abilities).toContainEqual({ label: "WIS", score: "10", modifier: "+0" });
    expect(body.hpMax).toBe(9);
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
    expect(screen.getByText(/Produce Flame · Cantrip/)).toBeTruthy();
    expect(screen.getByText(/Cure Wounds · Prepared/)).toBeTruthy();
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
    expect(window.location.hash).toBe(`#/characters/${brannocId}`);
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
    // original paragraph — the failure §4.3 of the plan names. Both carry
    // `intent`, because a redraft is the same surface asking.
    expect(asks[0]).not.toHaveProperty("threadId");
    expect(asks[1]).toEqual({
      threadId: draftThreadId,
      text: "Darker backstory",
      intent: "character",
    });
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
    // **One explanation, not two.** The server says so too — it has to, because
    // the DM's panel has no equivalent sentence of its own — and this screen's
    // own line is the one that names *this* way on. `draft.ts` keeps Hob's
    // prose over a failure sentence, which is what makes that true.
    expect(screen.queryByText(/did not make a usable drafting call/)).toBeNull();
    // Nothing to keep, and nothing pretending there is.
    expect(screen.queryByRole("button", { name: /Keep them/i })).toBeNull();

    await fillItIn();
    await type(/^Name$/, "Sorrel Ash");
    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    expect(bodyOf(server, "POST", createPath)).toMatchObject({ name: "Sorrel Ash" });
  });

  it("says a redraft changed nothing, rather than leaving the old sheet unexplained", async () => {
    // The same failure as the one above, one position along and much easier to
    // miss: the card is still on screen, so a player who asked for a ranger and
    // got prose would otherwise be looking at the druid with nothing saying why.
    await renderCreate();
    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A wood elf who grew up in a river town.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));
    await screen.findByText("Sorrel Ash");

    server.routes.set(`POST /campaigns/${campaignId}/hob/ask`, draftedNothing());
    await userEvent.click(screen.getByRole("button", { name: "Darker backstory" }));

    expect(await screen.findByText(/Nothing changed on the sheet above/)).toBeTruthy();
    // The draft is still there and still keepable.
    expect(screen.getByText("Sorrel Ash")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Keep them/i })).toBeTruthy();
  });

  it("says Hob could not be reached rather than that no model is configured", async () => {
    // Two different sentences because they have two different fixes, and only
    // one of them is the reader's to act on. A failed status read used to say
    // the server had no model, which is a claim it has no evidence for.
    server.routes.set(`GET /campaigns/${campaignId}/hob`, {
      status: 503,
      body: { _tag: "HobUnavailable", message: "nope" },
    });

    await renderCreate();

    expect(await screen.findByText(/Hob could not be reached/)).toBeTruthy();
    expect(screen.queryByText(/No model is configured/)).toBeNull();
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
    expect(window.location.hash).toBe(`#/campaigns/${campaignId}/characters/new`);
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

  it("draws the form at a table this account runs — the continuity inversion", async () => {
    // **This test used to pin the opposite** — *"You run this table"*, a
    // refusal drawn because a character was campaign-scoped and DM-typed. The
    // continuity decision of 2026-09-01 made the character account-owned and
    // its creator a player too, so a creator's own table offers the form
    // exactly as a played one does — the screen agreeing with
    // `tablesForNewCharacter`, which now folds every membership.
    server.routes = onlyDmTables();
    server.routes.set(`POST ${createPath}`, savedAs(brannoc));
    await renderCreate();

    expect(await screen.findByRole("button", { name: /Fill it in myself/i })).toBeTruthy();
    expect(screen.queryByText("You run this table")).toBeNull();
    expect(screen.queryByText("Not your table")).toBeNull();
  });

  it("drafts for the creator too, and names the surface in the ask", async () => {
    // **The regression behind "Hob is not working through character
    // creation."** The continuity inversion above opened this composer to the
    // campaign's creator — but the server told the two Hob surfaces apart by
    // the creator proof alone, so a creator's draft ask was answered with the
    // panel's nine tools, none of which is `proposeCharacter`: prose, no card,
    // *"No sheet came back"* every time, and the description filed into the
    // campaign's shared thread. `intent: "character"` is the composer saying
    // which surface is asking; the server answers it with the drafting toolkit
    // and a thread of the asker's own whatever their relation
    // (`apps/server/test/hob-character.test.ts` pins that half).
    server.routes = onlyDmTables();
    for (const [route, answer] of hobRoutes()) server.routes.set(route, answer);
    await renderCreate();

    await userEvent.type(
      await screen.findByLabelText(/Describe your character/i),
      "A gruff dwarf fighter, retired soldier, terrible at cards.",
    );
    await userEvent.click(screen.getByRole("button", { name: /Have Hob draft the sheet/i }));

    expect(await screen.findByText("Sorrel Ash")).toBeTruthy();
    const asks = server.calls
      .filter((call) => call.pathname === `/campaigns/${campaignId}/hob/ask`)
      .map((call) => JSON.parse(call.body) as Record<string, unknown>);
    expect(asks[0]).toMatchObject({ intent: "character" });
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
    expect(window.location.hash).toBe(`#/campaigns/${campaignId}/characters/new`);
  });
  it("seeds the two numbers from a pick, and says what they are", async () => {
    await renderCreate();
    await fillItIn();

    // Nothing is filled in until a class is: there is no hit die to read, and a
    // form that opened on a number nobody chose would be the stubbed field this
    // product refuses everywhere else.
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/A starting point from the class, the race/)).toBeNull();

    await pick("Class", "Wizard");
    // d6, and no ability scores on this form — so the die and a bare 10.
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText(/^AC$/) as HTMLInputElement).value).toBe("10");
    // Said where the numbers are, before the press rather than at the table —
    // including that no scores are set, which is what stops "6 hit points"
    // reading as this wizard's real total.
    await screen.findByText(/A starting point from the class, the race or subrace/);
    await screen.findByText(/No scores are set, so every modifier counts as \+0/);

    // Changing the pick re-seeds: a wizard's hit points must not survive into a
    // barbarian, which renders as a perfectly ordinary form when it is wrong.
    await pick("Class", "Barbarian");
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("12");
    await pick("Race", "Dwarf");
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("12");
    await pick("Subrace", "Hill Dwarf");
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("13");
  });

  it("never writes over a number the player typed, however the pick changes", async () => {
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Sorrel Ash");
    await pick("Class", "Druid");
    await retype(/Hit points/, "34");
    await pick("Class", "Sorcerer");

    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("34");
    // The AC is still the seed's, because that box was never touched.
    expect((screen.getByLabelText(/^AC$/) as HTMLInputElement).value).toBe("10");

    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    expect(bodyOf(server, "POST", createPath)).toMatchObject({
      className: "Sorcerer",
      hpMax: 34,
      ac: 10,
      level: 1,
    });
  });

  it("seeds from the ability scores, which is what makes the two paths agree", async () => {
    // **The captain's own example, driven through the real editor.** A Dwarf
    // Barbarian by hand used to come out on 13 hit points and armour class 10
    // while Hob's draft of the same character came out on 15 and 13, because
    // only one of the two had scores to seed from.
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Brannoc");
    await pick("Class", "Barbarian");
    await pick("Race", "Dwarf");
    await pick("Subrace", "Hill Dwarf");

    // The bare baseline is still what a character with no scores gets, and the
    // form says so where the numbers are.
    expect((screen.getByLabelText(/Hit points/) as HTMLInputElement).value).toBe("13");
    expect((screen.getByLabelText(/^AC$/) as HTMLInputElement).value).toBe("10");
    await screen.findByText(/No scores are set, so every modifier counts as \+0/);

    // The shipped editor, opened over a character that does not exist yet.
    await userEvent.click(screen.getByRole("button", { name: /Set ability scores/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Standard array/i }));
    // Assigned in draw order, so the 15 lands on strength — and a barbarian
    // wants it on constitution. The swap is the accessible half of the
    // drawing's drag and is the same control the sheet offers.
    await userEvent.click(screen.getByRole("combobox", { name: /Swap STR score with/i }));
    await userEvent.click(await screen.findByRole("option", { name: /^CON/ }));
    await userEvent.click(screen.getByRole("button", { name: /Use these scores/i }));

    // 12 (d12) + 3 (CON 17 after the race bonus) + 1 (Dwarven Toughness), and
    // 10 + 2 (DEX 14) + 3 (CON 17) — Unarmoured Defense, which is why
    // `unarmouredAc` is a list.
    expect((await screen.findByLabelText(/Hit points/)) as HTMLInputElement).toHaveValue(16);
    expect(screen.getByLabelText(/^AC$/)).toHaveValue(15);
    // Said on the form itself, so the scores are readable without reopening.
    await screen.findByText(/STR 13 · DEX 14 · CON 15/);

    await userEvent.click(screen.getByRole("button", { name: /Create character/i }));
    const body = bodyOf(server, "POST", createPath) as {
      hpMax: number;
      ac: number;
      sheet: { abilities: ReadonlyArray<{ label: string; score: string; modifier: string }> };
    };
    expect(body.hpMax).toBe(16);
    expect(body.ac).toBe(15);
    expect(body.sheet.abilities).toContainEqual({ label: "CON", score: "17", modifier: "+3" });
  });

  it("leaves a number the player typed alone when the scores change", async () => {
    // The same `edited` set the pickers respect, and the same one rule: a box
    // the player has typed in is theirs for ever, whichever of the three things
    // the seed reads moves afterwards.
    await renderCreate();
    await fillItIn();
    await type(/^Name$/, "Brannoc");
    await pick("Class", "Barbarian");
    await retype(/^AC$/, "18");

    await userEvent.click(screen.getByRole("button", { name: /Set ability scores/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Standard array/i }));
    await userEvent.click(screen.getByRole("button", { name: /Use these scores/i }));

    expect(screen.getByLabelText(/^AC$/)).toHaveValue(18);
    // The hit points were never touched, so they still follow: 12 + 1 (CON 13).
    expect(screen.getByLabelText(/Hit points/)).toHaveValue(13);
  });

  it("changes nothing when the editor is closed without being used", async () => {
    // Cancelling is not a save, on either surface. The create form's shell
    // writes nothing at all — the scores are form state until *Create*.
    await renderCreate();
    await fillItIn();
    await pick("Class", "Wizard");
    await userEvent.click(screen.getByRole("button", { name: /Set ability scores/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Roll 4d6/i }));
    await userEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    expect(screen.getByLabelText(/Hit points/)).toHaveValue(6);
    expect(screen.queryByText(/^STR /)).toBeNull();
    await screen.findByRole("button", { name: /Set ability scores/i });
  });

  it("offers the vocabulary and nothing else, so no free-text class can be created", async () => {
    await renderCreate();
    await fillItIn();
    // The captain's decision of 2026-08-26 read as a property of the screen:
    // there is no box to type "Circle of the Moon Druid" into. What an existing
    // character carrying one keeps is a separate question, answered by there
    // being no migration at all — see `packages/api/src/Ruleset.ts`.
    expect(screen.queryByRole("textbox", { name: "Class" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Race" })).toBeNull();

    // **What is offered is what the server answered**, which since a campaign
    // can have its own classes is the bundled twelve *plus* whatever this table
    // has copied in and shared. The count is the fixture's rather than a
    // constant, because a constant would be a second answer to a question the
    // read has already settled.
    await userEvent.click(await screen.findByRole("combobox", { name: "Class" }));
    const offered = await screen.findAllByRole("option");
    expect(offered.map((option) => option.textContent)).toEqual(
      campaignOptions.filter((row) => row.kind === "class").map((row) => row.name),
    );
    // Including this table's own — the whole point of the vocabulary being a
    // read. A class the DM has **not** shared is absent, and that is the server
    // narrowing rather than anything this screen does.
    expect(offered.map((option) => option.textContent)).toContain("Bloodsworn");
  });

  it("offers a race this table shared and not one it kept to itself", async () => {
    await renderCreate();
    await fillItIn();
    await userEvent.click(await screen.findByRole("combobox", { name: "Race" }));
    const offered = (await screen.findAllByRole("option")).map((option) => option.textContent);
    // `Marshfolk` is a campaign copy at `visibility: "dm"` in the fixture, so
    // `corpusRowReadable` would not return it to a player — and the fixture's
    // campaign list is what a player's read answers. The screen adds no filter
    // of its own and must not: a client-side "only the shared ones" would be a
    // second answer to a question the predicate has already settled.
    expect(offered).toContain("Elf");
    expect(offered).toEqual(
      campaignOptions.filter((row) => row.kind === "race").map((row) => row.name),
    );
  });
});
