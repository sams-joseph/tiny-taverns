import {
  type AccountId,
  type CampaignId,
  Character,
  type CharacterCreate,
  type CharacterId,
  type CharacterSheet,
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
  /** Null for every row today — nothing mints a player credential yet. */
  readonly account_id: AccountId | null;
  readonly name: string;
  readonly player_name: string | null;
  readonly level: number | null;
  readonly species: string | null;
  readonly class_name: string | null;
  /**
   * `generated always as … stored`, so it arrives like any other column and is
   * refused by Postgres on the way in. Nothing below writes it, and nothing
   * could.
   */
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
  readonly sheet_url: string | null;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly body: CharacterSheet;
}

const toCharacter = (row: CharacterRow): Character =>
  new Character({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    name: row.name,
    playerName: row.player_name,
    level: row.level,
    species: row.species,
    className: row.class_name,
    descriptor: row.descriptor,
    ac: row.ac,
    hpMax: row.hp_max,
    sheetUrl: row.sheet_url,
    sheet: row.body,
    ...provenanceOf(row),
  });

/**
 * Stringified for the same reason `Creatures.encodeStatBlock` is: a bare JS
 * object handed to `sql.insert` is one bind parameter whose serialisation
 * depends on the driver's guess, and being explicit about which structured
 * column is which is cheaper than remembering the rule at each call site.
 */
const encodeSheet = (sheet: CharacterSheet): string => JSON.stringify(sheet);

/**
 * The party.
 *
 * **There is no `descriptor` in either payload, and that is the whole shape of
 * this file since `0012`.** The `"Level 3 Half-orc Paladin"` line is derived
 * from `level`, `species` and `class_name` by a generated column, so the only
 * way to change it is to change one of those — a label stored beside the three
 * fields it summarises is a second answer waiting to disagree with the first.
 *
 * `account_id` is likewise absent from both payloads. It is the hook the invite
 * will use and nothing reads through it; an endpoint that accepted one would be
 * letting a client name an account it has no business naming, and the predicate
 * that will make it mean something belongs with the step that mints a player
 * actor.
 */
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
                      level: payload.level,
                      species: payload.species,
                      class_name: payload.className,
                      ac: payload.ac,
                      hp_max: payload.hpMax,
                      sheet_url: payload.sheetUrl,
                      body: payload.sheet && encodeSheet(payload.sheet),
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
                level: patch.level,
                species: patch.species,
                class_name: patch.className,
                ac: patch.ac,
                hp_max: patch.hpMax,
                sheet_url: patch.sheetUrl,
                body: patch.sheet && encodeSheet(patch.sheet),
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
