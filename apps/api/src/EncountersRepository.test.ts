import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CampaignsRepository } from "./CampaignsRepository.js";
import { EncountersRepository } from "./EncountersRepository.js";

const layer = Layer.mergeAll(
  CampaignsRepository.DefaultWithoutDependencies,
  EncountersRepository.DefaultWithoutDependencies,
).pipe(Layer.provide(PgContainer.Live));

it.layer(layer, { timeout: "30 seconds" })("EncountersRepository", (it) => {
  it.effect(
    "should create an encounter",
    Effect.fnUntraced(function* () {
      const campaigns = yield* CampaignsRepository;
      const encounters = yield* EncountersRepository;

      const campaign = yield* campaigns.create({
        name: "test-encounter-campaign",
        description: "test-encounter-campaign-description",
      });

      const encounter = yield* encounters.create({
        name: "test-encounter",
        campaignId: campaign.id,
        phase: "exploration",
      });

      expect(encounter).toBeDefined();
      expect(encounter.name).toBe("test-encounter");
      expect(encounter.campaignId).toBe(campaign.id);
    }),
  );

  it.effect(
    "should find all encounters",
    Effect.fnUntraced(function* () {
      const campaigns = yield* CampaignsRepository;
      const encounters = yield* EncountersRepository;

      const campaign = yield* campaigns.create({
        name: "test-encounter-campaign-find",
        description: "test-encounter-campaign-find-description",
      });

      const createdEncounter = yield* encounters.create({
        name: "test-encounter-find",
        campaignId: campaign.id,
        phase: "combat",
      });

      const encountersList = yield* encounters.findAll({});

      expect(encountersList.length).toBeGreaterThan(0);
      expect(encountersList).toContainEqual(createdEncounter);
    }),
  );
});
