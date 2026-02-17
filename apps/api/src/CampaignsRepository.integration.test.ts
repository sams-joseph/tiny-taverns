import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CampaignsRepository } from "./CampaignsRepository.js";

const layer = CampaignsRepository.DefaultWithoutDependencies.pipe(
  Layer.provide(PgContainer.Live),
);

it.layer(layer, { timeout: "30 seconds" })("CampaignsRepository", (it) => {
  it.effect(
    "should create a campaign",
    Effect.fnUntraced(function* () {
      const repo = yield* CampaignsRepository;
      const campaign = yield* repo.create({
        name: "test-campaign",
        description: "test-campaign-description",
      });

      expect(campaign).toBeDefined();
      expect(campaign.name).toBe("test-campaign");
    }),
  );

  it.effect(
    "should find all campaigns",
    Effect.fnUntraced(function* () {
      const repo = yield* CampaignsRepository;
      const createdCampaign = yield* repo.create({
        name: "test-campaign-find",
        description: "test-campaign-find-description",
      });

      const campaigns = yield* repo.findAll({});

      expect(campaigns.length).toBeGreaterThan(0);
      expect(campaigns).toContainEqual(createdCampaign);
    }),
  );
});
