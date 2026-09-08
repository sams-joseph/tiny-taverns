import {
  Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  Conflict,
  CurrentActor,
  type HobEvent,
  NotFound,
  signed,
  type SpellId,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { Characters } from "../src/repo/Characters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EquipmentRepo } from "../src/repo/Equipment.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { Notes } from "../src/repo/Notes.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { Npcs } from "../src/repo/Npcs.js";
import { Options } from "../src/repo/Options.js";
import { Party } from "../src/repo/Party.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { Spells } from "../src/repo/Spells.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { aPlayerAt, anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type ChatRequest, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * **A player may talk to Hob, and Hob may draft them a character.**
 *
 * The captain reversed *players do not talk to Hob* on 2026-08-26. This file is
 * the whole of what that bought, held to five claims:
 *
 * - **the tool takes no numbers** — a model ranks six words and the server
 *   applies the standard array and derives every modifier, so a card and the
 *   row it becomes cannot disagree about arithmetic a small model gets wrong;
 * - **a draft is not a character** — a proposal leaves the campaign exactly as
 *   it was, and the only thing that makes a row is an accept;
 * - **the accepted row is the player's own** — `account_id` from the
 *   credential, `origin: 'assistant'` pointing at the turn that drafted it,
 *   `visibility` at the column default, and hit points at *nobody has said*;
 * - **a client cannot write the content** — accept takes no payload at all, and
 *   the proposal it materialises from is the one the *server* stored;
 * - **the redraft loop can see the draft** — *"make her a ranger instead"*
 *   reaches a model that is shown what it already offered, which is the one
 *   defect §4.3 of the plan names.
 *
 * The model is scripted (`test/support/model.ts`), so everything below the
 * provider is real: real Postgres, real predicates, the real toolkit, the real
 * accept.
 */

const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Groups.layer,
  GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
  Characters.layer,
  Creatures.layer,
  CampaignCreatorActors.layer,
  EquipmentRepo.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Npcs.layer,
  NpcKnowledge.layer,
  NpcMemories.layer,
  Options.layer,
  Party.layer.pipe(Layer.provide(LiveEvents.layer)),
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      Characters.layer,
      EncounterCreatures.layer,
      Encounters.layer,
      GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
      Notes.layer,
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  Spells.layer,
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_hob_character")));

const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

const MAX_TOKENS = 512;

/** One shared table, its DM, two players, and something in the record to find. */
const makeFixture = Effect.gen(function* () {
  const notes = yield* Notes;

  /**
   * The bundle, as rows — which is what a real campaign's vocabulary *is*.
   *
   * Since slice 2 `proposeCharacter` is built from `Options.list`, so a database
   * where `pnpm -F server ruleset:import` has never run gives Hob a campaign
   * with no classes in it — free text, and a seed with no hit die. That is the
   * honest degrade and it is asserted in its own test below; it is not the state
   * a deployed table is in, so the fixture is seeded exactly as a deployment is.
   */
  yield* importSystemEquipment();
  yield* importSystemOptions();
  yield* importSystemSpells();

  const dm = yield* anAccount("Fen");
  const as = withActor(dm);
  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));

  yield* as(
    notes.create(campaign.id, {
      title: "The marsh road",
      body: "Half the salt road is marsh, and the reeds are taller than a horse.",
      kind: "note",
      visibility: "shared",
    }),
  );

  return {
    dm,
    campaign,
    player: yield* aPlayerAt(campaign.id, "Ilse"),
    otherPlayer: yield* aPlayerAt(campaign.id, "Wren"),
  };
}).pipe(Effect.orDie);

let fixture: Effect.Success<typeof makeFixture>;

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
}, 60_000);

const DESCRIBED =
  "A wood elf who grew up in a river town, apprenticed to a herbalist. Quiet, " +
  "watches everything, terrible liar.";

/** The tool call a well-behaved model makes, with everything filled in. */
const aDraft = (over: Record<string, unknown> = {}) =>
  toolCallChunks("proposeCharacter", {
    name: "Sorrel Ash",
    // All three are closed vocabularies — the campaign's own rows since slice 2
    // — which is what lets the server look a hit die up. Anything more specific
    // than a race goes in `subclass`, which is still prose.
    race: "Elf",
    // `subrace` is optional in the product, but OpenAI-compatible strict mode
    // publishes it as required with a null arm, so the scripted provider must
    // say absence out loud.
    subrace: null,
    className: "Druid",
    subclass: "Circle of the Land (Marsh)",
    // A third closed vocabulary since the background became an entity. The SRD
    // starter bundle carries one background, and 2014 backgrounds do not seed
    // ability scores, so the numbers below are the class and race alone.
    background: "Acolyte",
    abilityOrder: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
    skills: ["Nature", "Perception", "Medicine", "Survival"],
    backstory: "She left Ashfen with the herbal under her coat.",
    bond: "The herbal, half in a hand that is not hers.",
    ideal: "Things grow back. Give them the room.",
    flaw: "Will not go underground without an argument first.",
    kit: ["Leather armour", "Scimitar", "Herbalism kit"],
    rationale: [
      "Wisdom is highest because druid casting keys off it, and you described someone who watches.",
      "Charisma sits low because you said terrible liar.",
    ],
    ...over,
  });

interface Asked {
  readonly events: ReadonlyArray<HobEvent>;
  readonly requests: ReadonlyArray<ChatRequest>;
}

/** Ask as somebody, with a scripted model behind it. */
const ask = (
  actor: Actor,
  options: {
    readonly text?: string;
    readonly threadId?: AssistantThreadId;
    readonly rounds?: ReadonlyArray<unknown>;
    /** What the create screen's composer sends; absent is the panel. */
    readonly intent?: "character";
  } = {},
): Promise<Asked> => {
  const model = scriptedModel({
    model: "scripted-local",
    maxTokens: MAX_TOKENS,
    rounds: (options.rounds as never) ?? [aDraft(), textChunks("Here she is.")],
  });

  return runtime.runPromise(
    Effect.gen(function* () {
      const hob = yield* Hob;
      const stream = yield* hob.ask(fixture.campaign.id, {
        text: options.text ?? DESCRIBED,
        ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
        ...(options.intent === undefined ? {} : { intent: options.intent }),
      });
      const events = yield* Stream.runCollect(stream);
      return { events: Array.from(events), requests: model.requests() };
    }).pipe(
      withActor(actor),
      Effect.provide(Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(model.layer))),
    ),
  );
};

const begunIn = (events: ReadonlyArray<HobEvent>) => {
  const began = events.find((event) => event.event === "began");
  if (began?.event !== "began") throw new Error("no began event");
  return began.data;
};

const proposedIn = (events: ReadonlyArray<HobEvent>) => {
  const proposed = events.find((event) => event.event === "proposal");
  return proposed?.event === "proposal" ? proposed.data : undefined;
};

/** What Hob wrote, in the pieces the panel drew. */
const texts = (events: ReadonlyArray<HobEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event.event === "delta" ? [event.data.text] : []));

/** The one sentence a `failed` event carries, for the tests that read it. */
const said = (events: ReadonlyArray<HobEvent>): string => {
  const failed = events.find((event) => event.event === "failed");
  return failed?.event === "failed" ? failed.data.message : "";
};

/**
 * Accepts the way the handler does: the reach comes off the *thread's own
 * shape* (`HobThreads.reachOf`), never off who is asking. Deriving it from the
 * actor is exactly the assumption `intent` retired — a creator holds threads in
 * both sets now, and their drafting thread is their own.
 */
const accept = (actor: Actor, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const threads = yield* HobThreads;
      const proposals = yield* Proposals;
      const reach = yield* threads.reachOf(fixture.campaign.id, threadId);
      return yield* proposals.accept(reach, fixture.campaign.id, threadId, turnId);
    }).pipe(withActor(actor), Effect.result),
  );

/** How many character rows exist at all; accepting a draft is the only mover here. */
const characterCount = () =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql<{
          readonly count: string;
        }>`select count(*)::text as count from character`,
    ).pipe(
      Effect.map((rows) => Number(rows[0]?.count ?? "0")),
      Effect.orDie,
    ),
  );

const activeSeatCount = (characterId: string) =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql<{ readonly count: string }>`
          select count(*)::text as count from campaign_character
          where character_id = ${characterId} and left_at is null
        `,
    ).pipe(
      Effect.map((rows) => Number(rows[0]?.count ?? "0")),
      Effect.orDie,
    ),
  );

const spellIdNamed = (name: string): Promise<SpellId> =>
  runtime.runPromise(
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly id: SpellId }>`
          select id from spell where name = ${name}
        `;
        const id = rows[0]?.id;
        if (id === undefined) throw new Error(`missing spell ${name}`);
        return id;
      }),
    ).pipe(Effect.orDie),
  );

const shownTo = (requests: ReadonlyArray<ChatRequest>): string => JSON.stringify(requests);

describe("what the tool takes, and what the server works out", () => {
  it("ranks six words into six cells, and every modifier agrees with its score", async () => {
    const { events } = await ask(fixture.player);
    const proposed = proposedIn(events);

    expect(proposed?.proposal.target).toBe("character");
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");
    const sheet = proposed.proposal.sheet;

    // The standard array, down the ranking the model gave: WIS 15, CON 14,
    // DEX 13, INT 12, CHA 10, STR 8, then the elf's +2 DEX. Drawn in the
    // canonical order, because the ranking decides the numbers and not where a
    // cell sits on the sheet.
    expect(sheet.abilities.map((ability) => `${ability.label} ${ability.score}`)).toEqual([
      "STR 8",
      "DEX 15",
      "CON 14",
      "INT 12",
      "WIS 15",
      "CHA 10",
    ]);
    // Both are stored strings, so the one thing the document cannot survive is
    // the two disagreeing. Checked cell by cell rather than spot-checked.
    for (const ability of sheet.abilities) {
      const expected = Math.floor((Number(ability.score) - 10) / 2);
      expect(ability.modifier).toBe(expected < 0 ? String(expected) : `+${String(expected)}`);
    }
  }, 60_000);

  it("repairs a ranking that is short, or names one ability twice", async () => {
    // A tool call that is *nearly* right is the common case on a small model,
    // and a `NotFound` for a duplicated "DEX" would cost a round to say
    // something the server can simply resolve.
    const { events } = await ask(fixture.player, {
      rounds: [aDraft({ abilityOrder: ["CHA", "CHA", "DEX"] }), textChunks("A talker, then.")],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    const scores = Object.fromEntries(
      proposed.proposal.sheet.abilities.map((ability) => [ability.label, ability.score]),
    );
    // CHA takes 15 once, DEX takes 14 plus the elf's +2, and the four unnamed
    // take what is left in the canonical order: STR 13, CON 12, INT 10, WIS 8.
    expect(scores).toEqual({
      CHA: "15",
      DEX: "16",
      STR: "13",
      CON: "12",
      INT: "10",
      WIS: "8",
    });
  }, 60_000);

  it("takes the prose optionals as prose, so a subclass really called None survives", async () => {
    // The sentinel that rescues an unset *enum* would eat this. `optionalText`
    // is why `proposeCharacter`'s prose optionals do not go through `optional`.
    //
    // **This used to be about the background**, which was prose until it became
    // an entity. It is not one any more — the parameter is required and is the
    // campaign's own vocabulary, so it goes through neither `optional` nor
    // `optionalText` and the sentinel cannot reach it at all. `subclass` is the
    // nearest prose optional and carries the same hazard.
    const { events } = await ask(fixture.player, {
      rounds: [aDraft({ subclass: "None", flaw: "" }), textChunks("As you like.")],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    expect(proposed.proposal.sheet.identity?.subclass).toBe("None");
    // And a genuinely blank one is not written at all, so the sheet draws the
    // section's invitation rather than an empty line.
    expect(proposed.proposal.sheet.story?.flaw).toBeUndefined();
  }, 60_000);

  it("offers the three vocabularies to the model, and no free text beside them", async () => {
    // `AbilityKey`'s argument, applied to the three labels that carry a rule:
    // the published JSON schema becomes a fixed list, which an endpoint that
    // compiles it into a grammar can hold the model to. Before this they were
    // strings of up to sixty characters, and a model that wrote "Circle of the
    // Moon Druid" produced a class nothing could look a hit die up against.
    const { requests } = await ask(fixture.player);
    const tools = shownTo(requests.slice(0, 1));

    expect(tools).toContain("Barbarian");
    expect(tools).toContain("Dragonborn");
    expect(tools).toContain("Acolyte");
    // Not in the SRD 2014 starter bundle — the cost of picking one source,
    // stated where it would otherwise be found by a model.
    expect(tools).not.toContain("Aasimar");
    // The description names all three lists as well, so the vocabulary is in
    // the prompt and not only in the grammar.
    expect(tools).toContain("spelled exactly like that");
  }, 60_000);

  it("resolves starting spells through the same picker rules and keeps their ids", async () => {
    const produceFlame = await spellIdNamed("Produce Flame");
    const cureWounds = await spellIdNamed("Cure Wounds");
    const { events } = await ask(fixture.player, {
      rounds: [
        aDraft({
          cantrips: [produceFlame],
          spells: [cureWounds],
          preparedSpells: [cureWounds],
        }),
        textChunks("She has the marsh's little fire and a healer's hands."),
      ],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    const known = proposed.proposal.sheet.spellcasting?.known ?? [];
    expect(known.map((spell) => [spell.name, spell.level, spell.spellId, spell.prepared])).toEqual([
      ["Produce Flame", 0, produceFlame, undefined],
      ["Cure Wounds", 1, cureWounds, true],
    ]);
    expect(proposed.proposal.sheet.actions?.map((action) => action.spellId)).toContain(
      produceFlame,
    );
    expect(proposed.proposal.sheet.actions?.map((action) => action.spellId)).toContain(cureWounds);

    const began = begunIn(events);
    const accepted = await accept(fixture.player, began.threadId, began.turnId);
    expect(accepted._tag).toBe("Success");
    if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
      throw new Error("character was not accepted");
    }
    expect(
      accepted.success.character.sheet.spellcasting?.known?.map((spell) => [
        spell.name,
        spell.spellId,
      ]),
    ).toEqual([
      ["Produce Flame", produceFlame],
      ["Cure Wounds", cureWounds],
    ]);
  }, 60_000);

  it("refuses invented spell ids where Hob can recover, instead of saving a fake spell", async () => {
    const { events, requests } = await ask(fixture.player, {
      rounds: [
        aDraft({ cantrips: ["00000000-0000-0000-0000-000000000000" as SpellId] }),
        textChunks("No fake spell."),
      ],
    });

    expect(shownTo(requests.slice(1))).toContain("listStartingSpells");
    expect(proposedIn(events)).toBeUndefined();
  }, 60_000);

  it("seeds hit points, armour class and level from the class and race", async () => {
    // The captain's decision of 2026-08-26, on the drafted path. `Ruleset.seedFor`
    // is the one implementation and the manual form calls the same one, so a
    // drafted druid and a hand-filled one start on the same number.
    const { events } = await ask(fixture.player);
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    // d8, CON 14 at rank two so `+2`, and the elf's DEX bonus raises the
    // third-ranked 13 to 15 (`+2`).
    expect(proposed.proposal.hpMax).toBe(10);
    expect(proposed.proposal.ac).toBe(12);
    expect(proposed.proposal.level).toBe(1);
  }, 60_000);

  it("reads a different die and a different armour rule for a different class", async () => {
    // **Barbarian is the awkward one and is the reason `unarmouredAc` is a list
    // rather than a boolean**: Unarmoured Defense is `10 + DEX + CON`, so a
    // barbarian with the same ranking seeds a genuinely different armour class
    // from the druid above rather than the same 12. Dwarf's constitution bonus
    // raises the second-ranked 14 to 16, and no subrace is selected here.
    const { events } = await ask(fixture.player, {
      rounds: [aDraft({ className: "Barbarian", race: "Dwarf" }), textChunks("A dwarf, then.")],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    expect(proposed.proposal.hpMax).toBe(15);
    expect(proposed.proposal.ac).toBe(14);
  }, 60_000);

  it("carries the rationale, which is the only place the reasons live", async () => {
    const { events } = await ask(fixture.player);
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    expect(proposed.proposal.rationale).toHaveLength(2);
    expect(proposed.proposal.rationale[0]).toContain("Wisdom is highest");
  }, 60_000);
});

describe("a draft is not a character", () => {
  it("changes nothing at the table until the player keeps it", async () => {
    const before = await characterCount();

    const { events } = await ask(fixture.player);
    expect(proposedIn(events)?.proposal.target).toBe("character");

    // The whole safety property, measured rather than argued.
    expect(await characterCount()).toBe(before);
  }, 60_000);

  it("keeps the offer on the turn, so a reload still shows the card", async () => {
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);

    const turns = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) =>
        threads.turns("own", fixture.campaign.id, threadId),
      ).pipe(withActor(fixture.player), Effect.orDie),
    );
    const answer = turns.find((turn) => turn.id === turnId);

    expect(answer?.proposal).toMatchObject({ target: "character", name: "Sorrel Ash" });
    expect(answer?.acceptedAt).toBeNull();
  }, 60_000);
});

describe("the accept makes a character, and it is the player's own", () => {
  it("creates a row owned by the actor, drafted by Hob, and private by default", async () => {
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);

    const accepted = await accept(fixture.player, threadId, turnId);
    expect(accepted._tag).toBe("Success");
    if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
      throw new Error("not a character");
    }
    const character = accepted.success.character;

    expect(character.name).toBe("Sorrel Ash");
    // Whose it is comes from the credential and from nowhere on the wire — the
    // `Invites.redeem` shape, a third time.
    expect(character.accountId).toBe(fixture.player.accountId);
    expect(character.origin).toBe("assistant");
    expect(character.assistantTurnId).toBe(turnId);
    // Every default the payload cannot say. Disclosure moved to the seat with
    // the split, and accept creates no seat: the shared character carries no
    // `visibility`, and the campaign's word on who may see it does not exist
    // until the owner explicitly joins.
    expect(await activeSeatCount(character.id)).toBe(0);
    const seats = await runtime.runPromise(
      Effect.flatMap(Party, (party) => party.list(fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(seats.find((row) => row.character?.id === character.id)).toBeUndefined();
    expect(character.hpCurrent).toBeNull();
    // **The three seeded numbers**, copied off the proposal rather than worked
    // out here — a druid's d8, constitution at rank two (`CON 14`, `+2`), the
    // unarmoured base with the elf-raised DEX (`DEX 15`, `+2`), and the level
    // the captain's decision fixes at 1. Nothing recomputes any of them
    // afterwards; the sheet's own dialogs are how they move.
    expect(character.level).toBe(1);
    expect(character.hpMax).toBe(10);
    expect(character.ac).toBe(12);
    // And the sheet is the one the card drew, not a second assembly.
    expect(character.sheet.abilities).toHaveLength(6);
    expect(character.sheet.skills?.map((skill) => skill.name)).toEqual([
      "Nature",
      "Perception",
      "Medicine",
      "Survival",
    ]);
    // All three sources' grants in one list now — the class's armour, weapons
    // and tools, the race's trait-attached skill and languages, then the
    // background's — with the two instruction shapes filtered out: a
    // `"Saving Throw: …"` line becomes the mark on the ability cell, and a
    // `"Choose …"` line is a pick the player makes later. `sheetGrantsFor` is
    // the one implementation, shared with the manual form.
    expect(character.sheet.proficiencies).toEqual([
      "Light Armor",
      "Medium Armor",
      "Shields",
      "Clubs",
      "Daggers",
      "Javelins",
      "Maces",
      "Quarterstaffs",
      "Sickles",
      "Spears",
      "Darts",
      "Slings",
      "Scimitars",
      "Herbalism Kit",
      "Skill: Perception",
      "Common",
      "Elvish",
      "Insight",
      "Religion",
      "Choose 2 languages",
    ]);
    expect(character.sheet.proficiencies).not.toContain("Saving Throw: INT");
    // The class's saving throws land as marks on the cells, with the save
    // number read from the level-1 proficiency bonus the progression corpus
    // supplies — WIS ranked first is 15 raised to nothing (Elf moves DEX), so
    // `+2` modifier and `+4` save.
    const wis = character.sheet.abilities.find((cell) => cell.label === "WIS");
    expect(wis?.proficient).toBe(true);
    expect(wis?.save).toBe(signed(Number(wis?.modifier) + 2));
    expect(
      character.sheet.abilities.find((cell) => cell.label === "STR")?.proficient,
    ).toBeUndefined();
    // Level-1 class features and the race's traits are on the sheet, off the
    // progression and trait corpora — not just the background's feature.
    const traitNames = character.sheet.traits.map((trait) => trait.name);
    expect(traitNames).toContain("Druidic");
    expect(traitNames).toContain("Spellcasting: Druid");
    expect(traitNames).toContain("Darkvision");
    expect(traitNames).toContain("Fey Ancestry");
    // Granted features only: a choice under a parent feature stays a choice.
    expect(traitNames.some((name) => name.startsWith("Fighting Style:"))).toBe(false);
    // The identity keys the corpora answer: speed, proficiency bonus, hit dice.
    expect(character.sheet.identity?.speed).toBe("30 ft.");
    expect(character.sheet.identity?.proficiency).toBe("+2");
    expect(character.sheet.identity?.hitDice).toBe("1/1 d8");
    // The class's starting kit first — side (a) of every choice, because the
    // tool takes no picks, with a category the source leaves open kept as a
    // line — then the background's, then the model's own names. **The model's
    // names are resolved against the bundle**: `"Scimitar"` and
    // `"Herbalism kit"` each name exactly one bundled row and land linked, in
    // the row's own spelling and with its weight; `"Leather armour"` — the
    // model's spelling, which no bundled row is called — stays as typed.
    expect(character.sheet.inventory?.map((item) => item.name)).toEqual([
      "Leather Armor",
      "Explorer's Pack",
      "Shield",
      "Scimitar",
      "Any druidic focus",
      "Clothes, common",
      "Pouch",
      "Any holy symbol",
      "Leather armour",
      "Scimitar",
      "Herbalism Kit",
    ]);
    expect(character.sheet.inventory?.[3]?.equipmentId).toBeTypeOf("string");
    // The background's counted lines are rows now, the same link the class kit writes.
    expect(character.sheet.inventory?.[5]?.equipmentId).toBeTypeOf("string");
    expect(character.sheet.inventory?.[6]?.equipmentId).toBeTypeOf("string");
    expect(character.sheet.inventory?.[7]).toEqual({ name: "Any holy symbol", note: "Your pick" });
    expect(character.sheet.inventory?.[8]).toEqual({ name: "Leather armour" });
    expect(character.sheet.inventory?.[9]?.equipmentId).toBe(
      character.sheet.inventory?.[3]?.equipmentId,
    );
    expect(character.sheet.inventory?.[9]?.weight).toBe("3 lb");
    expect(character.sheet.inventory?.[10]).toMatchObject({
      name: "Herbalism Kit",
      weight: "3 lb",
    });
    expect(character.sheet.inventory?.[10]?.equipmentId).toBeTypeOf("string");
    expect(character.sheet.currency).toEqual({ gp: 15 });
    // **The Actions and Spellcasting sections are the corpus's now**, through
    // the same `sheetGrantsFor` the form calls: the scimitar swung with the
    // elf-raised DEX (finesse), the druid's two first-level slots, the hit
    // die, and the casting numbers off the imported ability — WIS ranked
    // first is 15, `+2`, so save 12 and attack `+4` at proficiency `+2`.
    expect(character.sheet.actions).toEqual([
      expect.objectContaining({
        id: "atk:scimitar",
        name: "Scimitar",
        cost: "action",
        hit: "+4",
        dice: "1d6+2",
        damageType: "Slashing",
        source: "weapon",
        derived: true,
      }),
    ]);
    expect(character.sheet.resources).toEqual([
      { id: "slot:1", name: "1st-level slots", used: 0, max: 2, recharge: "long", derived: true },
      {
        id: "hit-dice",
        name: "Hit dice",
        used: 0,
        max: 1,
        recharge: "long",
        unit: "d8",
        derived: true,
      },
    ]);
    expect(character.sheet.spellcasting).toEqual({
      ability: "WIS",
      save: "12",
      attack: "+4",
      cantripsKnown: 2,
    });
    expect(traitNames).toContain("Shelter of the Faithful");
    expect(character.sheet.identity?.subclass).toBe("Circle of the Land (Marsh)");
    expect(character.sheet.notes).toContain("Ashfen");
    // `descriptor` is a generated column over the three, so the drafted race
    // and class reach the line under the name with nothing computing it twice.
    expect(character.descriptor).toBe("Level 1 Elf Druid");
  }, 60_000);

  it("leaves a carried name as text when two bundled rows answer to it", async () => {
    // A second bundled row called *Herbalism Kit*, under a source key of its
    // own — the shape a future corpus could take, and the one case the
    // resolver must not guess at. Removed again below so the fixture's other
    // drafts still resolve the name to the SRD's one row.
    const inserted = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ readonly id: string }>`
          insert into equipment (
            campaign_id, account_id, origin, source_corpus, source_family, source_key,
            name, category_index, category_name, cost_quantity, cost_unit, cost_gp,
            visibility, body
          )
          values (
            null, null, 'system', 'taverns-test', 'equipment', 'herbalism-kit-twin',
            'Herbalism Kit', 'tools', 'Tools', 5, 'gp', 5, 'shared',
            '{"equipmentCategory":{"index":"tools","name":"Tools"},"cost":{"quantity":5,"unit":"gp"}}'::jsonb
          )
          returning id::text
        `,
      ).pipe(Effect.orDie),
    );
    try {
      const { events } = await ask(fixture.player);
      const { threadId, turnId } = begunIn(events);
      const accepted = await accept(fixture.player, threadId, turnId);
      if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
        throw new Error("not a character");
      }
      const carried = accepted.success.character.sheet.inventory ?? [];
      // The scimitar still resolves — one bundled row — and the kit's name
      // with two candidates is written exactly as the model spelled it, with
      // no link, because a guess written into a link is worse than a name.
      expect(carried.at(-2)).toMatchObject({ name: "Scimitar", weight: "3 lb" });
      expect(carried.at(-1)).toEqual({ name: "Herbalism kit" });
    } finally {
      await runtime.runPromise(
        Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`delete from equipment where id = ${inserted[0]!.id}`,
        ).pipe(Effect.orDie),
      );
    }
  }, 60_000);

  it("is an ordinary unseated character afterwards: the player reads it, the table does not", async () => {
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);
    const accepted = await accept(fixture.player, threadId, turnId);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
      throw new Error("not a character");
    }
    const id = accepted.success.character.id;

    const mine = await runtime.runPromise(
      Effect.flatMap(Characters, (repo) => repo.mine).pipe(withActor(fixture.player), Effect.orDie),
    );
    expect(mine.map((owned) => owned.character.id)).toContain(id);

    // The campaign-side read is the party now: there is no campaign row until
    // the owner explicitly joins, so the creator sees nothing yet.
    const dmSees = await runtime.runPromise(
      Effect.flatMap(Party, (party) => party.list(fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(dmSees.map((row) => row.character?.id)).not.toContain(id);

    // The other player at the same shared table does not own it either.
    const otherSees = await runtime.runPromise(
      Effect.flatMap(Party, (party) => party.list(fixture.campaign.id)).pipe(
        withActor(fixture.otherPlayer),
        Effect.orDie,
      ),
    );
    expect(otherSees.map((row) => row.character?.id)).not.toContain(id);
  }, 60_000);

  it("is one row however many times the button is pressed", async () => {
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);

    const first = await accept(fixture.player, threadId, turnId);
    expect(first._tag).toBe("Success");
    const again = await accept(fixture.player, threadId, turnId);
    expect(again._tag).toBe("Failure");
    expect(again._tag === "Failure" && again.failure).toBeInstanceOf(Conflict);
  }, 60_000);

  it("refuses another player's draft, and the DM's own accept never reaches one", async () => {
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);

    // Somebody else's conversation is not theirs to accept from — the
    // `account_id = me` clause, which never matches another account.
    const stolen = await accept(fixture.otherPlayer, threadId, turnId);
    expect(stolen._tag).toBe("Failure");
    expect(stolen._tag === "Failure" && stolen.failure).toBeInstanceOf(NotFound);

    // And the DM cannot either, which is what stops a `character` proposal ever
    // being materialised into the DM's own ownership: their reach adds
    // `account_id is null`, and this thread has one. Structural, not a role
    // check inside `materialise`.
    const byDm = await accept(fixture.dm, threadId, turnId);
    expect(byDm._tag).toBe("Failure");
    expect(byDm._tag === "Failure" && byDm.failure).toBeInstanceOf(NotFound);

    // And it is still there for its owner afterwards.
    const mine = await accept(fixture.player, threadId, turnId);
    expect(mine._tag).toBe("Success");
  }, 60_000);

  it("takes no content, so the prose it records is the server's own", async () => {
    // The property `repo/Proposals.ts` is built around: *if accept took the
    // content instead, any client could post its own prose and have it recorded
    // as the assistant's.* There is no payload on the endpoint and no argument
    // on the method — the compiler is the assertion, and this is the runtime
    // half of it: the row's content is byte-for-byte the proposal the server
    // stored, and the only thing a caller supplied is three ids.
    const { events } = await ask(fixture.player);
    const { threadId, turnId } = begunIn(events);
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    const accepted = await accept(fixture.player, threadId, turnId);
    if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
      throw new Error("not a character");
    }

    expect(accepted.success.character.name).toBe(proposed.proposal.name);
    expect(accepted.success.character.sheet).toEqual(proposed.proposal.sheet);
  }, 60_000);
});

describe("the creator drafts too, and `intent` is what says so", () => {
  /**
   * The regression this block holds shut. The continuity decision made a
   * campaign's creator a character author like anybody else, and the create
   * screen's composer opened to them — but `Hob.ask` still read the
   * `CampaignCreatorActor` proof as "the panel is asking" and answered the
   * creator with the nine DM tools, which have no `proposeCharacter`. Measured
   * in a real browser before the fix: the creator asked for a draft, the model
   * fell back to prose (or a `proposeNote`), the screen said *"No sheet came
   * back this time"* on every attempt, and the character description was filed
   * into the campaign's shared thread for the panel to resume.
   *
   * `HobAsk.intent` is the fix: the drafting surface says what it is, and the
   * proof only decides the panel's side.
   */
  it("offers the creator the drafting toolkit when the composer says so", async () => {
    const { events, requests } = await ask(fixture.dm, { intent: "character" });

    const names = (requests[0]?.tools ?? []).map(
      (tool) => (tool.function as { name?: string } | undefined)?.name ?? "",
    );
    expect(names).toContain("proposeCharacter");
    expect(names).not.toContain("proposeNote");

    const proposed = proposedIn(events);
    expect(proposed?.proposal.target).toBe("character");
  }, 60_000);

  it("keeps the panel exactly as it was: no intent, campaign-panel tools, no drafts", async () => {
    const { requests } = await ask(fixture.dm, {
      rounds: [textChunks("The marsh road is half reeds.")],
    });

    const names = (requests[0]?.tools ?? []).map(
      (tool) => (tool.function as { name?: string } | undefined)?.name ?? "",
    );
    expect(names).toContain("proposeNote");
    expect(names).not.toContain("proposeCharacter");
  }, 60_000);

  it("files the creator's draft in a thread of their own, off the panel's list", async () => {
    const { events } = await ask(fixture.dm, { intent: "character" });
    const { threadId } = begunIn(events);

    const listed = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.list("dm", fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    // The campaign's shared conversation never sees the character description —
    // before the fix it was the thread the panel resumed next session.
    expect(listed.map((thread) => thread.id)).not.toContain(threadId);

    const own = await runtime.runPromise(
      Effect.flatMap(HobThreads, (threads) => threads.list("own", fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(own.map((thread) => thread.id)).toContain(threadId);
  }, 60_000);

  it("lets the creator keep their own draft, through the thread-shaped reach", async () => {
    const { events } = await ask(fixture.dm, { intent: "character" });
    const { threadId, turnId } = begunIn(events);

    // `reachOf` answers "own" for the creator's drafting thread; a reach
    // derived from the proof would say "dm" and 404 the accept.
    const accepted = await accept(fixture.dm, threadId, turnId);
    expect(accepted._tag).toBe("Success");
    if (accepted._tag !== "Success" || accepted.success.accepted !== "character") {
      throw new Error("not a character");
    }
    const created = accepted.success.character;
    expect(created.accountId).toBe(fixture.dm.accountId);
    expect(created.origin).toBe("assistant");

    // Unseated like any accepted draft; the campaign was Hob/vocabulary
    // context only.
    expect(await activeSeatCount(created.id)).toBe(0);
  }, 60_000);

  it("still refuses a stranger the drafting surface", async () => {
    // `intent` widens nothing: an account with no reach into the campaign is
    // the same 404 it always was, before a byte of stream exists.
    const stranger = await runtime.runPromise(
      Effect.gen(function* () {
        const account = yield* anAccount("Nobody");
        const hob = yield* Hob;
        return yield* Effect.result(
          hob
            .ask(fixture.campaign.id, { text: DESCRIBED, intent: "character" })
            .pipe(withActor(account)),
        );
      }).pipe(
        Effect.provide(
          Hob.layer({ model: "scripted-local" }).pipe(
            Layer.provide(
              scriptedModel({ model: "scripted-local", maxTokens: MAX_TOKENS, rounds: [] }).layer,
            ),
          ),
        ),
        Effect.orDie,
      ),
    );
    expect(stranger._tag).toBe("Failure");
    expect(stranger._tag === "Failure" && stranger.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("the redraft loop", () => {
  it("shows the model what it already offered, so a change keeps the rest", async () => {
    // **The defect §4.3 of the plan names.** `promptFor` carried `turn.text`
    // alone, so *"make her a ranger instead"* reached a model that could see a
    // sentence about a character and nothing about which one — and it drafted a
    // fresh person from the original paragraph. Worse, a turn where Hob offered
    // a card and said nothing vanished from the prompt entirely, which is
    // exactly what `proposeCharacter`'s own instruction makes likely.
    const first = await ask(fixture.player);
    const { threadId } = begunIn(first.events);

    const second = await ask(fixture.player, {
      threadId,
      text: "Make her a ranger instead.",
      rounds: [aDraft({ className: "Ranger", subclass: "Hunter" }), textChunks("A ranger, then.")],
    });

    const opening = shownTo(second.requests.slice(0, 1));
    // The draft, read back as the ranking the tool takes rather than as six
    // cells the tool cannot accept.
    expect(opening).toContain("Sorrel Ash");
    expect(opening).toContain("Elf Druid");
    expect(opening).toContain("DEX > WIS > CON");
    expect(opening).toContain("Nature, Perception, Medicine, Survival");
    expect(opening).toContain("Circle of the Land (Marsh)");
    expect(opening).toContain("not yet accepted");
    // And the question that follows it.
    expect(opening).toContain("Make her a ranger instead.");
  }, 60_000);

  it("says whether the player already kept it, which is a different fact", async () => {
    const first = await ask(fixture.player);
    const { threadId, turnId } = begunIn(first.events);
    const accepted = await accept(fixture.player, threadId, turnId);
    expect(accepted._tag).toBe("Success");

    const second = await ask(fixture.player, {
      threadId,
      text: "What did you give her for skills?",
      rounds: [textChunks("Nature, Perception, Medicine and Survival.")],
    });

    expect(shownTo(second.requests.slice(0, 1))).toContain("accepted by the DM");
  }, 60_000);
});

describe("when the model will not draft", () => {
  it("keeps what it said, offers nothing, and says that nothing was drafted", async () => {
    // **Measured, not hypothetical**: with all tools offered, the captain's own
    // configured 4B chose the propose tool one time in five. The flow must not
    // dead-end on it, so the honest server behaviour is a finished answer with
    // no card — and the screen is one press from the form.
    //
    // It used to end in a bare `done`, which is the captain's own report: a
    // plausible sentence, no sheet, and nothing saying Hob tried to draft one.
    // The prose still stands and is still what the player reads; the report is
    // one sentence after it naming the way on.
    const { events } = await ask(fixture.player, {
      rounds: [textChunks("Tell me more about where she is from.")],
    });

    expect(events.map((event) => event.event)).toEqual(["began", "delta", "failed"]);
    expect(texts(events)).toEqual(["Tell me more about where she is from."]);
    expect(said(events)).toContain("drafted no sheet");
    expect(said(events)).toContain("fill the sheet in yourself");
    expect(proposedIn(events)).toBeUndefined();
    // Nothing to accept is a `NotFound` about the proposal, not about the turn.
    const { threadId, turnId } = begunIn(events);
    const nothing = await accept(fixture.player, threadId, turnId);
    expect(nothing._tag).toBe("Failure");
    expect(nothing._tag === "Failure" && nothing.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});
