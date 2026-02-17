import { PgContainer } from "./lib/test-utils/pg-container.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CampaignsRepository } from "./CampaignsRepository.js";
import { EncountersRepository } from "./EncountersRepository.js";
import { QuestsRepository } from "./QuestsRepository.js";

const layer = Layer.mergeAll(
  CampaignsRepository.DefaultWithoutDependencies,
  EncountersRepository.DefaultWithoutDependencies,
  QuestsRepository.DefaultWithoutDependencies,
).pipe(Layer.provide(PgContainer.Live));

it.layer(layer, { timeout: "30 seconds" })("QuestsRepository", (it) => {
  it.effect(
    "should create a quest",
    Effect.fnUntraced(function* () {
      const campaigns = yield* CampaignsRepository;
      const quests = yield* QuestsRepository;

      const campaign = yield* campaigns.create({
        name: "test-quest-campaign",
        description: "test-quest-campaign-description",
      });

      const quest = yield* quests.create({
        name: "test-quest",
        description: "test-quest-description",
        campaignId: campaign.id,
        rewards: {
          experience: 100,
          currency: 50,
        },
      });

      expect(quest).toBeDefined();
      expect(quest.name).toBe("test-quest");
      expect(quest.campaignId).toBe(campaign.id);
      expect(quest.rewards).toEqual({ experience: 100, currency: 50 });
    }),
  );

  it.effect(
    "should find all quests",
    Effect.fnUntraced(function* () {
      const campaigns = yield* CampaignsRepository;
      const quests = yield* QuestsRepository;

      const campaign = yield* campaigns.create({
        name: "test-quest-campaign-find",
        description: "test-quest-campaign-find-description",
      });

      const createdQuest = yield* quests.create({
        name: "test-quest-find",
        description: "test-quest-find-description",
        campaignId: campaign.id,
        rewards: {
          experience: 75,
          currency: 10,
        },
      });

      const questsList = yield* quests.findAll({});

      expect(questsList.length).toBeGreaterThan(0);
      expect(questsList).toContainEqual(createdQuest);
    }),
  );

  it.effect(
    "should link and list quest encounters",
    Effect.fnUntraced(function* () {
      const campaigns = yield* CampaignsRepository;
      const encounters = yield* EncountersRepository;
      const quests = yield* QuestsRepository;

      const campaign = yield* campaigns.create({
        name: "test-quest-encounter-campaign",
        description: "test-quest-encounter-campaign-description",
      });

      const quest = yield* quests.create({
        name: "test-quest-link",
        description: "test-quest-link-description",
        campaignId: campaign.id,
        rewards: {
          experience: 40,
          currency: 20,
        },
      });

      const encounter = yield* encounters.create({
        name: "test-encounter-link",
        campaignId: campaign.id,
        phase: "combat",
      });

      const link = yield* quests.linkEncounter({
        questId: quest.id,
        encounterId: encounter.id,
      });

      const forQuest = yield* quests.listEncountersForQuest({
        questId: quest.id,
      });

      const forEncounter = yield* quests.listQuestsForEncounter({
        encounterId: encounter.id,
      });

      expect(link).toEqual({ questId: quest.id, encounterId: encounter.id });
      expect(forQuest).toContainEqual(link);
      expect(forEncounter).toContainEqual(link);
    }),
  );
});
