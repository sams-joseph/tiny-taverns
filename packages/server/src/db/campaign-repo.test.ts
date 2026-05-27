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

const TestMigrationLayer = PgMigrator.layer({
  loader: Migrator.fromGlob(import.meta.glob("./migrations/*.ts")),
}).pipe(Layer.provide(NodeServices.layer), Layer.orDie);

const TestLive = Layer.mergeAll(
  Layer.effect(CampaignRepo, CampaignRepo.make),
  Layer.effect(ChatRepo, ChatRepo.make),
).pipe(
  Layer.provideMerge(TestMigrationLayer),
  Layer.provideMerge(PgTest),
);

describe("CampaignRepo", () => {
  it.layer(TestLive, { timeout: "30 seconds" })("integration", (it) => {
    it.effect("create stores a Campaign for a user with a default Conversation", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const campaigns = yield* CampaignRepo;
          const chats = yield* ChatRepo;
          const defaultChat = yield* chats.create({
            userId: "user-1",
            title: "General",
            model: "qwen3-0.6b",
          });

          const campaign = yield* campaigns.create({
            userId: "user-1",
            title: "The Dawn Marches",
            defaultChatId: defaultChat.id,
          });

          expect(campaign.title).toBe("The Dawn Marches");
          expect(campaign.userId).toBe("user-1");
          expect(campaign.defaultChatId).toBe(defaultChat.id);
        }),
      ));

    it.effect("listByUser returns only the user's Campaigns", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const campaigns = yield* CampaignRepo;
          const chats = yield* ChatRepo;
          const userOneChat = yield* chats.create({
            userId: "user-1",
            title: "General",
            model: "qwen3-0.6b",
          });
          const userTwoChat = yield* chats.create({
            userId: "user-2",
            title: "General",
            model: "qwen3-0.6b",
          });
          yield* campaigns.create({
            userId: "user-1",
            title: "Mine",
            defaultChatId: userOneChat.id,
          });
          yield* campaigns.create({
            userId: "user-2",
            title: "Theirs",
            defaultChatId: userTwoChat.id,
          });

          const result = yield* campaigns.listByUser("user-1", Option.none());

          expect(result.items.map((campaign) => campaign.title)).toEqual(["Mine"]);
        }),
      ));

    it.effect("findById fails when the Campaign belongs to another user", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const campaigns = yield* CampaignRepo;
          const chats = yield* ChatRepo;
          const defaultChat = yield* chats.create({
            userId: "user-1",
            title: "General",
            model: "qwen3-0.6b",
          });
          const campaign = yield* campaigns.create({
            userId: "user-1",
            title: "Secret",
            defaultChatId: defaultChat.id,
          });

          const exit = yield* campaigns.findById(campaign.id, "user-2").pipe(Effect.exit);

          expect(exit._tag).toBe("Failure");
        }),
      ));

    it.effect("findById fails when the Campaign does not exist", () =>
      withTransactionRollback(
        Effect.gen(function*() {
          const campaigns = yield* CampaignRepo;
          const fakeId = Campaign.CampaignId.make("00000000-0000-4000-8000-000000000099");

          const exit = yield* campaigns.findById(fakeId, "user-1").pipe(Effect.exit);

          expect(exit._tag).toBe("Failure");
        }),
      ));
  });
});
