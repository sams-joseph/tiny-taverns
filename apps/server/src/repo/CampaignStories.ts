import {
  type CampaignId,
  CampaignStory,
  type CampaignStoryId,
  type CampaignStoryPut,
  CurrentActor,
  NotFound,
  PlayerCampaignStory,
  type Visibility,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  defined,
  dieOnSqlError,
  proseColumn,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
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

interface StoryRow extends ProvenanceColumns {
  readonly id: CampaignStoryId;
  readonly campaign_id: CampaignId;
  readonly text: string;
  readonly previously: string | null;
  readonly after_session_number: number;
}

const toStory = (row: StoryRow): CampaignStory =>
  new CampaignStory({
    id: row.id,
    campaignId: row.campaign_id,
    text: row.text,
    previously: row.previously,
    afterSessionNumber: row.after_session_number,
    ...provenanceOf(row),
  });

interface PlayerStoryRow {
  readonly text: string;
  readonly previously: string | null;
  readonly after_session_number: number;
  readonly updated_at: Date;
}

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

      const current = (campaignId: CampaignId) =>
        Effect.map(
          sql<StoryRow>`select * from campaign_story where campaign_story.campaign_id = ${campaignId}`,
          (rows) => rows[0],
        );

      /** The newest night of this campaign that has ended, or zero. */
      const newestEnded = (campaignId: CampaignId) =>
        Effect.map(
          sql<{ readonly number: number }>`
            select coalesce(max(session.number), 0)::int as number from session
            where session.campaign_id = ${campaignId} and session.ended_at is not null
          `,
          (rows) => rows[0]!.number,
        );

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
      ) => {
        const columns = defined(given);
        return Effect.map(
          sql<StoryRow>`
            insert into campaign_story ${sql.insert({ campaign_id: campaignId, ...columns })}
            on conflict (campaign_id) do update set ${sql.update(columns)}, updated_at = now()
            returning *
          `,
          (rows) => toStory(rows[0]!),
        );
      };

      return {
        read: (creator) =>
          dieOnSqlError(
            Effect.map(
              sql<StoryRow>`
                select * from campaign_story
                where ${rowReadable(sql, "campaign_story", creator.campaign, creator.actor)}
              `,
              (rows) => (rows.length === 0 ? null : toStory(rows[0]!)),
            ),
          ),

        readAsPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<PlayerStoryRow>`
                select campaign_story.text, campaign_story.previously,
                       campaign_story.after_session_number, campaign_story.updated_at
                from campaign_story
                where ${rowReadable(sql, "campaign_story", campaignId, actor)}
              `;
              const row = rows[0];
              return row === undefined
                ? null
                : new PlayerCampaignStory({
                    text: row.text,
                    previously: row.previously,
                    afterSessionNumber: row.after_session_number,
                    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
                  });
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
                const was = yield* current(campaignId);
                if (was !== undefined && was.text === text && was.previously === previously) {
                  const rows = yield* sql<StoryRow>`
                    update campaign_story
                    set ${setClause(sql, defined({ visibility: payload.visibility }))}
                    where campaign_story.id = ${was.id}
                    returning *
                  `;
                  return toStory(rows[0]!);
                }
                return yield* upsert(campaignId, {
                  text,
                  previously,
                  after_session_number: yield* newestEnded(campaignId),
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
