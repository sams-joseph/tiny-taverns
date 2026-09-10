import {
  type Actor,
  type Campaign,
  Conflict,
  CurrentActor,
  type SharedWorldId,
  NotFound,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { Beats } from "../src/repo/Beats.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { GroupHistory } from "../src/repo/GroupHistory.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { Recap } from "../src/repo/Recap.js";
import { Sessions } from "../src/repo/Sessions.js";
import {
  aGroupBy,
  aGroupMemberAt,
  anAccount,
  asDm,
  createCampaign,
  scopedToGroup,
} from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The group's chronicle — report §3.5, under the group-Hob boundary decision
 * of 2026-09-01.
 *
 * The property everything here converges on: **an entry is a copy, admitted
 * on purpose, and the group never reads through a campaign.** So the flagship
 * tests are the copy surviving what its source cannot — the beat edited after
 * sharing, the campaign deleted outright — and the boundary holding at the
 * seams: a member reads, a stranger gets the ordinary 404, sharing a night is
 * the creator's act alone, and an unplayed night is refused because the
 * chronicle records what has *happened*.
 */

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    Groups.layer,
    GroupHistory.layer.pipe(Layer.provide(Recap.layer)),
    Invites.layer,
    Recap.layer,
    Sessions.layer.pipe(Layer.provide(LiveEvents.layer)),
    Beats.layer.pipe(Layer.provide(LiveEvents.layer)),
    CampaignCreatorActors.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_group_history"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A> = (effect) =>
  runtime.runPromise(effect as never);

/**
 * Jo's group holds two campaigns — Jo's own, and one Wren (a live member)
 * created in it — because acceptance order across campaigns is the thing a
 * single-campaign fixture cannot show. Fen is a stranger with a group of
 * their own.
 */
const makeFixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const campaigns = yield* Campaigns;
  const sessions = yield* Sessions;
  const beats = yield* Beats;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(createCampaign({ name: "The Salt Road" }));
  const groupId = saltRoad.contextId;

  // Wren joins the group through a real invitation and creates a campaign in
  // it — eligibility (group membership) becoming a table of their own.
  const wren = yield* aGroupMemberAt(saltRoad.id, "Wren");
  const hagsBargain = yield* withActor(wren)(
    campaigns.create(groupId, { name: "The Hag's Bargain" }),
  ).pipe(Effect.orDie);

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(createCampaign({ name: "Salt and Sixpence" }));

  // A played night on the Salt Road: created, stamped as started through the
  // shipped PATCH (the same write `session/start.ts` makes), with one beat.
  const night = yield* withActor(jo)(
    sessions.create(saltRoad.id, { number: 12, title: "The crossing" }),
  ).pipe(Effect.orDie);
  yield* withActor(jo)(
    sessions.update(saltRoad.id, night.id, { startedAt: DateTime.nowUnsafe() }),
  ).pipe(Effect.orDie);
  yield* withActor(jo)(
    beats.create(saltRoad.id, night.id, { body: "The ferryman is called Cazril." }),
  ).pipe(Effect.orDie);

  // An unplayed night beside it, for the Conflict.
  const planned = yield* withActor(jo)(
    sessions.create(saltRoad.id, { number: 13, title: "The reeds" }),
  ).pipe(Effect.orDie);

  return { sql, jo, wren, fen, groupId, saltRoad, hagsBargain, elsewhere, night, planned };
});

interface Fixture {
  readonly sql: SqlClient.SqlClient;
  readonly jo: Actor;
  readonly wren: Actor;
  readonly fen: Actor;
  readonly groupId: SharedWorldId;
  readonly saltRoad: Campaign;
  readonly hagsBargain: Campaign;
  readonly elsewhere: Campaign;
  readonly night: { readonly id: import("@taverns/api").SessionId };
  readonly planned: { readonly id: import("@taverns/api").SessionId };
}

let fixture: Fixture;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
});

const history = <A, E>(
  use: (service: GroupHistory["Service"]) => Effect.Effect<A, E, CurrentActor>,
  actor: Actor,
) => run(withActor(actor)(Effect.flatMap(GroupHistory, use)));

describe("who may read the chronicle", () => {
  it("answers any live member and refuses a stranger with the ordinary 404", async () => {
    expect(await history((h) => h.list(fixture.groupId), fixture.wren)).toBeDefined();
    const refused = await run(
      withActor(fixture.fen)(Effect.flatMap(GroupHistory, (h) => h.list(fixture.groupId))).pipe(
        Effect.flip,
      ),
    );
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("shared-world");
  });

  it("keeps a credential scoped to another group out", async () => {
    const scoped = scopedToGroup(fixture.jo, fixture.elsewhere.contextId);
    const refused = await run(
      withActor(scoped)(Effect.flatMap(GroupHistory, (h) => h.list(fixture.groupId))).pipe(
        Effect.flip,
      ),
    );
    expect(refused).toBeInstanceOf(NotFound);
  });
});

describe("writing it by hand", () => {
  it("takes a member's entry and answers it back, newest admitted first", async () => {
    const entry = await history(
      (h) =>
        h.create(fixture.groupId, {
          title: "The two tables met",
          body: "Both parties reached the crossing on the same night.",
        }),
      fixture.wren,
    );
    expect(entry.sourceKind).toBe("manual");
    expect(entry.createdByAccountId).toBe(fixture.wren.accountId);

    const listed = await history((h) => h.list(fixture.groupId), fixture.jo);
    expect(listed[0]?.id).toBe(entry.id);
  });

  it("refuses a provenance pointer into another group, as the ordinary 404", async () => {
    const refused = await run(
      withActor(fixture.jo)(
        Effect.flatMap(GroupHistory, (h) =>
          h.create(fixture.groupId, { body: "smuggled", campaignId: fixture.elsewhere.id }),
        ),
      ).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("campaign");
  });
});

describe("sharing a played night", () => {
  it("copies the recap into the chronicle, beats verbatim", async () => {
    const entry = await run(
      Effect.gen(function* () {
        const h = yield* GroupHistory;
        const proof = yield* asDm(fixture.jo, fixture.saltRoad.id);
        return yield* withActor(fixture.jo)(h.fromRecap(fixture.groupId, proof, fixture.night.id));
      }),
    );
    expect(entry.sourceKind).toBe("recap");
    expect(entry.title).toBe("Session 12 — The crossing");
    expect(entry.body).toContain("The ferryman is called Cazril.");
    expect(entry.campaignId).toBe(fixture.saltRoad.id);
    expect(entry.occurredAt).not.toBeNull();
  });

  it("is the creator's act: another member's proof does not exist to spend", async () => {
    // Wren is a live member of the group and still cannot share Jo's night —
    // the proof fails, which is the gate answering before any read happens.
    const refused = await run(asDm(fixture.wren, fixture.saltRoad.id).pipe(Effect.flip));
    expect(refused).toBeInstanceOf(NotFound);
  });

  it("refuses a proof spent at another group's chronicle", async () => {
    // Jo founds a second group; their Salt Road proof names the first. The
    // refusal is the ordinary 404 naming the campaign — the same sentence a
    // stranger would get, because "your campaign is not of this group" is
    // already the whole answer.
    const secondGroup = await run(aGroupBy(fixture.jo, "Jo's other circle"));
    const refused = await run(
      Effect.gen(function* () {
        const h = yield* GroupHistory;
        const proof = yield* asDm(fixture.jo, fixture.saltRoad.id);
        return yield* withActor(fixture.jo)(h.fromRecap(secondGroup, proof, fixture.night.id));
      }).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(NotFound);
    expect((refused as NotFound).resource).toBe("campaign");
  });

  it("refuses an unplayed night: the chronicle records what happened", async () => {
    const refused = await run(
      Effect.gen(function* () {
        const h = yield* GroupHistory;
        const proof = yield* asDm(fixture.jo, fixture.saltRoad.id);
        return yield* withActor(fixture.jo)(
          h.fromRecap(fixture.groupId, proof, fixture.planned.id),
        );
      }).pipe(Effect.flip),
    );
    expect(refused).toBeInstanceOf(Conflict);
  });
});

describe("the copy is a copy", () => {
  it("does not change when the source does, and survives the campaign whole", async () => {
    // A fresh campaign of Wren's, played, shared, then edited and deleted —
    // the entry must not notice any of it.
    const { entryId, body } = await run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const campaigns = yield* Campaigns;
        const sessions = yield* Sessions;
        const beats = yield* Beats;
        const h = yield* GroupHistory;

        const doomed = yield* withActor(fixture.wren)(
          campaigns.create(fixture.groupId, { name: "The Short Campaign" }),
        );
        const night = yield* withActor(fixture.wren)(sessions.create(doomed.id, { number: 1 }));
        yield* withActor(fixture.wren)(
          sessions.update(doomed.id, night.id, { startedAt: DateTime.nowUnsafe() }),
        );
        const beat = yield* withActor(fixture.wren)(
          beats.create(doomed.id, night.id, { body: "It rained." }),
        );
        const proof = yield* asDm(fixture.wren, doomed.id);
        const entry = yield* withActor(fixture.wren)(h.fromRecap(fixture.groupId, proof, night.id));

        // Edit the source after sharing…
        yield* withActor(fixture.wren)(
          beats.update(doomed.id, night.id, beat.id, { body: "It was sunny, actually." }),
        );
        // …and then take the whole campaign away. Raw SQL, because the product
        // deliberately has no campaign delete — this is the strongest form of
        // "the group's memory outlives the campaign".
        yield* sql`delete from campaign where id = ${doomed.id}`;

        return { entryId: entry.id, body: entry.body };
      }),
    );
    expect(body).toContain("It rained.");

    const listed = await history((h) => h.list(fixture.groupId), fixture.jo);
    const survived = listed.find((entry) => entry.id === entryId);
    expect(survived).toBeDefined();
    expect(survived!.body).toContain("It rained.");
    // The pointer went null; the memory did not.
    expect(survived!.campaignId).toBeNull();
  });
});

describe("the summary", () => {
  it("is null until one is accepted, then the accepted one, and only one may be", async () => {
    expect(await history((h) => h.summary(fixture.groupId), fixture.jo)).toBeNull();

    await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          insert into group_history_summary (group_id, status, last_group_seq, text, origin)
          values (${fixture.groupId}, 'accepted', 1, 'The story so far.', 'authored')
        `,
      ),
    );
    const summary = await history((h) => h.summary(fixture.groupId), fixture.wren);
    expect(summary?.text).toBe("The story so far.");

    // A second accepted summary for the same group is unrepresentable — the
    // partial unique index, held against raw SQL rather than a rule someone
    // remembers.
    const refused = await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          insert into group_history_summary (group_id, status, last_group_seq, text, origin)
          values (${fixture.groupId}, 'accepted', 2, 'A second answer.', 'authored')
        `,
      ).pipe(Effect.flip),
    );
    expect(refused).toBeDefined();
  });
});

describe("cross-group isolation", () => {
  it("keeps one group's chronicle out of another's entirely", async () => {
    await history((h) => h.create(fixture.elsewhere.contextId, { body: "Fen's own" }), fixture.fen);
    const joSees = await history((h) => h.list(fixture.groupId), fixture.jo);
    expect(joSees.some((entry) => entry.body === "Fen's own")).toBe(false);
  });
});
