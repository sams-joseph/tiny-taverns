import {
  CampaignId,
  CampaignStory,
  CampaignStoryId,
  type CampaignStoryPut,
  CurrentActor,
  NotFound,
  PlayerCampaignStory,
  type Visibility,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  proseColumn,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  campaignWritableById,
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
} from "./visibility.js";

/**
 * Reads and writes over `campaign_story` (`0072_campaign_story.ts`): a
 * campaign's story so far and its *Previously*.
 *
 * **The wide read takes the creator proof**, because the player's projection
 * differs from it (`CreatorActor.ts`'s standing rule); the player's is
 * `readAsPlayer`, which selects the narrow columns under the same
 * `rowReadable` and answers only a shared story. The writes take the campaign
 * and compose `campaignWritable`, as `Notes.create` does, so the accept path
 * in `Proposals.ts` reaches them with the actor it already has.
 *
 * `after_session_number` is stamped here and nowhere else: the creator's own
 * write stamps the newest ended night at that moment, and an accepted Hob
 * draft carries the newest night Hob was shown (checked to be a real ended
 * night of this campaign, as `acceptSummary` checks its boundary).
 */

/** A `campaign_story` row as the creator reads it, decoded off `campaign_story.*` by `SqlSchema`. */
const StoryRow = classFromColumns(CampaignStory, {
  ...CampaignStory.fields,
  ...timestampColumns,
});

/** The story as a player is told it, decoded off the narrow select in `readAsPlayer`. */
const PlayerStoryRow = classFromColumns(PlayerCampaignStory, {
  ...PlayerCampaignStory.fields,
  updatedAt: timestampColumns.updatedAt,
});

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** What Hob drafted and the creator kept. */
export interface CampaignStoryDraft {
  readonly text: string;
  readonly previously: string | null;
  readonly afterSessionNumber: number;
}

export class CampaignStories extends Context.Service<
  CampaignStories,
  {
    /** The creator's story, or `null` — the ordinary state of a young campaign. */
    readonly read: (creator: CampaignCreatorActor) => Effect.Effect<CampaignStory | null>;
    /**
     * The story as a player reads it: `null` when there is none *or* it is
     * not shared, which are one answer on purpose. `NotFound` only for a
     * campaign this actor cannot read.
     */
    readonly readAsPlayer: (
      campaignId: CampaignId,
    ) => Effect.Effect<PlayerCampaignStory | null, NotFound, CurrentActor>;
    /**
     * The creator's write. New words make it theirs (`authored`) and restamp
     * the night it follows; the same words with another `visibility` is the
     * share switch and changes nothing else. An absent `visibility` keeps the
     * story's own.
     */
    readonly put: (
      campaignId: CampaignId,
      payload: CampaignStoryPut,
    ) => Effect.Effect<CampaignStory, NotFound, CurrentActor>;
    /** Clears the story. Clearing none is not an error; a campaign one cannot write is. */
    readonly remove: (campaignId: CampaignId) => Effect.Effect<void, NotFound, CurrentActor>;
    /**
     * Hob's draft, kept: replaces the story with `origin = 'assistant'` and the
     * turn, and lands `dm` whatever the old one was — a draft Hob wrote does
     * not decide what the players read. `NotFound` when the covered night is
     * not an ended night of this campaign.
     */
    readonly accept: (
      campaignId: CampaignId,
      draft: CampaignStoryDraft,
      from: AssistantOrigin,
    ) => Effect.Effect<CampaignStory, NotFound, CurrentActor>;
  }
>()("CampaignStories") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const current = SqlSchema.findOneOption({
        Request: Schema.toType(CampaignId),
        Result: StoryRow,
        execute: (campaignId) =>
          sql`select * from campaign_story where campaign_story.campaign_id = ${campaignId}`,
      });

      /** The newest night of this campaign that has ended, or zero. */
      const newestEnded = SqlSchema.findOne({
        Request: Schema.toType(CampaignId),
        Result: fromColumns(Schema.Struct({ number: Schema.Int })),
        execute: (campaignId) => sql`
          select coalesce(max(session.number), 0)::int as number from session
          where session.campaign_id = ${campaignId} and session.ended_at is not null
        `,
      });

      const readable = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: StoryRow,
        execute: ({ campaign, actor }) => sql`
          select * from campaign_story
          where ${rowReadable(sql, "campaign_story", campaign, actor)}
        `,
      });
      const readableAsPlayer = SqlSchema.findOneOption({
        Request: Schema.toType(CampaignId),
        Result: PlayerStoryRow,
        execute: (campaignId) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign_story.text, campaign_story.previously,
                     campaign_story.after_session_number, campaign_story.updated_at
              from campaign_story
              where ${rowReadable(sql, "campaign_story", campaignId, actor)}
            `,
          ),
      });
      /** The share switch alone, on a story whose words did not change. */
      const reshare = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: CampaignStoryId, columns: Columns })),
        Result: StoryRow,
        execute: ({ id, columns }) => sql`
          update campaign_story
          set ${setClause(sql, columns)}
          where campaign_story.id = ${id}
          returning *
        `,
      });
      const upserted = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, columns: Columns })),
        Result: StoryRow,
        execute: ({ campaignId, columns }) => sql`
          insert into campaign_story ${sql.insert({ campaign_id: campaignId, ...columns })}
          on conflict (campaign_id) do update set ${sql.update(columns)}, updated_at = now()
          returning *
        `,
      });

      /** An absent `visibility` keeps the story's own, or the column's `dm` for a new one. */
      const upsert = (
        campaignId: CampaignId,
        given: {
          readonly text: string;
          readonly previously: string | null;
          readonly after_session_number: number;
          readonly visibility: Visibility | undefined;
          readonly origin: "authored" | "assistant";
          readonly assistant_turn_id: string | null;
        },
      ) =>
        // An upsert answers with its row; not getting one is a defect.
        upserted({ campaignId, columns: defined(given) }).pipe(
          Effect.catchTag("NoSuchElementError", Effect.die),
        );

      return {
        read: (creator) => dieOnSqlError(Effect.map(readable(asked(creator)), Option.getOrNull)),

        readAsPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return Option.getOrNull(yield* readableAsPlayer(campaignId));
            }),
          ),

        put: (campaignId, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureCampaignWritable(sql, campaignId, actor);
                const text = payload.text.trim();
                const previously = proseColumn(payload.previously) ?? null;
                const was = Option.getOrUndefined(yield* current(campaignId));
                if (was !== undefined && was.text === text && was.previously === previously) {
                  // The row was just read in this transaction; losing it now is a defect.
                  return yield* reshare({
                    id: was.id,
                    columns: defined({ visibility: payload.visibility }),
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                }
                // An aggregate answers with one row, always.
                const ended = yield* newestEnded(campaignId).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
                return yield* upsert(campaignId, {
                  text,
                  previously,
                  after_session_number: ended.number,
                  visibility: payload.visibility,
                  origin: "authored",
                  assistant_turn_id: null,
                });
              }),
            ),
          ),
        remove: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);
              yield* sql`
                delete from campaign_story
                where campaign_story.campaign_id = ${campaignId}
                  and ${campaignWritableById(sql, campaignId, actor)}
              `;
            }),
          ),

        accept: (campaignId, draft, from) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);
              if (draft.afterSessionNumber > 0) {
                const night = yield* sql`
                  select 1 from session
                  where session.campaign_id = ${campaignId}
                    and session.number = ${draft.afterSessionNumber}
                    and session.ended_at is not null
                `;
                if (night.length === 0) {
                  return yield* new NotFound({ resource: "campaign_story", id: campaignId });
                }
              }
              return yield* upsert(campaignId, {
                text: draft.text.trim(),
                previously: proseColumn(draft.previously) ?? null,
                after_session_number: draft.afterSessionNumber,
                visibility: "dm",
                origin: "assistant",
                assistant_turn_id: from.assistantTurnId,
              });
            }),
          ),
      };
    }),
  );
}
