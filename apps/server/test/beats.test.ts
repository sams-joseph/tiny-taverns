import { Actor, type BeatId, CurrentActor, NotFound, type SessionId } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Invites } from "../src/repo/Invites.js";
import { SessionEvents } from "../src/repo/SessionEvents.js";
import { Sessions } from "../src/repo/Sessions.js";
import { aPlayerAt, anAccount, asDm, scopedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { items } from "./support/paging.js";

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
  Creatures.layer,
  DmActors.layer,
  EncounterCreatures.layer,
  EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
  Encounters.layer,
  Invites.layer,
  SessionEvents.layer,
  Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
).pipe(Layer.provideMerge(migratedDatabase("taverns_test_beats")));
const runtime = ManagedRuntime.make(services);
afterAll(() => runtime.dispose());

/** What the runtime above can provide — so the helpers below can say so. */
type Services = Layer.Success<typeof services>;

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
  const campaigns = yield* Campaigns;
  const encounters = yield* Encounters;
  const sessions = yield* Sessions;
  const beats = yield* Beats;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road", visibility: "shared" }));
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "Ambush in the reeds", difficulty: "Medium" }),
  );
  const session = yield* as(
    sessions.create(campaign.id, { number: 12, title: "The ford", visibility: "shared" }),
  );

  const otherTable = yield* as(
    campaigns.create({ name: "Salt and Sixpence", visibility: "shared" }),
  );
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

let fixture: Effect.Success<typeof makeFixture>;
let beats: (typeof Beats)["Service"];
let runs: (typeof EncounterRuns)["Service"];
let events: (typeof SessionEvents)["Service"];
let sessions: (typeof Sessions)["Service"];

beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture);
  beats = await runtime.runPromise(Beats);
  runs = await runtime.runPromise(EncounterRuns);
  events = await runtime.runPromise(SessionEvents);
  sessions = await runtime.runPromise(Sessions);
}, 60_000);

const as = <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
  runtime.runPromise(withActor(fixture.dm)(effect).pipe(Effect.orDie));

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

/** A night of its own per test, so the lists below are about one night. */
let nextNumber = 100;
const freshSession = (): Promise<{ readonly id: SessionId }> => {
  nextNumber += 1;
  return as(sessions.create(fixture.campaign.id, { number: nextNumber }));
};

describe("jotting one down", () => {
  it("stores the prose verbatim and fails closed", async () => {
    const night = await freshSession();
    const beat = await as(
      beats.create(fixture.campaign.id, night.id, {
        body: "The ferryman is called Cazril. He will not take coin, only a name.",
      }),
    );

    expect(beat.body).toBe("The ferryman is called Cazril. He will not take coin, only a name.");
    expect(beat.sessionId).toEqual(night.id);
    expect(beat.encounterRunId).toBeNull();
    // Nothing said about visibility, so the column decides — and the column is
    // `dm`, like every other row in the product.
    expect(beat.visibility).toBe("dm");
    expect(beat.origin).toBe("authored");
  }, 60_000);

  it("defaults at the column, not only in the payload schema", async () => {
    const night = await freshSession();
    const row = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{ readonly visibility: string; readonly origin: string }>`
          insert into beat (session_id, body)
          values (${night.id}, 'inserted behind the repository')
          returning visibility, origin
        `;
        return rows[0];
      }).pipe(Effect.orDie),
    );
    expect(row).toEqual({ visibility: "dm", origin: "authored" });
  }, 60_000);

  it("lists a night's beats oldest first — a chronology, not a library", async () => {
    const night = await freshSession();
    await as(beats.create(fixture.campaign.id, night.id, { body: "First: they took the ford." }));
    await as(beats.create(fixture.campaign.id, night.id, { body: "Then: the hag begged." }));
    await as(beats.create(fixture.campaign.id, night.id, { body: "Last: Wren let her go." }));

    const listed = await as(items(beats.list(fixture.campaign.id, night.id, {})));
    expect(listed.map((beat) => beat.body)).toEqual([
      "First: they took the ford.",
      "Then: the hag begged.",
      "Last: Wren let her go.",
    ]);
  }, 60_000);

  it("puts a marker in the log, with the prose left out of the payload", async () => {
    const night = await freshSession();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    await as(
      beats.create(fixture.campaign.id, night.id, {
        body: "The hag begged. Wren let her go.",
        encounterRunId: run.id,
      }),
    );

    const log = await as(events.list(fixture.asDm, night.id, {}));
    const marker = log.find((row) => row.kind === "beat-added");
    expect(marker).toBeDefined();
    // Which fight it happened in, so a recap can order it against combat.
    expect(marker?.encounterRunId).toEqual(run.id);
    // …and nothing else. The beat is the row; this is a pointer in time to it,
    // which is what keeps `payload` non-contractual.
    expect(marker?.payload).toEqual({});
    expect(JSON.stringify(marker?.payload)).not.toContain("hag");
  }, 60_000);

  it("refuses a fight belonging to another night", async () => {
    // The composite `beat_run_fkey` makes it unrepresentable; the repository
    // turns the same refusal into the 404 the rest of the surface answers with
    // rather than letting a constraint violation become a 500.
    const first = await freshSession();
    const second = await freshSession();
    const run = await as(runs.start(fixture.asDm, first.id, { encounterId: fixture.encounter.id }));

    const failure = await as(
      Effect.flip(
        beats.create(fixture.campaign.id, second.id, {
          body: "smuggled onto another night's fight",
          encounterRunId: run.id,
        }),
      ),
    );
    expect(failure).toBeInstanceOf(NotFound);
    expect((failure as NotFound).resource).toBe("encounter_run");
  }, 60_000);

  it("is unrepresentable across nights in the schema, not only in the repository", async () => {
    const first = await freshSession();
    const second = await freshSession();
    const run = await as(runs.start(fixture.asDm, first.id, { encounterId: fixture.encounter.id }));

    const error = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql`
          insert into beat ${sql.insert({
            session_id: second.id,
            encounter_run_id: run.id,
            body: "by hand",
          })}
        `.pipe(Effect.flip, Effect.map(describeError));
      }),
    );
    expect(error).toContain("beat_run_fkey");
  }, 60_000);
});

describe("correcting one — the reason beats are not log lines", () => {
  it("rewrites the body in place, and appends nothing to the log", async () => {
    const night = await freshSession();
    const beat = await as(
      beats.create(fixture.campaign.id, night.id, { body: "The ferrymen is called Cazril." }),
    );
    const before = await as(events.list(fixture.asDm, night.id, {}));

    const fixed = await as(
      beats.update(fixture.campaign.id, night.id, beat.id, {
        body: "The ferryman is called Cazril.",
      }),
    );
    const after = await as(events.list(fixture.asDm, night.id, {}));

    expect(fixed.id).toEqual(beat.id);
    expect(fixed.body).toBe("The ferryman is called Cazril.");
    // One line in the log, from the create. A correction that arrived as a
    // second log row would be the append-a-retraction answer that ruled out
    // storing beats there in the first place — and a client past that `seq`
    // would never see it.
    expect(after.length).toEqual(before.length);
  }, 60_000);

  it("deletes one, and the night keeps the rest", async () => {
    const night = await freshSession();
    const keep = await as(beats.create(fixture.campaign.id, night.id, { body: "worth keeping" }));
    const drop = await as(beats.create(fixture.campaign.id, night.id, { body: "a duplicate" }));

    await as(beats.remove(fixture.campaign.id, night.id, drop.id));

    const listed = await as(items(beats.list(fixture.campaign.id, night.id, {})));
    expect(listed.map((beat) => beat.id)).toEqual([keep.id]);
    const gone = await as(Effect.flip(beats.findById(fixture.campaign.id, night.id, drop.id)));
    expect(gone).toBeInstanceOf(NotFound);
    expect((gone as NotFound).resource).toBe("beat");
  }, 60_000);

  it("keeps the prose when the fight it happened in is deleted", async () => {
    // `on delete set null (encounter_run_id)` — the Postgres 15+ column list.
    // A bare `set null` would null `session_id` too and hit its not-null.
    const night = await freshSession();
    const run = await as(runs.start(fixture.asDm, night.id, { encounterId: fixture.encounter.id }));
    const beat = await as(
      beats.create(fixture.campaign.id, night.id, {
        body: "The hag begged. Wren let her go.",
        encounterRunId: run.id,
      }),
    );
    expect(beat.encounterRunId).toEqual(run.id);

    await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`delete from encounter_run where id = ${run.id}`;
      }).pipe(Effect.orDie),
    );

    const detached = await as(beats.findById(fixture.campaign.id, night.id, beat.id));
    expect(detached.body).toBe("The hag begged. Wren let her go.");
    expect(detached.encounterRunId).toBeNull();
  }, 60_000);

  it("goes with the session it belongs to", async () => {
    // The right cascade — a beat with no night is meaningless — and worth
    // saying out loud now that deleting a session throws away campaign history
    // rather than just a checklist.
    const night = await freshSession();
    const beat = await as(
      beats.create(fixture.campaign.id, night.id, { body: "on a doomed night" }),
    );
    await as(sessions.remove(fixture.campaign.id, night.id));

    const rows = await as(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly id: BeatId }>`select id from beat where id = ${beat.id}`;
      }).pipe(Effect.orDie),
    );
    expect(rows).toEqual([]);
  }, 60_000);
});

describe("a player actor", () => {
  it("cannot read a dm-visibility beat, and can read a shared one", async () => {
    const night = await freshSession();
    const hidden = await as(beats.create(fixture.campaign.id, night.id, { body: "dm only" }));
    const shown = await as(
      beats.create(fixture.campaign.id, night.id, { body: "shared", visibility: "shared" }),
    );
    // The session has to be shared too — the master toggle one level down from
    // the campaign, exactly as for a prep item.
    await as(sessions.update(fixture.campaign.id, night.id, { visibility: "shared" }));

    const asPlayer = <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
      runtime.runPromise(withActor(fixture.player)(effect).pipe(Effect.orDie));

    const listed = await asPlayer(items(beats.list(fixture.campaign.id, night.id, {})));
    expect(listed.map((beat) => beat.id)).toEqual([shown.id]);

    const denied = await asPlayer(
      Effect.flip(beats.findById(fixture.campaign.id, night.id, hidden.id)),
    );
    expect(denied).toBeInstanceOf(NotFound);
  }, 60_000);

  it("cannot write even the shared beat it can read", async () => {
    const night = await freshSession();
    const shown = await as(
      beats.create(fixture.campaign.id, night.id, { body: "shared", visibility: "shared" }),
    );
    await as(sessions.update(fixture.campaign.id, night.id, { visibility: "shared" }));

    const asPlayer = <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
      runtime.runPromise(withActor(fixture.player)(effect).pipe(Effect.orDie));

    const created = await asPlayer(
      Effect.flip(beats.create(fixture.campaign.id, night.id, { body: "from a player" })),
    );
    const updated = await asPlayer(
      Effect.flip(beats.update(fixture.campaign.id, night.id, shown.id, { body: "tampered" })),
    );
    const removed = await asPlayer(
      Effect.flip(beats.remove(fixture.campaign.id, night.id, shown.id)),
    );

    expect(created).toBeInstanceOf(NotFound);
    expect(updated).toBeInstanceOf(NotFound);
    expect(removed).toBeInstanceOf(NotFound);
  }, 60_000);
});

describe("a campaign-scoped actor", () => {
  // One DM, two tables, both shared. Account ownership is not scope: a
  // credential minted for the first campaign must reach nothing in the second.

  const asScoped = <A, E, R extends Services>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    runtime.runPromise(withActor(fixture.player)(effect).pipe(Effect.orDie));

  it("cannot reach the other campaign's beats, by either path", async () => {
    // Both ways of naming it: honestly, with the other campaign's id; and
    // lying about the campaign while giving the other campaign's session id,
    // which is the shape that would work if the predicate trusted the session
    // it was handed instead of containing it.
    const honest = await asScoped(
      Effect.flip(items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {}))),
    );
    const smuggled = await asScoped(
      Effect.flip(items(beats.list(fixture.campaign.id, fixture.sessionElsewhere.id, {}))),
    );
    const smuggledBeat = await asScoped(
      Effect.flip(
        beats.findById(fixture.campaign.id, fixture.sessionElsewhere.id, fixture.beatElsewhere.id),
      ),
    );

    expect(honest).toBeInstanceOf(NotFound);
    expect(smuggled).toBeInstanceOf(NotFound);
    expect(smuggledBeat).toBeInstanceOf(NotFound);

    // …and it really is there and really is shared, so the three refusals
    // above are about scope rather than about an empty table.
    const asDm = await as(
      items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {})),
    );
    expect(asDm.map((beat) => beat.id)).toEqual([fixture.beatElsewhere.id]);
    expect(asDm[0]!.visibility).toBe("shared");
  }, 60_000);

  it("narrows a dm-role actor too, so scope does not depend on the role", async () => {
    const scopedDm = scopedTo(fixture.dm, fixture.campaign.id);
    const written = await runtime.runPromise(
      withActor(scopedDm)(
        Effect.flip(
          beats.create(fixture.otherTable.id, fixture.sessionElsewhere.id, {
            body: "out of scope",
          }),
        ),
      ).pipe(Effect.orDie),
    );
    const listed = await runtime.runPromise(
      withActor(scopedDm)(
        Effect.flip(items(beats.list(fixture.otherTable.id, fixture.sessionElsewhere.id, {}))),
      ).pipe(Effect.orDie),
    );

    expect(written).toBeInstanceOf(NotFound);
    expect(listed).toBeInstanceOf(NotFound);
  }, 60_000);

  it("reaches nothing from another account at all", async () => {
    const outsider = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* anAccount("Someone else");
      }).pipe(Effect.orDie),
    );
    const failure = await runtime.runPromise(
      withActor(outsider)(
        Effect.flip(
          beats.findById(
            fixture.otherTable.id,
            fixture.sessionElsewhere.id,
            fixture.beatElsewhere.id,
          ),
        ),
      ).pipe(Effect.orDie),
    );
    expect(failure).toBeInstanceOf(NotFound);
  }, 60_000);
});
