import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer, Stream } from "effect";
import { DomainApi } from "@repo/domain";
import { MonstersApi } from "@repo/domain/MonstersApi";
import { CampaignsApi } from "@repo/domain/CampaignsApi";
import { MonstersRepository } from "./MonstersRepository.js";
import { CampaignsRepository } from "./CampaignsRepository.js";

const MonstersApiLive = HttpApiBuilder.group(
  MonstersApi,
  "monsters",
  (handlers) =>
    Effect.gen(function* () {
      const monsters = yield* MonstersRepository;
      return handlers
        .handle("getAllMonsters", ({ urlParams }) =>
          monsters.findAll(urlParams),
        )
        .handle("createMonster", ({ payload }) => monsters.create(payload));
    }),
);

const CampaignsApiLive = HttpApiBuilder.group(
  CampaignsApi,
  "campaigns",
  (handlers) =>
    Effect.gen(function* () {
      const campaigns = yield* CampaignsRepository;
      return handlers
        .handle("getAllCampaigns", ({ urlParams }) =>
          campaigns.findAll(urlParams),
        )
        .handle("createCampaign", ({ payload }) => campaigns.create(payload));
    }),
);

export const ApiLive = HttpApiBuilder.api(DomainApi).pipe(
  Layer.provide(MonstersApiLive),
  Layer.provide(CampaignsApiLive),
);
