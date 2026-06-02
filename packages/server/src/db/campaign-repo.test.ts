import * as Campaign from "@app/domain/api/campaign-rpc";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as PgMigrator from "@effect/sql-pg/PgMigrator";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Migrator from "effect/unstable/sql/Migrator";
import { CampaignRepo } from "./campaign-repo.js";
import { ChatRepo } from "./chat-repo.js";
import { PgTest, withTransactionRollback } from "./pg-test.js";
import { CampaignModel } from "./campaign-model.js";

const TestMigrationLayer = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts")),
}).pipe(Layer.provide(NodeServices.layer), Layer.orDie);

const TestLive = Layer.mergeAll(
  Layer.effect(CampaignRepo, CampaignRepo.make),
  Layer.effect(ChatRepo, ChatRepo.make),
).pipe(Layer.provideMerge(TestMigrationLayer), Layer.provideMerge(PgTest));

describe("CampaignRepo", () => {
  it.layer(TestLive, { timeout: "30 seconds" })("integration", (it) => {
    it.effect(
      "create stores a Campaign for a user with a default Conversation",
      () =>
        withTransactionRollback(
          Effect.gen(function* () {
            const campaigns = yield* CampaignRepo;
            const chats = yield* ChatRepo;

            const campaign = yield* campaigns.insert(
              CampaignModel.insert.make({
                userId: "user-1",
                title: "The Dawn Marches",
              }),
            );

            const defaultChat = yield* chats.create({
              userId: "user-1",
              title: "General",
              model: "qwen3-0.6b",
              campaignId: campaign.id,
            });

            const chat = yield* chats.findById(
              defaultChat.id,
              "user-1",
              campaign.id,
            );

            expect(campaign.title).toBe("The Dawn Marches");
            expect(campaign.userId).toBe("user-1");
            expect(chat.id).toBe(defaultChat.id);
          }),
        ),
    );

    it.effect("listByUser returns only the user's Campaigns", () =>
      withTransactionRollback(
        Effect.gen(function* () {
          const campaigns = yield* CampaignRepo;
          yield* campaigns.insert(
            CampaignModel.insert.make({
              userId: "user-1",
              title: "Mine",
            }),
          );

          yield* campaigns.insert(
            CampaignModel.insert.make({
              userId: "user-2",
              title: "Theirs",
            }),
          );

          const result = yield* campaigns.fetch("user-1", Option.none());

          expect(result.items.map((campaign) => campaign.title)).toEqual([
            "Mine",
          ]);
        }),
      ),
    );

    it.effect("findById fails when the Campaign does not exist", () =>
      withTransactionRollback(
        Effect.gen(function* () {
          const campaigns = yield* CampaignRepo;
          const fakeId = Campaign.CampaignId.make(
            "00000000-0000-4000-8000-000000000099",
          );

          const exit = yield* campaigns.findById(fakeId).pipe(Effect.exit);

          expect(exit._tag).toBe("Failure");
        }),
      ),
    );
  });
});
