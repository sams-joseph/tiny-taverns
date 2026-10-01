import { describe, expect } from "@effect/vitest";
import { Actor, type BeatId, CurrentActor, NotFound } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { Creatures } from "../src/repo/Creatures.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, asDm, createCampaign, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";
import { describeLayer } from "./support/suite.js";

/**
 * Beats: one line of prose about what happened, filed against the night.
 *
 * Three claims, and they are the three the decision rests on:
 *
 * - **a beat is correctable**, which is the argument that decided beats cannot
 *   be `session_event` rows — that table has no update or delete path by design;
 * - **it inherits the visibility seam with no new predicate**, because it hangs
 *   off `session` exactly as `prep_item` does, so a campaign-scoped credential
 *   reaches nothing in another campaign by either path;
 * - **jotting one puts a marker in the log** at the right `seq`, with the prose
 *   deliberately left out of the payload.
 */
const services = Layer.mergeAll(
  Accounts.layer,
  Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
  Campaigns.layer,
  Groups.layer,
  Creatures.layer,
  CampaignCreatorActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_beats")));

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/**
 * One DM, two tables. Both shared, so "cannot reach" is about scope rather than
 * about an empty campaign — the hole the auth work closed was invisible for as
 * long as it was precisely because no test minted a scoped actor.
 */
const makeFixture = Effect.gen(function* () {
  const encounters = yield* Encounters;
  const sessions = yield* Sessions;
  const beats = yield* Beats;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(createCampaign({ name: "The Salt Road", visibility: "shared" }));
  const encounter = yield* as(encounters.create(campaign.id, { name: "Ambush in the reeds" }));
  const session = yield* as(
    sessions.create(campaign.id, { number: 12, title: "The ford", visibility: "shared" }),
  );

  const otherTable = yield* as(createCampaign({ name: "Salt and Sixpence", visibility: "shared" }));
  const sessionElsewhere = yield* as(
    sessions.create(otherTable.id, { number: 1, visibility: "shared" }),
  );
  const beatElsewhere = yield* as(
    beats.create(otherTable.id, sessionElsewhere.id, {
      body: "They left the crate unopened and buried it under the reeds.",
      visibility: "shared",
    }),
  );

  return {
    dm,
    /** The proof `EncounterRuns` and `SessionEvents` take in place of a campaign id. */
    asDm: yield* as(asDm(dm, campaign.id)),
    /** A credential minted for the first table only. */
    player: yield* aPlayerAt(campaign.id, "Pim"),
    campaign,
    encounter,
    session,
    otherTable,
    sessionElsewhere,
    beatElsewhere,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "beats.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(services));

const as = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.flatMap(Fixture, (fixture) => withActor(fixture.dm)(effect).pipe(Effect.orDie));

const asPlayer = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  Effect.flatMap(Fixture, (fixture) => withActor(fixture.player)(effect).pipe(Effect.orDie));

/**
 * What Postgres actually said. `SqlError`'s own message is the generic "Failed
 * to execute statement"; the driver's text, naming the constraint, is one level
 * down in the cause.
 */
const describeError = (error: unknown): string => {
  let cause: unknown = error;
  const seen: Array<string> = [];
  while (cause !== null && cause !== undefined) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

/**
 * An encounter of its own per fight. An encounter is played once
 * (`playthroughOf` in `repo/EncounterRuns.ts`), so a test that starts one
 * cannot share it with another.
 */
const anEncounter = Effect.gen(function* () {
  const { campaign, encounter } = yield* Fixture;
  const encounters = yield* Encounters;
  return yield* as(encounters.create(campaign.id, { name: encounter.name }));
});

/** A night of its own per test, so the lists below are about one night. */
let nextNumber = 100;
const freshSession = Effect.gen(function* () {
  const { campaign } = yield* Fixture;
  const sessions = yield* Sessions;
  nextNumber += 1;
  return yield* as(sessions.create(campaign.id, { number: nextNumber }));
});

describeLayer("beats", shared, (it) => {
  describe("jotting one down", () => {
    it.effect("stores the prose verbatim and fails closed", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const night = yield* freshSession;
        const beat = yield* as(
          beats.create(campaign.id, night.id, {
            body: "The ferryman is called Cazril. He will not take coin, only a name.",
          }),
        );

        expect(beat.body).toBe(
          "The ferryman is called Cazril. He will not take coin, only a name.",
        );
        expect(beat.sessionId).toEqual(night.id);
        expect(beat.encounterRunId).toBeNull();
        // Nothing said about visibility, so the column decides — and the column is
        // `dm`, like every other row in the product.
        expect(beat.visibility).toBe("dm");
        expect(beat.origin).toBe("authored");
      }),
    );

    it.effect("defaults at the column, not only in the payload schema", () =>
      Effect.gen(function* () {
        const night = yield* freshSession;
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into beat (session_id, body)
          values (${night.id}, 'inserted behind the repository')
          returning visibility, origin
        `.pipe(Effect.orDie);
        expect(rows[0]).toEqual({ visibility: "dm", origin: "authored" });
      }),
    );

    it.effect("lists a night's beats oldest first — a chronology, not a library", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const night = yield* freshSession;
        yield* as(beats.create(campaign.id, night.id, { body: "First: they took the ford." }));
        yield* as(beats.create(campaign.id, night.id, { body: "Then: the hag begged." }));
        yield* as(beats.create(campaign.id, night.id, { body: "Last: Wren let her go." }));

        const listed = yield* as(items(beats.list(campaign.id, night.id, {})));
        expect(listed.map((beat) => beat.body)).toEqual([
          "First: they took the ford.",
          "Then: the hag begged.",
          "Last: Wren let her go.",
        ]);
      }),
    );

    it.effect("puts a marker in the log, with the prose left out of the payload", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const runs = yield* EncounterRuns;
        const events = yield* SessionEvents;
        const night = yield* freshSession;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: (yield* anEncounter).id }),
        );
        yield* as(
          beats.create(fixture.campaign.id, night.id, {
            body: "The hag begged. Wren let her go.",
            encounterRunId: run.id,
          }),
        );

        const log = yield* as(events.list(fixture.asDm, night.id, {}));
        const marker = log.find((row) => row.kind === "beat-added");
        expect(marker).toBeDefined();
        // Which fight it happened in, so a recap can order it against combat.
        expect(marker?.encounterRunId).toEqual(run.id);
        // …and nothing else. The beat is the row; this is a pointer in time to it,
        // which is what keeps `payload` non-contractual.
        expect(marker?.payload).toEqual({});
        expect(JSON.stringify(marker?.payload)).not.toContain("hag");
      }),
    );

    it.effect("refuses a fight belonging to another night", () =>
      Effect.gen(function* () {
        // The composite `beat_run_fkey` makes it unrepresentable; the repository
        // turns the same refusal into the 404 the rest of the surface answers with
        // rather than letting a constraint violation become a 500.
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const runs = yield* EncounterRuns;
        const first = yield* freshSession;
        const second = yield* freshSession;
        const run = yield* as(
          runs.start(fixture.asDm, first.id, { encounterId: (yield* anEncounter).id }),
        );

        const failure = yield* as(
          Effect.flip(
            beats.create(fixture.campaign.id, second.id, {
              body: "smuggled onto another night's fight",
              encounterRunId: run.id,
            }),
          ),
        );
        expect(failure).toBeInstanceOf(NotFound);
        expect((failure as NotFound).resource).toBe("encounter_run");
      }),
    );

    it.effect("is unrepresentable across nights in the schema, not only in the repository", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const runs = yield* EncounterRuns;
        const first = yield* freshSession;
        const second = yield* freshSession;
        const run = yield* as(
          runs.start(fixture.asDm, first.id, { encounterId: (yield* anEncounter).id }),
        );

        const sql = yield* SqlClient.SqlClient;
        const error = yield* sql`
          insert into beat ${sql.insert({
            session_id: second.id,
            encounter_run_id: run.id,
            body: "by hand",
          })}
        `.pipe(Effect.flip, Effect.map(describeError));
        expect(error).toContain("beat_run_fkey");
      }),
    );
  });

  describe("correcting one — the reason beats are not log lines", () => {
    it.effect("rewrites the body in place, and appends nothing to the log", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const events = yield* SessionEvents;
        const night = yield* freshSession;
        const beat = yield* as(
          beats.create(fixture.campaign.id, night.id, { body: "The ferrymen is called Cazril." }),
        );
        const before = yield* as(events.list(fixture.asDm, night.id, {}));

        const fixed = yield* as(
          beats.update(fixture.campaign.id, night.id, beat.id, {
            body: "The ferryman is called Cazril.",
          }),
        );
        const after = yield* as(events.list(fixture.asDm, night.id, {}));

        expect(fixed.id).toEqual(beat.id);
        expect(fixed.body).toBe("The ferryman is called Cazril.");
        // One line in the log, from the create. A correction that arrived as a
        // second log row would be the append-a-retraction answer that ruled out
        // storing beats there in the first place — and a client past that `seq`
        // would never see it.
        expect(after.length).toEqual(before.length);
      }),
    );

    it.effect("deletes one, and the night keeps the rest", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const night = yield* freshSession;
        const keep = yield* as(beats.create(campaign.id, night.id, { body: "worth keeping" }));
        const drop = yield* as(beats.create(campaign.id, night.id, { body: "a duplicate" }));

        yield* as(beats.remove(campaign.id, night.id, drop.id));

        const listed = yield* as(items(beats.list(campaign.id, night.id, {})));
        expect(listed.map((beat) => beat.id)).toEqual([keep.id]);
        const gone = yield* as(Effect.flip(beats.findById(campaign.id, night.id, drop.id)));
        expect(gone).toBeInstanceOf(NotFound);
        expect((gone as NotFound).resource).toBe("beat");
      }),
    );

    it.effect("keeps the prose when the fight it happened in is deleted", () =>
      Effect.gen(function* () {
        // `on delete set null (encounter_run_id)` — the Postgres 15+ column list.
        // A bare `set null` would null `session_id` too and hit its not-null.
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const runs = yield* EncounterRuns;
        const night = yield* freshSession;
        const run = yield* as(
          runs.start(fixture.asDm, night.id, { encounterId: (yield* anEncounter).id }),
        );
        const beat = yield* as(
          beats.create(fixture.campaign.id, night.id, {
            body: "The hag begged. Wren let her go.",
            encounterRunId: run.id,
          }),
        );
        expect(beat.encounterRunId).toEqual(run.id);

        const sql = yield* SqlClient.SqlClient;
        yield* sql`delete from encounter_run where id = ${run.id}`.pipe(Effect.orDie);

        const detached = yield* as(beats.findById(fixture.campaign.id, night.id, beat.id));
        expect(detached.body).toBe("The hag begged. Wren let her go.");
        expect(detached.encounterRunId).toBeNull();
      }),
    );

    it.effect("goes with the session it belongs to", () =>
      Effect.gen(function* () {
        // The right cascade — a beat with no night is meaningless — and worth
        // saying out loud now that deleting a session throws away campaign history
        // rather than just a checklist.
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const sessions = yield* Sessions;
        const night = yield* freshSession;
        const beat = yield* as(beats.create(campaign.id, night.id, { body: "on a doomed night" }));
        yield* as(sessions.remove(campaign.id, night.id));

        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{
          readonly id: BeatId;
        }>`select id from beat where id = ${beat.id}`.pipe(Effect.orDie);
        expect(rows).toEqual([]);
      }),
    );
  });

  describe("a player actor", () => {
    it.effect("cannot read a dm-visibility beat, and can read a shared one", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const sessions = yield* Sessions;
        const night = yield* freshSession;
        const hidden = yield* as(beats.create(campaign.id, night.id, { body: "dm only" }));
        const shown = yield* as(
          beats.create(campaign.id, night.id, { body: "shared", visibility: "shared" }),
        );
        // The session has to be shared too — the master toggle one level down from
        // the campaign, exactly as for a prep item.
        yield* as(sessions.update(campaign.id, night.id, { visibility: "shared" }));

        const listed = yield* asPlayer(items(beats.list(campaign.id, night.id, {})));
        expect(listed.map((beat) => beat.id)).toEqual([shown.id]);

        const denied = yield* asPlayer(
          Effect.flip(beats.findById(campaign.id, night.id, hidden.id)),
        );
        expect(denied).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("cannot write even the shared beat it can read", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Fixture;
        const beats = yield* Beats;
        const sessions = yield* Sessions;
        const night = yield* freshSession;
        const shown = yield* as(
          beats.create(campaign.id, night.id, { body: "shared", visibility: "shared" }),
        );
        yield* as(sessions.update(campaign.id, night.id, { visibility: "shared" }));

        const created = yield* asPlayer(
          Effect.flip(beats.create(campaign.id, night.id, { body: "from a player" })),
        );
        const updated = yield* asPlayer(
          Effect.flip(beats.update(campaign.id, night.id, shown.id, { body: "tampered" })),
        );
        const removed = yield* asPlayer(Effect.flip(beats.remove(campaign.id, night.id, shown.id)));

        expect(created).toBeInstanceOf(NotFound);
        expect(updated).toBeInstanceOf(NotFound);
        expect(removed).toBeInstanceOf(NotFound);
      }),
    );
  });

  describe("a campaign-scoped actor", () => {
    // One DM, two tables, both shared. Account ownership is not scope: a
    // credential minted for the first campaign must reach nothing in the second.

    it.effect("cannot reach the other campaign's beats, by either path", () =>
      Effect.gen(function* () {
        // Both ways of naming it: honestly, with the other campaign's id; and
        // lying about the campaign while giving the other campaign's session id,
        // which is the shape that would work if the predicate trusted the session
        // it was handed instead of containing it.
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const honest = yield* asPlayer(
          Effect.flip(items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {}))),
        );
        const smuggled = yield* asPlayer(
          Effect.flip(items(beats.list(fixture.campaign.id, fixture.sessionElsewhere.id, {}))),
        );
        const smuggledBeat = yield* asPlayer(
          Effect.flip(
            beats.findById(
              fixture.campaign.id,
              fixture.sessionElsewhere.id,
              fixture.beatElsewhere.id,
            ),
          ),
        );

        expect(honest).toBeInstanceOf(NotFound);
        expect(smuggled).toBeInstanceOf(NotFound);
        expect(smuggledBeat).toBeInstanceOf(NotFound);

        // …and it really is there and really is shared, so the three refusals
        // above are about scope rather than about an empty table.
        const asDm = yield* as(
          items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {})),
        );
        expect(asDm.map((beat) => beat.id)).toEqual([fixture.beatElsewhere.id]);
        expect(asDm[0]!.visibility).toBe("shared");
      }),
    );

    it.effect("narrows a dm-role actor too, so scope does not depend on the role", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const scopedDm = withActor(scopedTo(fixture.dm, fixture.campaign.id));
        const written = yield* scopedDm(
          Effect.flip(
            beats.create(fixture.otherTable.id, fixture.sessionElsewhere.id, {
              body: "out of scope",
            }),
          ),
        );
        const listed = yield* scopedDm(
          Effect.flip(items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {}))),
        );

        expect(written).toBeInstanceOf(NotFound);
        expect(listed).toBeInstanceOf(NotFound);
      }),
    );

    it.effect("reaches nothing from another account at all", () =>
      Effect.gen(function* () {
        const fixture = yield* Fixture;
        const beats = yield* Beats;
        const outsider = yield* anAccount("Someone else");
        const failure = yield* withActor(outsider)(
          Effect.flip(
            beats.findById(
              fixture.otherTable.id,
              fixture.sessionElsewhere.id,
              fixture.beatElsewhere.id,
            ),
          ),
        );
        expect(failure).toBeInstanceOf(NotFound);
      }),
    );
  });
});
