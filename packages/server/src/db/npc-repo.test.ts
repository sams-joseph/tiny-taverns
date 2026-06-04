import * as Campaign from "@app/domain/api/campaign-rpc";
import * as Npc from "@app/domain/api/npc-rpc";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PgMigrator from "@effect/sql-pg/PgMigrator";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Migrator from "effect/unstable/sql/Migrator";
import { NpcModel } from "./npc-model.js";
import { NpcRepo } from "./npc-repo.js";
import { PgTest, withTransactionRollback } from "./pg-test.js";

const CAMPAIGN_ID = Campaign.CampaignId.make("00000000-0000-4000-8000-000000000010");
const OTHER_CAMPAIGN_ID = Campaign.CampaignId.make("00000000-0000-4000-8000-000000000011");

const TestMigrationLayer = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts")),
}).pipe(Layer.provide(NodeServices.layer), Layer.orDie);

const TestLive = Layer.mergeAll(Layer.effect(NpcRepo, NpcRepo.make)).pipe(
  Layer.provideMerge(TestMigrationLayer),
  Layer.provideMerge(PgTest),
);

describe("NpcRepo", () => {
  it.layer(TestLive, { timeout: "30 seconds" })("integration", (it) => {
    it.effect(
      "insert persists campaignId and returns it on the row",
      () =>
        withTransactionRollback(
          Effect.gen(function*() {
            const repo = yield* NpcRepo;
            const npc = yield* repo.insert(
              NpcModel.insert.make({
                userId: "user-1",
                campaignId: CAMPAIGN_ID,
                title: "Goblin King",
              }),
            );
            expect(npc.title).toBe("Goblin King");
            expect(npc.userId).toBe("user-1");
            expect(npc.campaignId).toBe(CAMPAIGN_ID);
            expect(npc.id).toBeDefined();
            expect(npc.createdAt).toBeDefined();
            expect(npc.updatedAt).toBeDefined();
          }),
        ),
    );

    it.effect("findById returns the row when (id, userId, campaignId) all match", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const repo = yield* NpcRepo;
          const created = yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: CAMPAIGN_ID,
              title: "Find Me",
            }),
          );
          const found = yield* repo.findById(created.id, "user-1", CAMPAIGN_ID);
          expect(found.id).toBe(created.id);
          expect(found.title).toBe("Find Me");
          expect(found.campaignId).toBe(CAMPAIGN_ID);
        }),
      ));

    it.effect("findById fails when campaignId does not match", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const repo = yield* NpcRepo;
          const created = yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: CAMPAIGN_ID,
              title: "Wrong Campaign",
            }),
          );
          const exit = yield* repo
            .findById(created.id, "user-1", OTHER_CAMPAIGN_ID)
            .pipe(Effect.exit);
          expect(exit._tag).toBe("Failure");
        }),
      ));

    it.effect("findById fails when userId does not match", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const repo = yield* NpcRepo;
          const created = yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: CAMPAIGN_ID,
              title: "Secret",
            }),
          );
          const exit = yield* repo
            .findById(created.id, "user-2", CAMPAIGN_ID)
            .pipe(Effect.exit);
          expect(exit._tag).toBe("Failure");
        }),
      ));

    it.effect("findById fails for a non-existent id", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const repo = yield* NpcRepo;
          const fakeId = Npc.NpcId.make("00000000-0000-4000-8000-000000000099");
          const exit = yield* repo.findById(fakeId, "user-1", CAMPAIGN_ID).pipe(Effect.exit);
          expect(exit._tag).toBe("Failure");
        }),
      ));

    it.effect("fetch returns only NPCs whose campaignId matches", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const repo = yield* NpcRepo;
          yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: CAMPAIGN_ID,
              title: "NPC A",
            }),
          );
          yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: CAMPAIGN_ID,
              title: "NPC B",
            }),
          );
          yield* repo.insert(
            NpcModel.insert.make({
              userId: "user-1",
              campaignId: OTHER_CAMPAIGN_ID,
              title: "NPC C",
            }),
          );

          const result = yield* repo.fetch("user-1", CAMPAIGN_ID, Option.none());
          expect(result.items).toHaveLength(2);
          expect(result.hasMore).toBe(false);
          const titles = result.items.map((n) => n.title);
          expect(titles).toContain("NPC A");
          expect(titles).toContain("NPC B");
          expect(titles).not.toContain("NPC C");
        }),
      ));

    it.effect(
      "fetch does not return NPCs from other users even within the same campaign",
      () =>
        withTransactionRollback(
          Effect.gen(function*() {
            const repo = yield* NpcRepo;
            yield* repo.insert(
              NpcModel.insert.make({
                userId: "user-1",
                campaignId: CAMPAIGN_ID,
                title: "Mine",
              }),
            );
            yield* repo.insert(
              NpcModel.insert.make({
                userId: "user-2",
                campaignId: CAMPAIGN_ID,
                title: "Theirs",
              }),
            );

            const result = yield* repo.fetch("user-1", CAMPAIGN_ID, Option.none());
            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.title).toBe("Mine");
            expect(result.items[0]!.userId).toBe("user-1");
          }),
        ),
    );

    it.effect(
      "fetch cursor pagination excludes items at or after the cursor",
      () =>
        withTransactionRollback(
          Effect.gen(function*() {
            const repo = yield* NpcRepo;
            yield* repo.insert(
              NpcModel.insert.make({
                userId: "user-1",
                campaignId: CAMPAIGN_ID,
                title: "Old",
              }),
            );
            const newer = yield* repo.insert(
              NpcModel.insert.make({
                userId: "user-1",
                campaignId: CAMPAIGN_ID,
                title: "New",
              }),
            );

            const result = yield* repo.fetch(
              "user-1",
              CAMPAIGN_ID,
              Option.some(newer.updatedAt),
            );
            expect(result.items.every((n) => n.title !== "New")).toBe(true);
          }),
        ),
    );
  });
});
