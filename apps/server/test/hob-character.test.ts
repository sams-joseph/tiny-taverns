import {
  Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  Conflict,
  CurrentActor,
  type HobEvent,
  NotFound,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Hob } from "../src/assistant/Hob.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { Encounters } from "../src/repo/Encounters.js";
import { HobThreads } from "../src/repo/HobThreads.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { Proposals } from "../src/repo/Proposals.js";
import { Recap } from "../src/repo/Recap.js";
import { Search } from "../src/repo/Search.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt } from "./support/actors.js";
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
  Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  Encounters.layer,
  HobThreads.layer,
  Invites.layer,
  Notes.layer,
  Proposals.layer.pipe(
    Layer.provide([
      Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
      Campaigns.layer,
      Characters.layer.pipe(Layer.provide(LiveEvents.layer)),
      EncounterCreatures.layer,
      Encounters.layer,
      Notes.layer,
    ]),
  ),
  Recap.layer,
  Search.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
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
  const campaigns = yield* Campaigns;
  const notes = yield* Notes;

  const dm = yield* anAccount("Fen");
  const as = withActor(dm);
  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));

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
    species: "Wood elf",
    className: "Druid",
    subclass: "Circle of the Land (Marsh)",
    background: "Herbalist's apprentice",
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

const accept = (actor: Actor, threadId: AssistantThreadId, turnId: AssistantTurnId) =>
  runtime.runPromise(
    Effect.flatMap(Proposals, (proposals) =>
      proposals.accept(
        actor.accountId === fixture.dm.accountId ? "dm" : "own",
        fixture.campaign.id,
        threadId,
        turnId,
      ),
    ).pipe(withActor(actor), Effect.result),
  );

/** How many characters are at the table, whatever their visibility. */
const characterCount = () =>
  runtime.runPromise(
    Effect.flatMap(
      SqlClient.SqlClient,
      (sql) =>
        sql<{
          readonly count: string;
        }>`select count(*)::text as count from character where campaign_id = ${fixture.campaign.id}`,
    ).pipe(
      Effect.map((rows) => Number(rows[0]?.count ?? "0")),
      Effect.orDie,
    ),
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
    // DEX 13, INT 12, CHA 10, STR 8. Drawn in the canonical order, because the
    // ranking decides the numbers and not where a cell sits on the sheet.
    expect(sheet.abilities.map((ability) => `${ability.label} ${ability.score}`)).toEqual([
      "STR 8",
      "DEX 13",
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
    // CHA takes 15 once, DEX 14, and the four unnamed take what is left in the
    // canonical order: STR 13, CON 12, INT 10, WIS 8.
    expect(scores).toEqual({
      CHA: "15",
      DEX: "14",
      STR: "13",
      CON: "12",
      INT: "10",
      WIS: "8",
    });
  }, 60_000);

  it("takes the prose optionals as prose, so a background really called None survives", async () => {
    // The sentinel that rescues an unset *enum* would eat this. `optionalText`
    // is why `proposeCharacter`'s prose optionals do not go through `optional`.
    const { events } = await ask(fixture.player, {
      rounds: [aDraft({ background: "None", flaw: "" }), textChunks("As you like.")],
    });
    const proposed = proposedIn(events);
    if (proposed?.proposal.target !== "character") throw new Error("no character proposal");

    expect(proposed.proposal.sheet.identity?.background).toBe("None");
    // And a genuinely blank one is not written at all, so the sheet draws the
    // section's invitation rather than an empty line.
    expect(proposed.proposal.sheet.story?.flaw).toBeUndefined();
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
    // Every default the payload cannot say.
    expect(character.visibility).toBe("dm");
    expect(character.hpCurrent).toBeNull();
    expect(character.level).toBeNull();
    // And the sheet is the one the card drew, not a second assembly.
    expect(character.sheet.abilities).toHaveLength(6);
    expect(character.sheet.skills?.map((skill) => skill.name)).toEqual([
      "Nature",
      "Perception",
      "Medicine",
      "Survival",
    ]);
    expect(character.sheet.inventory?.map((item) => item.name)).toEqual([
      "Leather armour",
      "Scimitar",
      "Herbalism kit",
    ]);
    expect(character.sheet.identity?.subclass).toBe("Circle of the Land (Marsh)");
    expect(character.sheet.notes).toContain("Ashfen");
    // `descriptor` is a generated column over the three, so the drafted species
    // and class reach the line under the name with nothing computing it twice.
    expect(character.descriptor).toBe("Wood elf Druid");
  }, 60_000);

  it("is an ordinary character afterwards: the player reads it, the DM reads it, nobody else does", async () => {
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
    expect(mine.map((character) => character.id)).toContain(id);

    const dmSees = await runtime.runPromise(
      Effect.flatMap(Characters, (repo) => repo.list(fixture.campaign.id)).pipe(
        withActor(fixture.dm),
        Effect.orDie,
      ),
    );
    expect(dmSees.map((character) => character.id)).toContain(id);

    // `dm` by column default, and the other player at the same shared table is
    // not its owner — so it is not theirs to see.
    const otherSees = await runtime.runPromise(
      Effect.flatMap(Characters, (repo) => repo.list(fixture.campaign.id)).pipe(
        withActor(fixture.otherPlayer),
        Effect.orDie,
      ),
    );
    expect(otherSees.map((character) => character.id)).not.toContain(id);
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
    expect(opening).toContain("Wood elf Druid");
    expect(opening).toContain("WIS > CON > DEX");
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
  it("answers in prose and offers nothing, without failing", async () => {
    // **Measured, not hypothetical**: with all tools offered, the captain's own
    // configured 4B chose the propose tool one time in five. The flow must not
    // dead-end on it, so the honest server behaviour is a finished answer with
    // no card — and the screen is one press from the form.
    const { events } = await ask(fixture.player, {
      rounds: [textChunks("Tell me more about where she is from.")],
    });

    expect(events.map((event) => event.event)).toEqual(["began", "delta", "done"]);
    expect(proposedIn(events)).toBeUndefined();
    // Nothing to accept is a `NotFound` about the proposal, not about the turn.
    const { threadId, turnId } = begunIn(events);
    const nothing = await accept(fixture.player, threadId, turnId);
    expect(nothing._tag).toBe("Failure");
    expect(nothing._tag === "Failure" && nothing.failure).toBeInstanceOf(NotFound);
  }, 60_000);
});
