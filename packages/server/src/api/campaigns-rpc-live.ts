import { CampaignModel } from "@/db/campaign-model";
import { CampaignRepo } from "@/db/campaign-repo.js";
import { ChatRepo } from "@/db/chat-repo.js";
import { ensureOwnership } from "@/lib/ensureOwnership";
import * as Campaign from "@app/domain/api/campaign-rpc";
import { CurrentUser } from "@app/domain/auth";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Rpc from "effect/unstable/rpc/Rpc";

export const CampaignRpcHandler = Campaign.CampaignRpc.toLayer(
  Effect.gen(function* () {
    const campaignRepo = yield* CampaignRepo;
    const chatRepo = yield* ChatRepo;

    return Campaign.CampaignRpc.of({
      campaign_create: Effect.fnUntraced(function* (payload) {
        const currentUser = yield* CurrentUser;
        const campaign = yield* campaignRepo
          .insert(
            CampaignModel.insert.make({
              userId: currentUser.id,
              title: payload.title,
            }),
          )
          .pipe(
            Effect.catchTags({
              SqlError: Effect.die,
              SchemaError: Effect.die,
            }),
          );

        yield* chatRepo.create({
          userId: currentUser.id,
          campaignId: campaign.id,
          title: "General",
          model: "qwen3-0.6b" as const,
        });
        return campaign;
      }),

      campaign_list: Effect.fnUntraced(function* (payload) {
        const currentUser = yield* CurrentUser;
        const cursor =
          payload.cursor === null ? Option.none() : Option.some(payload.cursor);
        return yield* campaignRepo.fetch(currentUser.id, cursor);
      }),

      campaign_get: Effect.fnUntraced(function* (payload) {
        const currentUser = yield* CurrentUser;
        return yield* campaignRepo.findById(payload.campaignId).pipe(
          Effect.flatMap(ensureOwnership(currentUser.id)),
          Effect.catchTags({
            SqlError: (err) => Effect.die(err),
            SchemaError: (err) => Effect.die(err),
          }),
          Effect.mapError(
            () =>
              new Campaign.CampaignNotFoundError({ id: payload.campaignId }),
          ),
        );
      }),
    });
  }),
);

export const CampaignRpcLive: Layer.Layer<
  | Rpc.Handler<"campaign_create">
  | Rpc.Handler<"campaign_list">
  | Rpc.Handler<"campaign_get">
> = CampaignRpcHandler.pipe(
  Layer.provide(CampaignRepo.layer),
  Layer.provide(ChatRepo.layer),
);
