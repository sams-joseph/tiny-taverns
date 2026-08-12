import { Actor, Conflict, CurrentActor, NotFound, type SessionId } from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { DmActors } from "../src/repo/DmActor.js";
import { EncounterCreatures } from "../src/repo/EncounterCreatures.js";
import { EncounterRuns } from "../src/repo/EncounterRuns.js";
import { Encounters } from "../src/repo/Encounters.js";
import { Sessions } from "../src/repo/Sessions.js";
import { anAccount, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * §1.4's session lifecycle, and the one thing it says that had never been
 * enforced: **a finished session is not a campaign's current session.**
 *
 * The defect this file pins was a dead end at the table. Finishing a session
 * stamped `ended_at` and left `campaign.current_session_id` pointing at it, so
 * the campaign screen — which resolves the night it is preparing from that
 * pointer — went on loading the finished session, and *Start session*, which
 * invents the next one only when the pointer resolves to nothing, handed the
 * DM the night that was already over. Permanently.
 *
 * The invariant is checked here from three sides, because it is three claims:
 * the transition performs it, the write path refuses to undo it, and the schema
 * cannot represent it being false — that last one is what a client this
 * repository has never met is held to.
 */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Creatures.layer,
    DmActors.layer,
    EncounterCreatures.layer,
    EncounterRuns.layer.pipe(Layer.provide(LiveEvents.layer)),
    Encounters.layer,
    // Finishing a night now carries a fight still on the table, which
    // appends to the log and rings the doorbell — so `Sessions` is a live
    // repository too. `Layer` memoises by identity, so this is the same
    // `PubSub` the other live layers here take.
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_session_lifecycle"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

/** A campaign with one encounter and session 12 on the table, as the DM. */
const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const encounters = yield* Encounters;
  const sessions = yield* Sessions;

  const dm = yield* anAccount("Jo");
  const as = withActor(dm);

  const campaign = yield* as(campaigns.create({ name: "The Salt Road" }));
  const encounter = yield* as(
    encounters.create(campaign.id, { name: "Ambush in the reeds", difficulty: "Medium" }),
  );
  const session = yield* as(sessions.create(campaign.id, { number: 12, title: "The ford" }));
  yield* as(campaigns.update(campaign.id, { currentSessionId: session.id }));

  return {
    as,
    campaigns,
    sessions,
    /** The DM proof the live repositories take in place of a campaign id. */
    dm: yield* as(asDm(dm, campaign.id)),
    campaignId: campaign.id,
    encounterId: encounter.id,
    sessionId: session.id,
  };
});

/**
 * What Postgres actually said.
 *
 * `SqlError`'s own message is the generic "Failed to execute statement" — the
 * driver's text, naming the constraint, is one level down in the cause.
 */
const describe_ = (error: unknown): string => {
  let cause: unknown = error;
  const seen: Array<string> = [];
  while (cause !== null && cause !== undefined) {
    seen.push(String(cause));
    cause = (cause as { readonly cause?: unknown }).cause;
  }
  return seen.join("\n");
};

const currentSessionId = (campaignId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly current_session_id: SessionId | null }>`
      select current_session_id from campaign where id = ${campaignId}
    `;
    return rows[0]!.current_session_id;
  }).pipe(Effect.orDie);

describe("finishing a session", () => {
  it("clears the campaign's pointer at it, in the same transaction", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const { as, sessions, campaignId, sessionId } = yield* makeFixture;
        expect(yield* currentSessionId(campaignId)).toEqual(sessionId);

        const endedAt = yield* DateTime.now;
        const ended = yield* as(sessions.update(campaignId, sessionId, { endedAt }));

        expect(ended.endedAt).not.toBeNull();
        expect(yield* currentSessionId(campaignId)).toBeNull();
      }).pipe(Effect.orDie),
    );
  }, 60_000);

  it("lets the next session be started, numbered one past the last", async () => {
    // The client half of the dead end, played out: with the pointer clear,
    // `StartRunDialog` takes its `session === undefined` branch — read the
    // numbers, invent the next one, point the campaign at it — and the DM is in
    // session 13 rather than back in the one they just finished.
    const numbers = await runtime.runPromise(
      Effect.gen(function* () {
        const { as, campaigns, sessions, campaignId, sessionId } = yield* makeFixture;
        const endedAt = yield* DateTime.now;
        yield* as(sessions.update(campaignId, sessionId, { endedAt }));

        const campaign = yield* as(campaigns.findById(campaignId));
        expect(campaign.currentSessionId).toBeNull();

        const highest = yield* as(sessions.list(campaignId)).pipe(
          Effect.map((rows) => rows.reduce((most, row) => Math.max(most, row.number), 0)),
        );
        const next = yield* as(sessions.create(campaignId, { number: highest + 1 }));
        yield* as(campaigns.update(campaignId, { currentSessionId: next.id }));

        expect(yield* currentSessionId(campaignId)).toEqual(next.id);
        return { finished: 12, next: next.number };
      }).pipe(Effect.orDie),
    );

    expect(numbers).toEqual({ finished: 12, next: 13 });
  }, 60_000);

  it("does not touch a campaign pointing somewhere else", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const { as, campaigns, sessions, campaignId, sessionId } = yield* makeFixture;
        // A second, unfinished session — the pointer stays on it while its
        // neighbour ends. `releaseIfFinished` is scoped to the row it wrote.
        const other = yield* as(sessions.create(campaignId, { number: 13 }));
        yield* as(campaigns.update(campaignId, { currentSessionId: other.id }));

        const endedAt = yield* DateTime.now;
        yield* as(sessions.update(campaignId, sessionId, { endedAt }));

        expect(yield* currentSessionId(campaignId)).toEqual(other.id);
      }).pipe(Effect.orDie),
    );
  }, 60_000);
});

describe("ending a fight is not finishing the night", () => {
  it("leaves the DM in the session, able to start the next encounter", async () => {
    // `EndRunDialog` offers two endings of different sizes and defaults to the
    // smaller one. Collapsing them would take the session away from a DM who
    // only closed a fight — so the distinction is pinned here rather than left
    // to the dialog that documents it.
    await runtime.runPromise(
      Effect.gen(function* () {
        const { as, dm, sessions, campaignId, encounterId, sessionId } = yield* makeFixture;
        const runs = yield* EncounterRuns;

        const first = yield* runs.start(dm, sessionId, { encounterId });
        yield* runs.end(dm, sessionId, first.id);

        const session = yield* as(sessions.findById(campaignId, sessionId));
        expect(session.endedAt).toBeNull();
        expect(yield* currentSessionId(campaignId)).toEqual(sessionId);

        // And the next fight goes on the same night: the partial unique index
        // allows it precisely because the first run has ended.
        const second = yield* runs.start(dm, sessionId, { encounterId });
        expect(second.id).not.toEqual(first.id);
        expect(second.endedAt).toBeNull();
      }).pipe(Effect.orDie),
    );
  }, 60_000);
});

describe("a session carrying an end time", () => {
  it("cannot be made the campaign's current session", async () => {
    const failure = await runtime.runPromise(
      Effect.gen(function* () {
        const { as, campaigns, sessions, campaignId, sessionId } = yield* makeFixture;
        const endedAt = yield* DateTime.now;
        yield* as(sessions.update(campaignId, sessionId, { endedAt }));

        return yield* as(campaigns.update(campaignId, { currentSessionId: sessionId })).pipe(
          Effect.flip,
        );
      }).pipe(Effect.orDie),
    );

    // Not `NotFound`: the DM can see this session perfectly well, and the
    // honest answer is that the night is over.
    expect(failure).toBeInstanceOf(Conflict);
  }, 60_000);

  it("is refused to a campaign that is not the caller's, as NotFound", async () => {
    // The neighbouring refusal, so the `Conflict` above is known to be about
    // the end time and not about reachability. Saying "it exists but is not
    // yours" would itself be a disclosure.
    const failure = await runtime.runPromise(
      Effect.gen(function* () {
        const mine = yield* makeFixture;
        const theirs = yield* makeFixture;

        return yield* mine
          .as(mine.campaigns.update(mine.campaignId, { currentSessionId: theirs.sessionId }))
          .pipe(Effect.flip);
      }).pipe(Effect.orDie),
    );

    expect(failure).toBeInstanceOf(NotFound);
    expect((failure as NotFound).resource).toEqual("session");
  }, 60_000);

  it("is refused by the schema, not only by the repository", async () => {
    // The invariant stated directly, one level below every code path that
    // could forget it: raw SQL, no repository, no actor. A client this server
    // has never met cannot represent the bad state either.
    //
    // Both directions of the same pair — stamping the end time under a live
    // pointer, and aiming the pointer at an already-finished session.
    const errors = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const { as, sessions, campaignId, sessionId } = yield* makeFixture;

        const finishWithoutClearing = yield* sql`
          update session set ended_at = now() where id = ${sessionId}
        `.pipe(Effect.flip, Effect.map(describe_));

        // Now finish it properly, and try to point back at it.
        const endedAt = yield* DateTime.now;
        yield* as(sessions.update(campaignId, sessionId, { endedAt }));
        const pointAtFinished = yield* sql`
          update campaign set current_session_id = ${sessionId} where id = ${campaignId}
        `.pipe(Effect.flip, Effect.map(describe_));

        return { finishWithoutClearing, pointAtFinished };
      }).pipe(Effect.orDie),
    );

    expect(errors.finishWithoutClearing).toContain("campaign_current_session_id_fkey");
    expect(errors.pointAtFinished).toContain("campaign_current_session_id_fkey");
  }, 60_000);
});
