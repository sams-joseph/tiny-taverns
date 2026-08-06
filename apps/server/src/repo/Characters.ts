import {
  type CampaignId,
  Character,
  type CharacterCreate,
  type CharacterId,
  type CharacterUpdate,
  CurrentActor,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

interface CharacterRow extends ProvenanceColumns {
  readonly id: CharacterId;
  readonly campaign_id: CampaignId;
  readonly name: string;
  readonly player_name: string | null;
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
}

const toCharacter = (row: CharacterRow): Character =>
  new Character({
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    playerName: row.player_name,
    descriptor: row.descriptor,
    ac: row.ac,
    hpMax: row.hp_max,
    ...provenanceOf(row),
  });

export class Characters extends Context.Service<
  Characters,
  {
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Character>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: CharacterId,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: CharacterCreate,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: CharacterId,
      patch: CharacterUpdate,
    ) => Effect.Effect<Character, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: CharacterId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Characters") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<CharacterRow>`
                select * from character
                where ${rowReadable(sql, "character", campaignId, actor)}
                order by character.created_at asc
              `;
              return rows.map(toCharacter);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<CharacterRow>`
                select * from character
                where character.id = ${id} and ${rowReadable(sql, "character", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
              return toCharacter(rows[0]!);
            }),
          ),

        create: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const rows = yield* sql<CharacterRow>`
                  insert into character ${sql.insert(
                    defined({
                      campaign_id: campaignId,
                      name: payload.name,
                      player_name: payload.playerName,
                      descriptor: payload.descriptor,
                      ac: payload.ac,
                      hp_max: payload.hpMax,
                      visibility: payload.visibility,
                    }),
                  )}
                  returning *
                `;
                return toCharacter(rows[0]!);
              }),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                player_name: patch.playerName,
                descriptor: patch.descriptor,
                ac: patch.ac,
                hp_max: patch.hpMax,
                visibility: patch.visibility,
              });
              const rows = yield* sql<CharacterRow>`
                update character set ${setClause(sql, columns)}
                where character.id = ${id} and ${rowWritable(sql, "character", campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
              return toCharacter(rows[0]!);
            }),
          ),

        remove: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: CharacterId }>`
                delete from character
                where character.id = ${id} and ${rowWritable(sql, "character", campaignId, actor)}
                returning character.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "character", id });
            }),
          ),
      };
    }),
  );
}
