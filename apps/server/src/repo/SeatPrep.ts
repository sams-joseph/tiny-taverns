import { type CampaignCharacterId, NotFound, SeatPrep, type SeatPrepUpdate } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, proseColumn, setClause } from "./rows.js";
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

interface SeatPrepRow {
  readonly campaign_character_id: CampaignCharacterId;
  readonly hook: string | null;
  readonly secret: string | null;
}

const toSeatPrep = (row: SeatPrepRow): SeatPrep =>
  new SeatPrep({
    campaignCharacterId: row.campaign_character_id,
    hook: row.hook,
    secret: row.secret,
  });

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
      const seatsWithPrep = (creator: CampaignCreatorActor) => sql`
        select campaign_character.id as campaign_character_id,
               campaign_character_prep.hook, campaign_character_prep.secret
        from campaign_character
        left join campaign_character_prep
          on campaign_character_prep.campaign_character_id = campaign_character.id
        where campaign_character.left_at is null
          and ${rowWritable(sql, "campaign_character", creator.campaign, creator.actor)}
      `;

      return {
        list: (creator) =>
          dieOnSqlError(
            Effect.map(
              sql<SeatPrepRow>`
                ${seatsWithPrep(creator)}
                order by campaign_character.joined_at asc, campaign_character.id asc
              `,
              (rows) => rows.map(toSeatPrep),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // The seat is locked for the insert below, so a retire racing
                // this write lands before it (and refuses it) or after it.
                const seats = yield* sql<{ readonly id: CampaignCharacterId }>`
                  select campaign_character.id from campaign_character
                  where campaign_character.id = ${id}
                    and campaign_character.left_at is null
                    and ${rowWritable(sql, "campaign_character", creator.campaign, creator.actor)}
                  for share
                `;
                if (seats.length === 0) {
                  return yield* new NotFound({ resource: "campaign_character", id });
                }

                const columns = defined({
                  hook: proseColumn(patch.hook),
                  secret: proseColumn(patch.secret),
                });
                yield* sql`
                  insert into campaign_character_prep
                    ${sql.insert({ campaign_character_id: id, ...columns })}
                  on conflict (campaign_character_id) do update set ${setClause(sql, columns)}
                `;

                const rows = yield* sql<SeatPrepRow>`
                  ${seatsWithPrep(creator)} and campaign_character.id = ${id}
                `;
                return toSeatPrep(rows[0]!);
              }),
            ),
          ),
      };
    }),
  );
}
