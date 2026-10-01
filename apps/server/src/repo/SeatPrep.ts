import {
  type Actor,
  CampaignCharacterId,
  type CampaignId,
  NotFound,
  SeatPrep,
  type SeatPrepUpdate,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  proseColumn,
  setClause,
} from "./rows.js";
import { rowWritable } from "./visibility.js";

/**
 * Reads and writes over `campaign_character_prep`, each seat's hook and secret
 * (`0063_seat_prep.ts`) — **the creator's alone**, so every method takes a
 * `CampaignCreatorActor` and still composes the seat's creator predicate
 * beneath it. There is no player read here, and no player path anywhere reads
 * this table.
 *
 * It is not `Party`, on purpose: `Party` is what a player reads too, and a
 * seat read that could reach these columns is the leak `CreatorActor.ts`'s
 * standing rule exists to make impossible.
 *
 * Every read walks the seat, which is the prep's only containment answer: the
 * seat must be live (`left_at is null`) and in the proof's campaign, so a
 * retired seat's prep and another campaign's seat named in this path are the
 * same `NotFound`.
 *
 * Hob holds no copy: no toolkit has a prep tool and search does not index it,
 * so a secret never enters a model prompt.
 */

/** A seat's prep, decoded off `seatsWithPrep` by `SqlSchema`. */
const SeatPrepRow = classFromColumns(SeatPrep, SeatPrep.fields);

const SeatRequest = Schema.toType(Schema.Struct({ ...creatorFields, id: CampaignCharacterId }));

export class SeatPreps extends Context.Service<
  SeatPreps,
  {
    /**
     * Every live seat's prep in the creator's campaign, in the roster's order.
     * A seat nothing was written for answers two `null`s; a retired seat is
     * absent.
     */
    readonly list: (creator: CampaignCreatorActor) => Effect.Effect<ReadonlyArray<SeatPrep>>;
    /**
     * The creator's PATCH: an absent field is untouched, `null` or a blank
     * clears it. `NotFound` for a seat that is retired or not in this campaign.
     */
    readonly update: (
      creator: CampaignCreatorActor,
      id: CampaignCharacterId,
      patch: SeatPrepUpdate,
    ) => Effect.Effect<SeatPrep, NotFound>;
  }
>()("SeatPreps") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /** The live seats of the creator's campaign, each with its prep when it has one. */
      const seatsWithPrep = (campaign: CampaignId, actor: Actor) => sql`
        select campaign_character.id as campaign_character_id,
               campaign_character_prep.hook, campaign_character_prep.secret
        from campaign_character
        left join campaign_character_prep
          on campaign_character_prep.campaign_character_id = campaign_character.id
        where campaign_character.left_at is null
          and ${rowWritable(sql, "campaign_character", campaign, actor)}
      `;

      const roster = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: SeatPrepRow,
        execute: ({ campaign, actor }) => sql`
          ${seatsWithPrep(campaign, actor)}
          order by campaign_character.joined_at asc, campaign_character.id asc
        `,
      });
      /**
       * The live seat, locked for the insert that follows, so a retire racing
       * this write lands before it (and refuses it) or after it.
       */
      const liveSeat = SqlSchema.findOne({
        Request: SeatRequest,
        Result: fromColumns(Schema.Struct({ id: CampaignCharacterId })),
        execute: ({ campaign, actor, id }) => sql`
          select campaign_character.id from campaign_character
          where campaign_character.id = ${id}
            and campaign_character.left_at is null
            and ${rowWritable(sql, "campaign_character", campaign, actor)}
          for share
        `,
      });
      const seat = SqlSchema.findOne({
        Request: SeatRequest,
        Result: SeatPrepRow,
        execute: ({ campaign, actor, id }) => sql`
          ${seatsWithPrep(campaign, actor)} and campaign_character.id = ${id}
        `,
      });
      /** One seat's prep, as `update` answers with it after writing. */
      const readSeat = (creator: CampaignCreatorActor, id: CampaignCharacterId) =>
        // The seat was locked by the write; losing it now is a defect.
        seat({ ...asked(creator), id }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));

      return {
        list: (creator) => dieOnSqlError(roster(asked(creator))),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* liveSeat({ ...asked(creator), id }).pipe(
                  orNotFound("campaign_character", id),
                );

                const columns = defined({
                  hook: proseColumn(patch.hook),
                  secret: proseColumn(patch.secret),
                });
                yield* sql`
                  insert into campaign_character_prep
                    ${sql.insert({ campaign_character_id: id, ...columns })}
                  on conflict (campaign_character_id) do update set ${setClause(sql, columns)}
                `;

                return yield* readSeat(creator, id);
              }),
            ),
          ),
      };
    }),
  );
}
