import { SqlClient, SqlSchema } from "@effect/sql";
import { PostgresClient } from "@repo/adapter-postgres/PostgresClient";
import { Effect, flow, Schema } from "effect";
import {
  CreateQuestPayload,
  Quest,
  QuestEncounterLink,
  QuestEncountersByEncounterPayload,
  QuestEncountersByQuestPayload,
  QuestEncounterLinkPayload,
} from "@repo/domain";

export class QuestsRepository extends Effect.Service<QuestsRepository>()(
  "api/QuestsRepository",
  {
    dependencies: [PostgresClient],
    effect: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findAll = SqlSchema.findAll({
        Result: Quest,
        Request: Schema.Struct({
          search: Schema.optional(Schema.NonEmptyTrimmedString),
          campaignId: Schema.optional(Schema.UUID),
        }),
        execute: (request) => sql`
          SELECT
            id,
            name,
            description,
            campaign_id,
            parent_quest_id,
            rewards
          FROM
            quests
          WHERE
            (${"search" in request && request.search ? sql`name ILIKE '%' || ${request.search} || '%'` : sql`TRUE`})
            AND
            (${"campaignId" in request && request.campaignId ? sql`campaign_id = ${request.campaignId}` : sql`TRUE`})
        `,
      });

      const create = SqlSchema.single({
        Result: Quest,
        Request: CreateQuestPayload,
        execute: (request) => sql`
          INSERT INTO
            quests ${sql.insert(request)}
          RETURNING
            *
        `,
      });

      const linkEncounter = SqlSchema.single({
        Result: QuestEncounterLink,
        Request: QuestEncounterLinkPayload,
        execute: (request) => sql`
          INSERT INTO
            quest_encounters ${sql.insert(request)}
          ON CONFLICT DO NOTHING
          RETURNING
            *
        `,
      });

      const unlinkEncounter = SqlSchema.single({
        Result: QuestEncounterLink,
        Request: QuestEncounterLinkPayload,
        execute: (request) => sql`
          DELETE FROM
            quest_encounters
          WHERE
            quest_id = ${request.questId}
            AND encounter_id = ${request.encounterId}
          RETURNING
            *
        `,
      });

      const listEncountersForQuest = SqlSchema.findAll({
        Result: QuestEncounterLink,
        Request: QuestEncountersByQuestPayload,
        execute: (request) => sql`
          SELECT
            *
          FROM
            quest_encounters
          WHERE
            quest_id = ${request.questId}
        `,
      });

      const listQuestsForEncounter = SqlSchema.findAll({
        Result: QuestEncounterLink,
        Request: QuestEncountersByEncounterPayload,
        execute: (request) => sql`
          SELECT
            *
          FROM
            quest_encounters
          WHERE
            encounter_id = ${request.encounterId}
        `,
      });

      return {
        findAll: (queryParams: {
          search?: string | undefined;
          campaignId?: string | undefined;
        }) =>
          findAll(queryParams).pipe(
            Effect.catchTags({
              ParseError: Effect.die,
              SqlError: Effect.die,
            }),
          ),
        create: flow(create, Effect.orDie),
        linkEncounter: flow(linkEncounter, Effect.orDie),
        unlinkEncounter: flow(unlinkEncounter, Effect.orDie),
        listEncountersForQuest: (payload: QuestEncountersByQuestPayload) =>
          listEncountersForQuest(payload).pipe(
            Effect.catchTags({
              ParseError: Effect.die,
              SqlError: Effect.die,
            }),
          ),
        listQuestsForEncounter: (payload: QuestEncountersByEncounterPayload) =>
          listQuestsForEncounter(payload).pipe(
            Effect.catchTags({
              ParseError: Effect.die,
              SqlError: Effect.die,
            }),
          ),
      } as const;
    }),
  },
) {}
