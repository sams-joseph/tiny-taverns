import { Actor, CurrentActor, NotFound } from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Characters } from "../src/repo/Characters.js";
import { Combatants } from "../src/repo/Combatants.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { Notes } from "../src/repo/Notes.js";
import { PrepItems } from "../src/repo/PrepItems.js";
import { Recap } from "../src/repo/Recap.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, aPlayerAt, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The recap: what happened on the night.
 *
 * Four claims, and they are the ones the feature rests on rather than the ones
 * that were easy to write:
 *
 * - **it draws on three sources, not one** — notes, combat and beats. A recap
 *   built from the shipped log alone reads as a hit-point transcript, and the
 *   DM's own questions ("who is the ferryman") are answered by beats and by
 *   nothing else;
 * - **it can say a fight paused at round 4 and resumed the following week**,
 *   from both ends. That is the property the carry-over work was for, and a
 *   recap that cannot say it is a recap of a different product;
 * - **it is scoped by the same predicates as everything else** — a credential
 *   minted for one table gets a 404 for another table's night, and a player
 *   sees none of the DM-only rows inside a night they *can* reach;
 * - **an empty night is an empty recap, not an error.** A session created and
 *   never played is a perfectly ordinary row.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Characters.layer,
  Combatants.layer.pipe(Layer.provide(LiveEvents.layer)),
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  Notes.layer,
  PrepItems.layer,
  Recap.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_recap")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

/** What the runtime above can provide — so the helpers below can say so. */
type Services = Layer.Success<typeof services>;

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM, two tables, and one night played properly on the first.
 *
 * Both campaigns are `shared` and everything inside the played night is
 * `shared` too, so "cannot reach" below is about credential *scope* rather than
 * about a campaign that happens to be empty — the scope hole the auth work
 * closed was invisible for exactly as long as no test minted a scoped actor.
 */
const makeFixture = Effect.gen(function* () {
  const beats = yield* Beats;
  const campaigns = yield* Campaigns;
  const characters = yield* Characters;
  const creatures = yield* Creatures;
  const encounters = yield* Encounters;
  const notes = yield* Notes;
  const prep = yield* PrepItems;
  const roster = yield* EncounterCreatures;
  const runs = yield* EncounterRuns;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  yield* as(
    characters.create(campaign.id, {
      name: "Brannoc",
      playerName: "Ilse",
      species: "Half-orc",
      className: "Paladin",
      ac: 18,
      hpMax: 52,
    }),
  );
  const goblin = yield* as(
    creatures.create(campaign.id, {
      name: "Goblin Archer",
      size: "Small",
      type: "Humanoid",
      cr: "1/4",
      ac: 15,
      hp: 7,
    }),
  );
  const encounter = yield* as(
    encounters.create(campaign.id, {
      name: "Ambush in the reeds",
      difficulty: "Medium",
      visibility: "shared",
    }),
  );
  yield* as(roster.create(campaign.id, encounter.id, { creatureId: goblin.id, count: 2 }));

  // The read-aloud the DM actually read out — attached to the encounter that
  // ran. And one that was not: prep for a night that has not happened.
  const readAloud = yield* as(
    notes.create(campaign.id, {
      title: "Read aloud at the water",
      body: "The reeds are not moving, though there is a wind.",
      kind: "read_aloud",
      attachedTo: { kind: "encounter", id: encounter.id },
      visibility: "shared",
    }),
  );
  const unattached = yield* as(
    notes.create(campaign.id, { title: "Ovid's ledger", body: "Pages 8-11 are torn out." }),
  );

  const session = yield* as(
    sessions.create(campaign.id, { number: 12, title: "The ford", visibility: "shared" }),
  );
  const answered = yield* as(
    prep.create(campaign.id, session.id, { label: "Pick a name for the ferryman", done: true }),
  );
  yield* as(prep.create(campaign.id, session.id, { label: "Decide what the crate contains" }));

  const dmOf = yield* as(asDm(dm, campaign.id));
  const run = yield* as(
    runs.start(dmOf, session.id, { encounterId: encounter.id, visibility: "shared" }),
  );
  const roll = yield* as(runs.nextTurn(dmOf, session.id, run.id, {}));
  const inTheFight = yield* as(combatantsOf(dmOf, session.id, run.id));
  // Somebody goes down, and stays in initiative — hit points reaching zero is
  // not a removal (`EncounterRunner.jsx:107`).
  const down = inTheFight.find((row) => row.kind === "npc")!;
  yield* as((yield* Combatants).damage(dmOf, session.id, run.id, down.id, { amount: down.hpMax }));

  const ferryman = yield* as(
    beats.create(campaign.id, session.id, {
      body: "The ferryman is called Cazril. He will not take coin, only a name.",
      encounterRunId: run.id,
      visibility: "shared",
    }),
  );
  const crate = yield* as(
    beats.create(campaign.id, session.id, {
      body: "They left the crate unopened and buried it under the reeds.",
      visibility: "shared",
    }),
  );
  // Fail-closed by default, so this one is the DM's alone. It is what makes the
  // player assertion below about the *predicate* rather than about an empty
  // table.
  const dmOnly = yield* as(
    beats.create(campaign.id, session.id, { body: "Hettie is lying about the tide." }),
  );

  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
  const nightElsewhere = yield* as(
    sessions.create(otherTable.id, { number: 1, visibility: "shared" }),
  );

  return {
    dm,
    /** The proof the live repositories take in place of a campaign id. */
    asDm: dmOf,
    /** A credential minted for the first table only. */
    scoped: scopedTo(dm, campaign.id),
    /** A player of the first table, who may have only its `shared` rows. */
    player: yield* aPlayerAt(campaign.id, "Pim"),
    campaign,
    encounter,
    session,
    run,
    round: roll.round,
    readAloud,
    unattached,
    answered,
    ferryman,
    crate,
    dmOnly,
    down,
    otherTable,
    nightElsewhere,
  };
}).pipe(Effect.orDie);

/** The initiative list, read the way the runner reads it. */
const combatantsOf = (
  campaignId: Parameters<(typeof Combatants)["Service"]["list"]>[0],
  sessionId: Parameters<(typeof Combatants)["Service"]["list"]>[1],
  runId: Parameters<(typeof Combatants)["Service"]["list"]>[2],
) => Effect.flatMap(Combatants, (combatants) => combatants.list(campaignId, sessionId, runId));

let fixture: Effect.Success<typeof makeFixture>;
let recap: (typeof Recap)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let sessions: (typeof Sessions)["Service"];
let beats: (typeof Beats)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  recap = await runtime.runPromise(Recap);
  runs = await runtime.runPromise(EncounterRuns);
  sessions = await runtime.runPromise(Sessions);
  beats = await runtime.runPromise(Beats);
}, 60_000);

const asActor =
  (actor: () => Actor) =>
  <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    runtime.runPromise(withActor(actor())(effect).pipe(Effect.orDie));

const as = asActor(() => fixture.dm);
const asPlayer = asActor(() => fixture.player);
const asScoped = asActor(() => fixture.scoped);

describe("a recap of a night that was played", () => {
  it("names the night it is a recap of", async () => {
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));

    expect(night.session.id).toBe(fixture.session.id);
    expect(night.session.number).toBe(12);
    expect(night.session.title).toBe("The ford");
  });

  it("draws on all three sources, so it is about the story and not only the fight", async () => {
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));

    // Beats — the DM's own words, verbatim and in the order they were jotted.
    expect(night.beats.map((beat) => beat.body)).toEqual([
      "The ferryman is called Cazril. He will not take coin, only a name.",
      "They left the crate unopened and buried it under the reeds.",
      "Hettie is lying about the tide.",
    ]);
    // Combat — one fight, with the people who were in it.
    expect(night.fights).toHaveLength(1);
    expect(night.fights[0]!.run.encounterName).toBe("Ambush in the reeds");
    expect(night.fights[0]!.combatants.map((row) => row.displayName)).toEqual(
      expect.arrayContaining(["Brannoc", "Goblin Archer"]),
    );
    // Notes — the read-aloud that hung off the encounter that ran, and only it.
    expect(night.notes.map((note) => note.id)).toEqual([fixture.readAloud.id]);
    expect(night.notes.map((note) => note.id)).not.toContain(fixture.unattached.id);
    // Prep — what got answered. The unticked line belongs to the next night.
    expect(night.prepDone.map((item) => item.label)).toEqual(["Pick a name for the ferryman"]);
  });

  it("keeps the detail rather than summarising it", async () => {
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));
    const fight = night.fights[0]!;

    // The whole row, not a rendered line: this is what makes the recap usable
    // as the assistant's memory rather than a replacement for the sources.
    expect(fight.run.round).toBe(fixture.round);
    expect(fight.run.startedAt).not.toBeNull();
    const downed = fight.combatants.find((row) => row.id === fixture.down.id)!;
    expect(downed.hpCurrent).toBe(0);
    expect(downed.hpMax).toBeGreaterThan(0);
    // At zero and still in initiative — the recap reports the state, it does
    // not decide somebody left.
    expect(fight.combatants).toHaveLength(3);
  });

  it("keeps a beat's own link to the fight it happened during", async () => {
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));
    const byId = new Map(night.beats.map((beat) => [beat.id, beat]));

    expect(byId.get(fixture.ferryman.id)!.encounterRunId).toBe(fixture.run.id);
    expect(byId.get(fixture.crate.id)!.encounterRunId).toBeNull();
  });

  it("says nothing about a fight that has no other end", async () => {
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));

    expect(night.fights[0]!.continuedFrom).toBeNull();
    expect(night.fights[0]!.continuedInto).toBeNull();
  });
});

describe("a fight that paused and was picked up the following week", () => {
  it("says so from both ends", async () => {
    const first = await as(sessions.create(fixture.campaign.id, { number: 20 }));
    const paused = await as(
      runs.start(fixture.asDm, first.id, { encounterId: fixture.encounter.id }),
    );
    await as(runs.nextTurn(fixture.asDm, first.id, paused.id, {}));
    // The night ends over the top of it: `Sessions.update` carries the live
    // fight in the same transaction that stamps `endedAt`.
    await as(
      Effect.flatMap(DateTime.now, (endedAt) =>
        sessions.update(fixture.campaign.id, first.id, { endedAt }),
      ),
    );

    const second = await as(sessions.create(fixture.campaign.id, { number: 21 }));
    const resumed = await as(runs.resume(fixture.asDm, second.id, { continuedFrom: paused.id }));

    // Looking back from the night it paused on: "paused at round N, and picked
    // up on session 21".
    const before = await as(recap.read(fixture.campaign.id, first.id));
    const pausedFight = before.fights.find((fight) => fight.run.id === paused.id)!;
    expect(pausedFight.run.endedReason).toBe("carried");
    expect(pausedFight.run.endedAt).not.toBeNull();
    expect(pausedFight.continuedInto).toEqual(
      expect.objectContaining({ runId: resumed.id, sessionId: second.id, sessionNumber: 21 }),
    );

    // Looking forward from the night it resumed on: "resumed from round N of
    // session 20". The round is the *predecessor's*, which is the round the
    // fight paused on and is not on the successor's own row.
    const after = await as(recap.read(fixture.campaign.id, second.id));
    const resumedFight = after.fights.find((fight) => fight.run.id === resumed.id)!;
    expect(resumedFight.continuedFrom).toEqual(
      expect.objectContaining({
        runId: paused.id,
        sessionId: first.id,
        sessionNumber: 20,
        round: pausedFight.run.round,
      }),
    );
    expect(resumedFight.continuedInto).toBeNull();
    // The state carried, so the recap of the second night is a recap of the
    // same fight rather than a fresh one.
    expect(resumedFight.run.round).toBe(pausedFight.run.round);
    expect(resumedFight.combatants).toHaveLength(pausedFight.combatants.length);
  });

  it("distinguishes a fight the DM finished from one the night finished around", async () => {
    const night = await as(sessions.create(fixture.campaign.id, { number: 30 }));
    const fight = await as(
      runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }),
    );
    await as(runs.end(fixture.asDm, night.id, fight.id));

    const read = await as(recap.read(fixture.campaign.id, night.id));
    const ended = read.fights.find((one) => one.run.id === fight.id)!;

    expect(ended.run.endedReason).toBe("resolved");
    expect(ended.continuedInto).toBeNull();
  });
});

describe("an empty night", () => {
  it("is an empty recap rather than an error", async () => {
    const quiet = await as(
      sessions.create(fixture.campaign.id, { number: 40, title: "Rained off" }),
    );

    const night = await as(recap.read(fixture.campaign.id, quiet.id));

    expect(night.session.number).toBe(40);
    expect(night.fights).toEqual([]);
    expect(night.beats).toEqual([]);
    expect(night.prepDone).toEqual([]);
    expect(night.notes).toEqual([]);
  });
});

describe("scoping", () => {
  it("refuses a campaign-scoped credential another campaign's recap", async () => {
    // The same account owns both tables, so ownership alone would let this
    // through. `campaignInScope` is what does not — and this is the shape of
    // the hole the auth work closed, which stayed invisible precisely because
    // no test minted a scoped actor.
    const denied = await asScoped(
      Effect.flip(recap.read(fixture.otherTable.id, fixture.nightElsewhere.id)),
    );

    expect(denied).toBeInstanceOf(NotFound);
    expect(denied.resource).toBe("session");
    // And the DM's account-wide credential *can* have it, so the refusal above
    // is about scope rather than about a row that is not there.
    const reachable = await as(recap.read(fixture.otherTable.id, fixture.nightElsewhere.id));
    expect(reachable.session.id).toBe(fixture.nightElsewhere.id);
    // Its own table is still reachable with the scoped credential.
    const own = await asScoped(recap.read(fixture.campaign.id, fixture.session.id));
    expect(own.session.id).toBe(fixture.session.id);
  });

  it("refuses a session smuggled in under the wrong campaign", async () => {
    // The session id is real and the campaign id is real; they just do not
    // belong together. A path is a claim.
    const denied = await as(Effect.flip(recap.read(fixture.otherTable.id, fixture.session.id)));

    expect(denied).toBeInstanceOf(NotFound);
  });

  it("gives a player only the shared rows of a night they can reach", async () => {
    const night = await asPlayer(recap.read(fixture.campaign.id, fixture.session.id));

    // The two `shared` beats, and not the DM's own line about Hettie. Filtered
    // in SQL: nothing DM-only was ever in memory to forget to drop.
    expect(night.beats.map((beat) => beat.id)).toEqual([fixture.ferryman.id, fixture.crate.id]);
    expect(night.beats.map((beat) => beat.id)).not.toContain(fixture.dmOnly.id);
    // The checklist and the notes default to `dm`, so a player's recap carries
    // neither the tick nor the unattached note — and the read-aloud, which was
    // shared on purpose, is there.
    expect(night.prepDone).toEqual([]);
    expect(night.notes.map((note) => note.id)).toEqual([fixture.readAloud.id]);
  });

  it("does not follow a carry-over link out of what the actor can see", async () => {
    // `continued_from` is provenance, not an access path. A player who cannot
    // see the predecessor gets a fight with no link rather than a link into a
    // fight they may not have.
    const first = await as(sessions.create(fixture.campaign.id, { number: 50 }));
    const paused = await as(
      runs.start(fixture.asDm, first.id, { encounterId: fixture.encounter.id }),
    );
    await as(
      Effect.flatMap(DateTime.now, (endedAt) =>
        sessions.update(fixture.campaign.id, first.id, { endedAt }),
      ),
    );
    const second = await as(
      sessions.create(fixture.campaign.id, { number: 51, visibility: "shared" }),
    );
    const resumed = await as(runs.resume(fixture.asDm, second.id, { continuedFrom: paused.id }));
    // Share the successor but not its predecessor's night.
    await as(runs.update(fixture.asDm, second.id, resumed.id, { visibility: "shared" }));

    const seen = await asPlayer(recap.read(fixture.campaign.id, second.id));
    const fight = seen.fights.find((one) => one.run.id === resumed.id)!;

    expect(fight.run.continuedFrom).toBe(paused.id);
    expect(fight.continuedFrom).toBeNull();
  });
});

describe("the shape the Chronicle screen and the assistant both read", () => {
  it("is one call, and it is actor-scoped by its type", async () => {
    // `read` requires `CurrentActor`, so an unscoped recap does not compile —
    // which is the property the assistant's `sessionRecap` tool inherits rather
    // than having to re-establish. This test is the runtime half: the fields a
    // consumer branches on are all present in one response.
    const night = await as(recap.read(fixture.campaign.id, fixture.session.id));

    expect(Object.keys(night)).toEqual(
      expect.arrayContaining(["session", "fights", "beats", "prepDone", "notes"]),
    );
    // Nothing is stored, so a second read of an unchanged night is identical.
    const again = await as(recap.read(fixture.campaign.id, fixture.session.id));
    expect(again.beats.map((beat) => beat.id)).toEqual(night.beats.map((beat) => beat.id));

    // And a beat corrected after the fact reads corrected — the recap is a view
    // over the rows, not a copy of them.
    await as(
      beats.update(fixture.campaign.id, fixture.session.id, fixture.crate.id, {
        body: "They buried the crate under the reeds, still sealed.",
      }),
    );
    const corrected = await as(recap.read(fixture.campaign.id, fixture.session.id));
    expect(corrected.beats.map((beat) => beat.body)).toContain(
      "They buried the crate under the reeds, still sealed.",
    );
  });
});
