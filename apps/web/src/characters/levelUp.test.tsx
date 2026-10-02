import type { CampaignId, OwnedCharacter } from "@taverns/api";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reads } from "../api/keys";
import {
  bodyOf,
  brannoc,
  brannocId,
  brannocOffer,
  campaignId,
  installCharacterServer,
  ownedBrannoc,
  ownedSorrel,
  renderSheet,
  sorrelId,
} from "./characters.fixtures";
import { levelUpWrites } from "./write";

/**
 * **Levelling up on the sheet** — the wizard over `GET
 * /me/characters/:id/level-up`, the confirm's `POST`, the Log drawn from the
 * records, and the Undo behind its confirm.
 *
 * Each step kind the offer can carry has a walk here, and each walk ends in
 * the body the confirm sends, because that body is the whole of what the
 * wizard is for: the server holds it to the offer again and refuses anything
 * the offer did not allow.
 */

const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const offerPath = `/me/characters/${brannocId}/level-up`;
const logPath = `/me/characters/${brannocId}/level-ups`;
const id = (n: number) => `2b1f2a1e-0000-4000-8000-0000000f${String(n).padStart(4, "0")}`;

/** What a successful level-up answers: the row at its new level, and its record. */
const leveledUp = (level: number) => ({
  status: 200,
  body: {
    character: {
      ...brannoc,
      level,
      version: 2,
      descriptor: `Level ${String(level)} Half-orc Paladin`,
    },
    advancement: record(level),
  },
});

const record = (level: number, overrides: Record<string, unknown> = {}) => ({
  id: id(9000 + level),
  characterId: brannocId,
  level,
  className: "Paladin",
  hitPoints: { method: "fixed", die: 6, gain: 9 },
  choices: { picks: [], spells: [] },
  note: null,
  origin: "authored",
  assistantTurnId: null,
  createdAt: "2026-09-30T20:00:00.000Z",
  ...overrides,
});

const dialog = () => within(screen.getByRole("dialog"));
const next = () => userEvent.click(dialog().getByRole("button", { name: "Next" }));
const step = (title: string) => dialog().findByText(new RegExp(`step \\d+ of \\d+: ${title}`));
const openWizard = async () => {
  await renderSheet();
  await userEvent.click(await screen.findByRole("button", { name: "Level up" }));
  await screen.findByRole("dialog", { name: /^Level up to/ });
};
const posted = () => bodyOf(server, "POST", offerPath);
/** A checkbox that cannot be ticked, however the primitive spells it. */
const closed = (node: HTMLElement) =>
  node.getAttribute("aria-disabled") === "true" ||
  node.hasAttribute("disabled") ||
  node.hasAttribute("data-disabled");

describe("the level-up wizard", () => {
  it("walks what changes and the hit points to the review, and posts the level", async () => {
    server.routes.set(`POST ${offerPath}`, leveledUp(6));
    await openWizard();

    // What changes, with nobody choosing anything.
    await step("What changes");
    expect(dialog().getByText("Level up to 6")).toBeTruthy();
    expect(dialog().getByText("Aura of Protection")).toBeTruthy();
    expect(dialog().getByText("25 → 30 hp")).toBeTruthy();
    expect(dialog().getByText("Spells you can prepare")).toBeTruthy();
    // The first step has nothing behind it to go back to.
    expect(dialog().queryByRole("button", { name: "Back" })).toBeNull();
    await next();

    // Fixed by default; the roll is the server's, at the confirm.
    await step("Hit points");
    const take = dialog().getByRole("button", { name: "Take 9" });
    expect(take.getAttribute("aria-pressed")).toBe("true");
    expect(dialog().getByText("52 → 61")).toBeTruthy();
    await userEvent.click(dialog().getByRole("button", { name: "Roll 1d10+3" }));
    expect(dialog().getByText(/between 4 and 13/)).toBeTruthy();
    await next();

    await step("Review");
    expect(dialog().getByText("Hit points, rolled at the confirm")).toBeTruthy();
    expect(dialog().getByText("+4 to +13")).toBeTruthy();
    await userEvent.type(dialog().getByRole("textbox", { name: "Note" }), "After the ferry.");
    const reads = () => server.calls.filter((call) => call.pathname === "/me/characters").length;
    const before = reads();
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual({
      expectedVersion: 1,
      toLevel: 6,
      hitPoints: "rolled",
      note: "After the ferry.",
    });
    // The sheet and its Log read themselves again.
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(server.calls.filter((call) => call.pathname === logPath).length).toBeGreaterThan(1);
  });

  it("takes a subclass, then each choice it asks for, with unmet options disabled and why", async () => {
    const hunter = id(301);
    server.routes.set(`GET ${offerPath}`, {
      status: 200,
      body: {
        ...brannocOffer,
        choices: [
          {
            kind: "feature",
            offeredBy: { featureId: id(100), name: "Fighting Style" },
            choose: 1,
            options: [
              {
                featureId: id(101),
                name: "Fighting Style: Defense",
                desc: ["+1 to AC while you wear armor."],
                prerequisites: [],
                available: true,
              },
              {
                featureId: id(102),
                name: "Fighting Style: Blessed Warrior",
                desc: ["Two cleric cantrips."],
                prerequisites: [{ type: "level", level: 7, met: false }],
                available: false,
              },
            ],
          },
          {
            kind: "text",
            offeredBy: { featureId: id(110), name: "Favored Enemy (2 types)" },
            choose: 2,
            desc: "Choose your favored enemies.",
            options: ["fiends", "undead", "dragons"],
          },
          {
            kind: "expertise",
            offeredBy: { featureId: id(120), name: "Expertise" },
            choose: 1,
            options: ["Athletics"],
          },
        ],
        subclass: {
          level: 6,
          current: undefined,
          options: [
            {
              subclassId: id(300),
              name: "Champion",
              flavor: null,
              desc: ["Raw physical power."],
              features: [],
              choices: [],
              spells: [],
            },
            {
              subclassId: hunter,
              name: "Hunter",
              flavor: "A bulwark between civilization and the terrors of the wilderness.",
              desc: ["You accept your place."],
              features: [{ featureId: id(310), name: "Hunter's Prey", level: 3, desc: [] }],
              choices: [
                {
                  kind: "feature",
                  offeredBy: { featureId: id(310), name: "Hunter's Prey" },
                  choose: 1,
                  options: [
                    {
                      featureId: id(311),
                      name: "Colossus Slayer",
                      desc: ["Extra 1d8 damage."],
                      prerequisites: [],
                      available: true,
                    },
                  ],
                },
              ],
              spells: [],
            },
          ],
        },
      },
    });
    server.routes.set(`POST ${offerPath}`, leveledUp(6));
    await openWizard();
    await next();
    await next();

    // A subclass is required, and the wizard waits for one.
    await step("Subclass");
    expect(dialog().getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    await userEvent.click(dialog().getByRole("checkbox", { name: "Hunter" }));
    expect(dialog().getByText("Now: Hunter's Prey")).toBeTruthy();
    await next();

    // A feature choice: an option whose prerequisites are unmet is drawn,
    // disabled, with the reason.
    await step("Fighting Style");
    const blessed = dialog().getByRole("checkbox", { name: "Fighting Style: Blessed Warrior" });
    expect(closed(blessed)).toBe(true);
    expect(dialog().getByText("Needs level 7.")).toBeTruthy();
    await userEvent.click(dialog().getByRole("checkbox", { name: "Fighting Style: Defense" }));
    await next();

    // A choice of the source's own words, two of them: the third is closed once two are taken.
    await step("Favored Enemy");
    expect(dialog().getByText("Choose your favored enemies.")).toBeTruthy();
    await userEvent.click(dialog().getByRole("checkbox", { name: "fiends" }));
    await userEvent.click(dialog().getByRole("checkbox", { name: "undead" }));
    const dragons = dialog().getByRole("checkbox", { name: "dragons" });
    expect(closed(dragons)).toBe(true);
    await next();

    await step("Expertise");
    await userEvent.click(dialog().getByRole("checkbox", { name: "Athletics" }));
    await next();

    // The chosen subclass's own choice comes after the level's.
    await step("Hunter's Prey");
    await userEvent.click(dialog().getByRole("checkbox", { name: "Colossus Slayer" }));
    await next();

    await step("Review");
    for (const line of [
      "Subclass: Hunter",
      "Fighting Style: Defense",
      "Favored Enemy: fiends",
      "Favored Enemy: undead",
      "Expertise: Athletics",
      "Colossus Slayer",
    ]) {
      expect(dialog().getByText(line)).toBeTruthy();
    }
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual({
      expectedVersion: 1,
      toLevel: 6,
      hitPoints: "fixed",
      subclass: { subclassId: hunter },
      picks: [
        { offeredBy: id(100), featureId: id(101) },
        { offeredBy: id(110), value: "fiends" },
        { offeredBy: id(110), value: "undead" },
        { offeredBy: id(120), value: "Athletics" },
        { offeredBy: id(310), featureId: id(311) },
      ],
    });
  });

  it("puts an ASI's points on the scores, says what CON does to hit points, or takes a feat", async () => {
    const grappler = id(400);
    server.routes.set(`GET ${offerPath}`, {
      status: 200,
      body: {
        ...brannocOffer,
        abilityScoreImprovement: {
          offeredBy: { featureId: id(200), name: "Ability Score Improvement" },
          points: 2,
          maximum: 20,
          feats: [
            {
              featId: grappler,
              name: "Grappler",
              description: ["You've developed the skills necessary to hold your own."],
              prerequisites: [{ ability: "STR", minimum: 13 }],
            },
          ],
        },
      },
    });
    server.routes.set(`POST ${offerPath}`, leveledUp(6));
    await openWizard();
    await next();
    await next();

    await step("Ability Score Improvement");
    expect(dialog().getByRole("button", { name: "Next" })).toHaveProperty("disabled", true);
    // Two points on CON: 16 to 18 moves the modifier, and every level's hit points with it.
    await userEvent.click(dialog().getByRole("button", { name: "Raise CON" }));
    expect(dialog().getByText(/goes from \+3 to \+4: \+6 hit points/)).toBeTruthy();

    // One each on two scores instead.
    await userEvent.click(dialog().getByRole("button", { name: "+1 to two scores" }));
    await userEvent.click(dialog().getByRole("button", { name: "Raise STR" }));
    await userEvent.click(dialog().getByRole("button", { name: "Raise DEX" }));
    // A third is not a third point.
    await userEvent.click(dialog().getByRole("button", { name: "Raise WIS" }));
    expect(dialog().getByRole("button", { name: "Raise WIS" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    await next();
    await step("Review");
    expect(dialog().getByText("STR 18 → 19")).toBeTruthy();
    expect(dialog().getByText("DEX 12 → 13")).toBeTruthy();

    // Or a feat in its place.
    await userEvent.click(dialog().getByRole("button", { name: "Back" }));
    await step("Ability Score Improvement");
    await userEvent.click(dialog().getByRole("button", { name: "A feat instead" }));
    expect(dialog().getByText("Needs STR 13")).toBeTruthy();
    await userEvent.click(dialog().getByRole("checkbox", { name: "Grappler" }));
    await next();
    await step("Review");
    expect(dialog().getByText("Feat: Grappler")).toBeTruthy();
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual({
      expectedVersion: 1,
      toLevel: 6,
      hitPoints: "fixed",
      abilityScoreImprovement: { featId: grappler },
    });
  });

  it("learns cantrips and spells up to the counts, swaps one, and picks Magical Secrets", async () => {
    const bless = id(500);
    const spell = (n: number, name: string, level: number, list = "class") => ({
      spellId: id(n),
      name,
      level,
      school: level === 0 ? "Evocation" : "Enchantment",
      list,
    });
    server.routes.set("GET /me/characters", {
      status: 200,
      body: [
        {
          ...ownedBrannoc,
          character: {
            ...brannoc,
            sheet: {
              ...brannoc.sheet,
              spellcasting: {
                ...brannoc.sheet.spellcasting,
                known: [{ name: "Bless", level: 1, spellId: bless }],
              },
            },
          },
        },
        ownedSorrel,
      ],
    });
    server.routes.set(`GET ${offerPath}`, {
      status: 200,
      body: {
        ...brannocOffer,
        spells: {
          mode: "known",
          highestSlotLevel: { from: 2, to: 3 },
          cantrips: 1,
          spells: 1,
          replace: true,
          options: [
            spell(501, "Light", 0),
            spell(502, "Healing Word", 1),
            spell(503, "Hold Person", 2),
          ],
          magicalSecrets: {
            count: 2,
            maximumLevel: 3,
            options: [
              spell(511, "Fireball", 3, "any"),
              spell(512, "Counterspell", 3, "any"),
              spell(513, "Shield", 1, "any"),
            ],
          },
        },
      },
    });
    server.routes.set(`POST ${offerPath}`, leveledUp(6));
    await openWizard();
    await next();
    await next();

    await step("Spells");
    await userEvent.click(dialog().getByRole("checkbox", { name: "Light" }));
    await userEvent.click(dialog().getByRole("checkbox", { name: "Healing Word" }));
    await userEvent.click(dialog().getByRole("checkbox", { name: "Fireball" }));
    await userEvent.click(dialog().getByRole("checkbox", { name: "Counterspell" }));
    // Two secrets are two: the third stays closed.
    const shield = dialog().getByRole("checkbox", { name: "Shield" });
    expect(closed(shield)).toBe(true);
    await userEvent.click(dialog().getByRole("checkbox", { name: "Give up Bless" }));
    await userEvent.click(dialog().getByRole("checkbox", { name: "Learn Hold Person instead" }));
    // The search narrows every list at once.
    await userEvent.type(dialog().getByRole("textbox", { name: "Search spells" }), "fire");
    expect(dialog().queryByRole("checkbox", { name: "Counterspell" })).toBeNull();
    expect(dialog().getByRole("checkbox", { name: "Fireball" })).toBeTruthy();
    await next();

    await step("Review");
    expect(dialog().getByText("Cantrips: Light")).toBeTruthy();
    expect(dialog().getByText("Learned: Healing Word")).toBeTruthy();
    expect(dialog().getByText("Magical Secrets: Fireball, Counterspell")).toBeTruthy();
    expect(dialog().getByText("Swapped Bless for Hold Person")).toBeTruthy();
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual({
      expectedVersion: 1,
      toLevel: 6,
      hitPoints: "fixed",
      spells: {
        cantrips: [id(501)],
        learned: [id(502)],
        replace: { from: bless, to: id(503) },
        magicalSecrets: [id(511), id(512)],
      },
    });
  });

  it("reads the offer again after a Conflict at the confirm, and starts over on the new one", async () => {
    server.routes.set(`POST ${offerPath}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message:
          "the sheet moved on since the level-up was offered (version 2, you read 1). Read the offer again and choose again.",
      },
    });
    await openWizard();
    await next();
    await userEvent.click(dialog().getByRole("button", { name: "Roll 1d10+3" }));
    await next();
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));

    await dialog().findByText(/the sheet moved on since the level-up was offered/);
    const offers = () => server.calls.filter((call) => call.pathname === offerPath).length;
    const before = offers();
    server.routes.set(`GET ${offerPath}`, { status: 200, body: { ...brannocOffer, version: 2 } });
    server.routes.set(`POST ${offerPath}`, leveledUp(6));
    await userEvent.click(dialog().getByRole("button", { name: "Reload" }));

    // A new version is a new offer: back at the first step, the choices gone.
    await waitFor(() => expect(offers()).toBeGreaterThan(before));
    await step("What changes");
    await next();
    expect(dialog().getByRole("button", { name: "Take 9" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await next();
    await userEvent.click(dialog().getByRole("button", { name: "Level up to 6" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted()).toEqual({ expectedVersion: 2, toLevel: 6, hitPoints: "fixed" });
  });

  it("is not offered when the character's rules have no hit die for its class, or no next level", async () => {
    await renderSheet(sorrelId);
    await screen.findByRole("heading", { name: "Sorrel Ash" });
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith(`${sorrelId}/level-up`))).toBe(
        true,
      ),
    );
    expect(screen.queryByRole("button", { name: "Level up" })).toBeNull();
    cleanup();
    document.body.replaceChildren();

    server.routes.set(`GET ${offerPath}`, {
      status: 409,
      body: { _tag: "Conflict", message: "This character is at the highest level a sheet holds." },
    });
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname === offerPath)).toBe(true),
    );
    expect(screen.queryByRole("button", { name: "Level up" })).toBeNull();
  });
});

describe("the Log", () => {
  const logSection = () => {
    const box = document.getElementById("sheet-log");
    if (box === null) throw new Error("no Log section");
    return within(box);
  };

  it("draws the records latest first, keeps older lines, and undoes the latest behind a confirm", async () => {
    server.routes.set(`GET ${logPath}`, {
      status: 200,
      body: [
        record(5, {
          hitPoints: { method: "rolled", die: 9, gain: 12 },
          choices: {
            subclass: { name: "Oath of Devotion", subclassId: id(600) },
            abilityScores: [{ ability: "CHA", from: 14, to: 16 }],
            picks: [
              {
                kind: "feature",
                offeredBy: { featureId: id(100), name: "Fighting Style" },
                featureId: id(101),
                name: "Fighting Style: Defense",
              },
            ],
            spells: [],
          },
          note: "Took the oath at the ferry crossing.",
        }),
      ],
    });
    server.routes.set(`DELETE ${logPath}/5`, {
      status: 200,
      body: {
        character: { ...brannoc, level: 4, version: 2 },
        keptScores: [{ label: "CHA", score: "17", raised: { from: "14", to: "16" } }],
      },
    });
    await renderSheet();
    await screen.findByRole("heading", { name: "Level ups" });
    await logSection().findByText("Took the oath at the ferry crossing.");

    // The record, in its own words, and the date it was taken.
    expect(
      logSection().getByText(
        "+12 hit points, rolled 9 · Subclass: Oath of Devotion · CHA 14 → 16 · Fighting Style: Defense",
      ),
    ).toBeTruthy();
    expect(logSection().getByText("30 September 2026")).toBeTruthy();
    // Level 4 has no record, so the document's own older line is still drawn —
    // and nothing can undo it.
    expect(logSection().getByText("+2 Charisma.")).toBeTruthy();
    expect(
      logSection()
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Undo level 5"]);

    await userEvent.click(logSection().getByRole("button", { name: "Undo level 5" }));
    const confirm = within(await screen.findByRole("dialog", { name: "Back to level 4?" }));
    expect(confirm.getByText("Subclass: Oath of Devotion")).toBeTruthy();
    // Keeping it is a press too, and sends nothing.
    expect(confirm.getByRole("button", { name: "Keep level 5" })).toBeTruthy();
    await userEvent.click(confirm.getByRole("button", { name: "Back to level 4" }));

    const done = within(await screen.findByRole("dialog", { name: "Back to level 4" }));
    expect(
      server.calls.some((call) => call.method === "DELETE" && call.pathname === `${logPath}/5`),
    ).toBe(true);
    // A score changed by hand since stays, and the dialog says so before it goes.
    expect(done.getByText(/CHA stays 17/)).toBeTruthy();
    await userEvent.click(done.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers no undo for a record the Level box has moved past", async () => {
    // The character is at 5 by the Level box; its last record is level 4.
    server.routes.set(`GET ${logPath}`, { status: 200, body: [record(4)] });
    await renderSheet();
    await screen.findByRole("heading", { name: "Level ups" });
    await logSection().findByText("+9 hit points, fixed");
    expect(logSection().queryByRole("button", { name: /Undo/ })).toBeNull();
  });
});

describe("what a level-up changes", () => {
  it("names the sheet's reads, every table's party and encounters, and the Log", () => {
    const owned = ownedBrannoc as unknown as OwnedCharacter;
    expect(levelUpWrites(owned)).toEqual(
      expect.arrayContaining([
        reads.myCharacters,
        reads.characterSpells(owned.character.id),
        reads.party(campaignId as CampaignId),
        reads.encounters(campaignId as CampaignId),
        reads.characterLevelUps(owned.character.id),
      ]),
    );
  });
});
