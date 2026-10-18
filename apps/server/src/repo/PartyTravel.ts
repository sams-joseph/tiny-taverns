import {
  CampaignId,
  CurrentActor,
  LocationId,
  NotFound,
  PartyMove,
  PartyMoveId,
  PlayerPartyMove,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { type AssistantOrigin, assistantColumns, classFromColumns, dieOnSqlError } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  campaignReadable,
  campaignWritableById,
  ensureCampaignReadable,
  locationAtCampaign,
  locationRevealedAt,
} from "./visibility.js";

const MoveRow = classFromColumns(PartyMove, {
  ...PartyMove.fields,
  movedAt: Schema.DateTimeUtcFromDate,
});
const PlayerMoveRow = classFromColumns(PlayerPartyMove, {
  ...PlayerPartyMove.fields,
  movedAt: Schema.DateTimeUtcFromDate,
});

/** A move made, and the open night whose doorbell it rings once committed. */
export interface PartyMoved {
  readonly move: PartyMove;
  readonly ring: Effect.Effect<void>;
}

/**
 * The party's travels: where it has been, and so where it is — the newest
 * move. The creator moves it, behind the proof; every member reads the log,
 * a player through `forPlayer`, which names a place only while it is
 * revealed to their table. Hob proposes a move (`proposePartyMove`) and only
 * the creator's keep makes one, through `moveForAccept`.
 */
export class PartyTravel extends Context.Service<
  PartyTravel,
  {
    /** The campaign's log, newest first. */
    readonly list: (creator: CampaignCreatorActor) => Effect.Effect<ReadonlyArray<PartyMove>>;
    /**
     * Moves the party to a place in the campaign's world: records the move on
     * the night that is open, if one is, reveals the place to the table, and
     * rings the night's doorbell once committed.
     */
    readonly move: (
      creator: CampaignCreatorActor,
      locationId: LocationId,
    ) => Effect.Effect<PartyMove, NotFound>;
    /**
     * `move` inside the accept's transaction, stamped with the turn: it hands
     * the doorbell back rather than ringing, because a ring before the commit
     * would send a table to re-read a move that is not there yet.
     */
    readonly moveForAccept: (
      creator: CampaignCreatorActor,
      locationId: LocationId,
      from: AssistantOrigin,
    ) => Effect.Effect<PartyMoved, NotFound>;
    /** Takes a move back; taking the newest back puts the party where it was before. */
    readonly remove: (
      creator: CampaignCreatorActor,
      id: PartyMoveId,
    ) => Effect.Effect<void, NotFound>;
    /** The log as a player at the table is told it. */
    readonly forPlayer: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerPartyMove>, NotFound, CurrentActor>;
  }
>()("PartyTravel") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const log = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: MoveRow,
        execute: ({ campaign, actor }) => sql`
          select campaign_party_move.* from campaign_party_move
          where campaign_party_move.campaign_id = ${campaign}
            and ${campaignWritableById(sql, campaign, actor)}
          order by campaign_party_move.moved_at desc, campaign_party_move.id desc
        `,
      });
      const told = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: PlayerMoveRow,
        execute: ({ campaign, actor }) => sql`
          select campaign_party_move.id,
                 case when ${locationRevealedAt(sql, sql`campaign_party_move.location_id`, campaign)}
                      then campaign_party_move.location_id end as location_id,
                 campaign_party_move.location_name,
                 campaign_party_move.moved_at
          from campaign_party_move
          where campaign_party_move.campaign_id = ${campaign}
            and exists (select 1 from campaign
                        where campaign.id = ${campaign}
                          and ${campaignReadable(sql, actor, campaign)})
          order by campaign_party_move.moved_at desc, campaign_party_move.id desc
        `,
      });

      /** The open night, appended to and returned, so its doorbell can ring after the commit. */
      const tellTheNight = (campaign: CampaignId, placeName: string) =>
        Effect.gen(function* () {
          const open = yield* sql<{ readonly current_session_id: SessionId | null }>`
            select campaign.current_session_id from campaign where campaign.id = ${campaign}
          `;
          const sessionId = open[0]?.current_session_id ?? null;
          if (sessionId !== null) {
            yield* appendEvent(sql, {
              sessionId,
              kind: "party-moved",
              payload: { location: placeName },
              visibility: "shared",
            });
          }
          return sessionId;
        });

      const record = (
        creator: CampaignCreatorActor,
        locationId: LocationId,
        from: AssistantOrigin | undefined,
      ) =>
        Effect.gen(function* () {
          const places = yield* sql<{ readonly name: string }>`
            select location.name from location
            where location.id = ${locationId}
              and ${locationAtCampaign(sql, creator.campaign, creator.actor)}
            for share of location
          `;
          if (places.length === 0) {
            return yield* new NotFound({ resource: "location", id: locationId });
          }
          const name = places[0]!.name;
          const sessionId = yield* tellTheNight(creator.campaign, name);
          const rows = yield* sql`
            insert into campaign_party_move ${sql.insert({
              campaign_id: creator.campaign,
              location_id: locationId,
              location_name: name,
              session_id: sessionId,
              ...assistantColumns(from),
            })}
            returning *
          `;
          // The party is standing in it, so the table knows it now.
          yield* sql`
            insert into campaign_location_reveal (campaign_id, location_id)
            values (${creator.campaign}, ${locationId})
            on conflict (campaign_id, location_id) do nothing
          `;
          const move = yield* Schema.decodeUnknownEffect(MoveRow)(rows[0]);
          return {
            move,
            ring: sessionId === null ? Effect.void : live.touched(sessionId),
          } satisfies PartyMoved;
        });

      return {
        list: (creator) => dieOnSqlError(log(asked(creator))),

        move: (creator, locationId) =>
          dieOnSqlError(
            sql.withTransaction(record(creator, locationId, undefined)).pipe(
              Effect.tap(({ ring }) => ring),
              Effect.map(({ move }) => move),
            ),
          ),

        moveForAccept: (creator, locationId, from) =>
          dieOnSqlError(record(creator, locationId, from)),

        remove: (creator, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const gone = yield* sql<{ readonly location_name: string }>`
                    delete from campaign_party_move
                    where campaign_party_move.id = ${id}
                      and campaign_party_move.campaign_id = ${creator.campaign}
                      and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                    returning campaign_party_move.location_name
                  `;
                  if (gone.length === 0) {
                    return yield* new NotFound({ resource: "party-move", id });
                  }
                  return yield* tellTheNight(creator.campaign, gone[0]!.location_name);
                }),
              )
              .pipe(
                Effect.flatMap((sessionId) =>
                  sessionId === null ? Effect.void : live.touched(sessionId),
                ),
              ),
          ),

        forPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* told({ campaign: campaignId, actor });
            }),
          ),
      };
    }),
  );
}
