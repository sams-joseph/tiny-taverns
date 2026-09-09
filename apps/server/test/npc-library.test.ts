import { type Actor, CurrentActor, NotFound } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { CampaignCreatorActors } from "../src/repo/CreatorActor.js";
import { Groups } from "../src/repo/Groups.js";
import { Invites } from "../src/repo/Invites.js";
import { LibraryShares } from "../src/repo/LibraryShares.js";
import { NpcKnowledge } from "../src/repo/NpcKnowledge.js";
import { NpcMemories } from "../src/repo/NpcMemories.js";
import { NpcAwareness } from "../src/repo/NpcAwareness.js";
import { Npcs } from "../src/repo/Npcs.js";
import { NpcThreads } from "../src/repo/NpcThreads.js";
import { aGroupMemberAt, anAccount, createCampaign } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Accounts.layer,
    Campaigns.layer,
    CampaignCreatorActors.layer,
    Groups.layer,
    Invites.layer,
    LibraryShares.layer,
    Npcs.layer,
    NpcKnowledge.layer,
    NpcMemories.layer,
    NpcAwareness.layer.pipe(Layer.provide([NpcKnowledge.layer, NpcMemories.layer])),
    NpcThreads.layer,
  ).pipe(Layer.provideMerge(migratedDatabase("taverns_test_npc_library"))),
);
afterAll(() => runtime.dispose());

const withActor =
  (actor: Actor) =>
  <A, E, R>(effect: Effect.Effect<A, E, R | CurrentActor>) =>
    Effect.provideService(effect, CurrentActor, actor);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run: <A, E>(effect: Effect.Effect<A, E, any>) => Promise<A> = (effect) =>
  runtime.runPromise(effect as never);

const makeFixture = Effect.gen(function* () {
  const campaigns = yield* Campaigns;
  const npcs = yield* Npcs;
  const sql = yield* SqlClient.SqlClient;

  const jo = yield* anAccount("Jo");
  const saltRoad = yield* withActor(jo)(
    createCampaign({ name: "The Salt Road", visibility: "shared" }),
  );
  const groupId = saltRoad.groupId;
  const joCreator = yield* withActor(jo)(
    CampaignCreatorActors.pipe(Effect.flatMap((c) => c.of(saltRoad.id))),
  );

  const wren = yield* aGroupMemberAt(saltRoad.id, "Wren");
  const hag = yield* withActor(wren)(
    campaigns.create(groupId, { name: "The Hag's Bargain", visibility: "shared" }),
  ).pipe(Effect.orDie);
  const wrenCreator = yield* withActor(wren)(
    CampaignCreatorActors.pipe(Effect.flatMap((c) => c.of(hag.id))),
  );

  const fen = yield* anAccount("Fen");
  const elsewhere = yield* withActor(fen)(
    createCampaign({ name: "Elsewhere", visibility: "shared" }),
  );
  const fenCreator = yield* withActor(fen)(
    CampaignCreatorActors.pipe(Effect.flatMap((c) => c.of(elsewhere.id))),
  );

  const source = yield* withActor(jo)(
    npcs.libraryCreate({
      name: "Cazril",
      role: "ferryman",
      persona: { identity: { summary: "Takes names, not coin." } },
      privateMaterial: { secrets: "SOURCE-SECRET" },
    }),
  );
  yield* withActor(jo)(
    Effect.flatMap(LibraryShares, (s) => s.share(groupId, { kind: "npc", resourceId: source.id })),
  );

  const [sharedFact] = yield* sql<{ readonly id: string }>`
    insert into npc_knowledge_fact ${sql.insert({
      npc_id: source.id,
      body: "SHARED-FACT knows the old ford.",
      visibility: "shared",
    })} returning id
  `;
  const [privateFact] = yield* sql<{ readonly id: string }>`
    insert into npc_knowledge_fact ${sql.insert({
      npc_id: source.id,
      body: "PRIVATE-FACT keeps a hag's coin.",
    })} returning id
  `;
  yield* sql`
    insert into npc_memory ${sql.insert({
      npc_id: source.id,
      body: "SHARED-MEMORY the party promised a name.",
      status: "approved",
      approved_at: new Date(),
      visibility: "shared",
    })}
  `;
  yield* sql`
    insert into npc_memory ${sql.insert({
      npc_id: source.id,
      body: "PRIVATE-MEMORY owes years.",
      status: "approved",
      approved_at: new Date(),
    })}
  `;

  const unshared = yield* withActor(wren)(npcs.libraryCreate({ name: "Unshared Wren" }));

  return {
    jo,
    wren,
    fen,
    groupId,
    saltRoad,
    hag,
    elsewhere,
    joCreator,
    wrenCreator,
    fenCreator,
    source,
    unshared,
    sharedFact,
    privateFact,
  };
});

let fixture: Effect.Success<typeof makeFixture>;
beforeAll(async () => {
  fixture = await runtime.runPromise(makeFixture.pipe(Effect.orDie));
}, 60_000);

describe("NPC Library sources", () => {
  it("keeps Libraries account-owned and does not leak group-shared originals into a groupmate's shelf", async () => {
    const seen = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const jo = yield* withActor(fixture.jo)(npcs.library({}));
        const wren = yield* withActor(fixture.wren)(npcs.library({}));
        const fen = yield* withActor(fixture.fen)(npcs.library({}));
        return { jo, wren, fen };
      }),
    );

    expect(seen.jo.map((npc) => npc.name)).toEqual(["Cazril"]);
    expect(seen.wren.map((npc) => npc.name)).toEqual(["Unshared Wren"]);
    expect(seen.fen).toEqual([]);
  });

  it("copies a shared source into two campaigns as independent snapshots", async () => {
    const seen = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const knowledge = yield* NpcKnowledge;
        const memories = yield* NpcMemories;
        const joCopy = yield* npcs.copyFromSource(fixture.joCreator, fixture.source.id);
        const wrenCopy = yield* npcs.copyFromSource(fixture.wrenCreator, fixture.source.id);
        yield* withActor(fixture.jo)(
          npcs.libraryUpdate(fixture.source.id, { name: "Cazril changed" }),
        );
        const joAfter = yield* npcs.findById(fixture.joCreator, joCopy.id);
        const wrenAfter = yield* npcs.findById(fixture.wrenCreator, wrenCopy.id);
        const joFacts = yield* knowledge.list(fixture.joCreator, joCopy.id);
        const wrenFacts = yield* knowledge.list(fixture.wrenCreator, wrenCopy.id);
        const joMemories = yield* memories.list(fixture.joCreator, joCopy.id);
        const wrenMemories = yield* memories.list(fixture.wrenCreator, wrenCopy.id);
        return { joAfter, wrenAfter, joFacts, wrenFacts, joMemories, wrenMemories };
      }),
    );

    expect(seen.joAfter.name).toBe("Cazril");
    expect(seen.wrenAfter.name).toBe("Cazril");
    expect(seen.joAfter.derivedFrom).toBe(fixture.source.id);
    expect(seen.joAfter.derivedFromVersion).toBe(fixture.source.version);
    expect(seen.wrenAfter.derivedFromVersion).toBe(fixture.source.version);
    expect(seen.joAfter.privateMaterial).toEqual({ secrets: "SOURCE-SECRET" });
    expect(seen.wrenAfter.privateMaterial).toEqual({});
    expect(seen.joFacts.map((fact) => fact.body).sort()).toEqual([
      "PRIVATE-FACT keeps a hag's coin.",
      "SHARED-FACT knows the old ford.",
    ]);
    expect(seen.wrenFacts.map((fact) => fact.body)).toEqual(["SHARED-FACT knows the old ford."]);
    expect(seen.joMemories.map((memory) => memory.body).sort()).toEqual([
      "PRIVATE-MEMORY owes years.",
      "SHARED-MEMORY the party promised a name.",
    ]);
    expect(seen.wrenMemories.map((memory) => memory.body)).toEqual([
      "SHARED-MEMORY the party promised a name.",
    ]);
  });

  it("withdrawal, archive and delete affect future copies only", async () => {
    const seen = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const shares = yield* LibraryShares;
        const renamed = yield* withActor(fixture.jo)(
          npcs.libraryUpdate(fixture.source.id, { name: "Cazril before deletion" }),
        );
        const before = yield* npcs.copyFromSource(fixture.wrenCreator, renamed.id);
        yield* withActor(fixture.jo)(
          shares.unshare(fixture.groupId, { kind: "npc", resourceId: renamed.id }),
        );
        const afterUnshare = yield* Effect.result(
          npcs.copyFromSource(fixture.wrenCreator, renamed.id),
        );
        const ownerCopy = yield* npcs.copyFromSource(fixture.joCreator, renamed.id);
        yield* withActor(fixture.jo)(npcs.libraryArchive(renamed.id));
        const afterArchive = yield* Effect.result(
          npcs.copyFromSource(fixture.joCreator, renamed.id),
        );
        yield* withActor(fixture.jo)(npcs.libraryRemove(renamed.id));
        const surviving = yield* npcs.findById(fixture.wrenCreator, before.id);
        const ownerSurviving = yield* npcs.findById(fixture.joCreator, ownerCopy.id);
        return { afterUnshare, afterArchive, surviving, ownerSurviving };
      }),
    );

    expect(seen.afterUnshare._tag).toBe("Failure");
    expect(seen.afterUnshare._tag === "Failure" && seen.afterUnshare.failure).toBeInstanceOf(
      NotFound,
    );
    expect(seen.afterArchive._tag).toBe("Failure");
    expect(seen.surviving.name).toBe("Cazril before deletion");
    expect(seen.surviving.derivedFrom).toBeNull();
    expect(seen.surviving.derivedFromName).toBe("Cazril before deletion");
    expect(seen.ownerSurviving.name).toBe("Cazril before deletion");
  });

  it("refuses cross-account and unshared sources", async () => {
    const refused = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const directFind = yield* withActor(fixture.fen)(
          Effect.result(npcs.libraryFindById(fixture.source.id)),
        );
        const strangerCopy = yield* Effect.result(
          npcs.copyFromSource(fixture.fenCreator, fixture.source.id),
        );
        const groupmateUnshared = yield* Effect.result(
          npcs.copyFromSource(fixture.joCreator, fixture.unshared.id),
        );
        return { directFind, strangerCopy, groupmateUnshared };
      }),
    );

    expect(refused.directFind._tag).toBe("Failure");
    expect(refused.strangerCopy._tag).toBe("Failure");
    expect(refused.groupmateUnshared._tag).toBe("Failure");
  });

  it("keeps source conversations out of campaign snapshots", async () => {
    const counts = await run(
      Effect.gen(function* () {
        const npcs = yield* Npcs;
        const threads = yield* NpcThreads;
        const sql = yield* SqlClient.SqlClient;
        const source = yield* withActor(fixture.jo)(
          npcs.libraryCreate({ name: "Threaded source" }),
        );
        yield* sql`insert into npc_thread ${sql.insert({ npc_id: source.id, channel: "rehearsal", title: "source rehearsal" })}`;
        const copy = yield* npcs.copyFromSource(fixture.joCreator, source.id);
        const rows = yield* sql<{
          readonly count: number;
        }>`select count(*)::int as count from npc_thread where npc_id = ${copy.id}`;
        const listed = yield* threads.list(fixture.joCreator, copy.id);
        return { raw: rows[0]!.count, listed: listed.length };
      }),
    );

    expect(counts).toEqual({ raw: 0, listed: 0 });
  });
});
