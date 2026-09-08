import {
  type AccountId,
  type Actor,
  type CampaignId,
  CurrentActor,
  type NpcChannel,
  type NpcId,
  NpcThread,
  type NpcThreadId,
  NpcTurn,
  type NpcTurnId,
  type NpcWho,
  NotFound,
  RateLimited,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { playerNpcReadable } from "./Npcs.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import {
  type Containment,
  containedChildWritable,
  ensureContainedRowWritable,
  inCampaign,
  under,
} from "./visibility.js";

/**
 * The rehearsal transcript — `npc_thread` and `npc_turn`, as rows.
 *
 * A thread hangs off its NPC and a turn off its thread, so **this repository
 * writes no predicate of its own**: it is `repo/visibility.ts`'s containment
 * chain, `npc_turn → npc_thread → npc → campaign`, walked by
 * `containedChildWritable`. The *writable* chain rather than the readable one,
 * deliberately and everywhere, including the reads — a rehearsal is the
 * creator's conversation with their own NPC and no other member's to read.
 * That is what makes "a revoked member with a remembered thread id gets
 * `NotFound`" a property of the shape: the base case is `rowWritable` on
 * `npc`, whose campaign half is `campaignWritableById`.
 *
 * Every method takes the `CampaignCreatorActor` proof, for `Npcs`'s reason.
 *
 * Turn ids are **generated in TypeScript** (`NpcAgent.rehearse`), as Hob's are:
 * the client is told which turn the reply will be saved as before there is a
 * reply, so a dropped stream keeps the line the creator already read.
 */

export const NPC: Containment = inCampaign("npc");
export const NPC_THREADS: Containment = under("npc_thread", "npc_id", NPC);
export const NPC_TURNS: Containment = under("npc_turn", "thread_id", NPC_THREADS);

interface ThreadRow extends ProvenanceColumns {
  readonly id: NpcThreadId;
  readonly npc_id: NpcId;
  readonly channel: NpcChannel;
  readonly account_id: AccountId | null;
  readonly title: string;
}

interface TurnRow extends ProvenanceColumns {
  readonly id: NpcTurnId;
  readonly thread_id: NpcThreadId;
  readonly who: NpcWho;
  readonly body: string;
  readonly template_version: string | null;
  readonly prompt_tokens: number | null;
}

const toThread = (row: ThreadRow): NpcThread => {
  const { createdAt, updatedAt } = provenanceOf(row);
  return new NpcThread({
    id: row.id,
    npcId: row.npc_id,
    channel: row.channel,
    title: row.title,
    createdAt,
    updatedAt,
  });
};

export const toNpcTurn = (row: TurnRow): NpcTurn =>
  new NpcTurn({
    id: row.id,
    threadId: row.thread_id,
    who: row.who,
    text: row.body,
    templateVersion: row.template_version,
    promptTokens: row.prompt_tokens,
    createdAt: provenanceOf(row).createdAt,
  });

/** A thread's name is the line that started it, shortened rather than cut mid-word. */
const titleFrom = (text: string): string => {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/** What `NpcAgent.rehearse` appends. `id` is supplied so the client can be told it early. */
export interface NpcTurnDraft {
  readonly id: NpcTurnId;
  readonly who: NpcWho;
  readonly text: string;
  /** Set on the NPC's own turns only: which template produced this line. */
  readonly templateVersion?: string;
  readonly promptTokens?: number;
  readonly model?: string;
  readonly finishReason?: string;
}

export interface PlayerNpcRateLimits {
  readonly perPlayerPerMinute: number;
  readonly perCampaignPerDay: number;
}

const playerMinuteLimited = (retryAfterSeconds: number): RateLimited =>
  new RateLimited({
    message:
      "You have sent too many messages to NPCs in the last minute. Wait a moment, then try again.",
    retryAfterSeconds,
  });

const campaignDayLimited = (retryAfterSeconds: number): RateLimited =>
  new RateLimited({
    message:
      "This campaign has reached today's NPC chat limit. Try again tomorrow, or ask the DM to raise the limit.",
    retryAfterSeconds,
  });

export class NpcThreads extends Context.Service<
  NpcThreads,
  {
    /** Newest first — the screen resumes the one at the front. */
    readonly list: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcThread>, NotFound, never>;
    readonly findById: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcThreadId,
    ) => Effect.Effect<NpcThread, NotFound, never>;
    readonly start: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      firstLine: string,
    ) => Effect.Effect<NpcThread, NotFound, never>;
    /** Oldest first: a conversation, read in the order it happened. */
    readonly turns: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      threadId: NpcThreadId,
    ) => Effect.Effect<ReadonlyArray<NpcTurn>, NotFound, never>;
    readonly append: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      threadId: NpcThreadId,
      draft: NpcTurnDraft,
    ) => Effect.Effect<NpcTurn, NotFound, never>;
    readonly playerList: (
      campaignId: CampaignId,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcThread>, NotFound, CurrentActor>;
    readonly playerFindById: (
      campaignId: CampaignId,
      npcId: NpcId,
      id: NpcThreadId,
    ) => Effect.Effect<NpcThread, NotFound, CurrentActor>;
    readonly playerStart: (
      campaignId: CampaignId,
      npcId: NpcId,
      firstLine: string,
      limits: PlayerNpcRateLimits,
    ) => Effect.Effect<NpcThread, NotFound | RateLimited, CurrentActor>;
    readonly playerTurns: (
      campaignId: CampaignId,
      npcId: NpcId,
      threadId: NpcThreadId,
    ) => Effect.Effect<ReadonlyArray<NpcTurn>, NotFound, CurrentActor>;
    readonly playerAppend: (
      campaignId: CampaignId,
      npcId: NpcId,
      threadId: NpcThreadId,
      draft: NpcTurnDraft,
      limits?: PlayerNpcRateLimits,
    ) => Effect.Effect<NpcTurn, NotFound | RateLimited, CurrentActor>;
  }
>()("NpcThreads") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const threadReachable = (creator: CampaignCreatorActor, npcId: NpcId) =>
        sql.and([
          containedChildWritable(sql, NPC_THREADS, npcId, creator.campaign, creator.actor),
          sql`npc_thread.channel = 'rehearsal'`,
          sql`npc_thread.account_id is null`,
        ]);

      const playerThreadReachable = (campaignId: CampaignId, npcId: NpcId, actor: Actor) =>
        sql.and([
          sql`npc_thread.npc_id = ${npcId}`,
          sql`npc_thread.channel = 'player_direct'`,
          sql`npc_thread.account_id = ${actor.accountId}`,
          sql`exists (select 1 from npc where npc.id = npc_thread.npc_id and ${playerNpcReadable(sql, campaignId, actor)})`,
        ]);

      /** Names the thread, so an unreachable one is a 404 about it rather than an empty conversation. */
      const ensureThread = (creator: CampaignCreatorActor, npcId: NpcId, threadId: NpcThreadId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: NpcThreadId }>`
            select npc_thread.id from npc_thread
            where npc_thread.id = ${threadId} and ${threadReachable(creator, npcId)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "npc_thread", id: threadId });
          }
        });

      const ensurePlayerThread = (campaignId: CampaignId, npcId: NpcId, threadId: NpcThreadId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<{ readonly id: NpcThreadId }>`
            select npc_thread.id from npc_thread
            where npc_thread.id = ${threadId} and ${playerThreadReachable(campaignId, npcId, actor)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "npc_thread", id: threadId });
          }
          return actor;
        });

      const checkPlayerRate = (campaignId: CampaignId, actor: Actor, limits: PlayerNpcRateLimits) =>
        Effect.gen(function* () {
          // One row lock serialises the campaign-wide counter. The per-player
          // counter is intentionally scoped to this campaign's player NPC chat:
          // the product limit is protecting this surface, not all account use.
          yield* sql`select campaign.id from campaign where campaign.id = ${campaignId} for update`;
          const [minute, day] = yield* Effect.all([
            sql<{ readonly count: number }>`
              select count(*)::int as count
              from npc_turn
              join npc_thread on npc_thread.id = npc_turn.thread_id
              join npc on npc.id = npc_thread.npc_id
              where npc.campaign_id = ${campaignId}
                and npc_thread.channel = 'player_direct'
                and npc_thread.account_id = ${actor.accountId}
                and npc_turn.who = 'user'
                and npc_turn.created_at >= now() - interval '1 minute'
            `,
            sql<{ readonly count: number }>`
              select count(*)::int as count
              from npc_turn
              join npc_thread on npc_thread.id = npc_turn.thread_id
              join npc on npc.id = npc_thread.npc_id
              where npc.campaign_id = ${campaignId}
                and npc_thread.channel = 'player_direct'
                and npc_turn.who = 'user'
                and npc_turn.created_at >= date_trunc('day', now())
            `,
          ]);
          if ((minute[0]?.count ?? 0) >= limits.perPlayerPerMinute) {
            return yield* playerMinuteLimited(60);
          }
          if ((day[0]?.count ?? 0) >= limits.perCampaignPerDay) {
            return yield* campaignDayLimited(86400);
          }
        });

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<ThreadRow>`
                select npc_thread.* from npc_thread
                where ${threadReachable(creator, npcId)}
                order by npc_thread.updated_at desc, npc_thread.id desc
              `;
              return rows.map(toThread);
            }),
          ),

        findById: (creator, npcId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<ThreadRow>`
                select npc_thread.* from npc_thread
                where npc_thread.id = ${id} and ${threadReachable(creator, npcId)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc_thread", id });
              return toThread(rows[0]!);
            }),
          ),

        start: (creator, npcId, firstLine) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // The NPC must be the creator's to write, and not archived: a
              // retired persona keeps its transcripts and takes no new lines.
              const live = yield* sql<{ readonly id: NpcId }>`
                select npc.id from npc
                where npc.id = ${npcId} and npc.archived_at is null
                  and ${containedChildWritable(sql, NPC, npcId, creator.campaign, creator.actor)}
              `;
              if (live.length === 0) return yield* new NotFound({ resource: "npc", id: npcId });
              const rows = yield* sql<ThreadRow>`
                insert into npc_thread ${sql.insert({
                  npc_id: npcId,
                  channel: "rehearsal",
                  title: titleFrom(firstLine),
                })}
                returning *
              `;
              return toThread(rows[0]!);
            }),
          ),

        turns: (creator, npcId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureThread(creator, npcId, threadId);
              const rows = yield* sql<TurnRow>`
                select npc_turn.* from npc_turn
                where ${containedChildWritable(sql, NPC_TURNS, threadId, creator.campaign, creator.actor)}
                order by npc_turn.created_at asc, npc_turn.id asc
              `;
              return rows.map(toNpcTurn);
            }),
          ),

        append: (creator, npcId, threadId, draft) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureThread(creator, npcId, threadId);
                const rows = yield* sql<TurnRow>`
                  insert into npc_turn ${sql.insert(
                    defined({
                      id: draft.id,
                      thread_id: threadId,
                      who: draft.who,
                      body: draft.text,
                      template_version: draft.templateVersion,
                      prompt_tokens: draft.promptTokens,
                      model: draft.model,
                      finish_reason: draft.finishReason,
                      // The NPC's own line is generated content. It points at
                      // no Hob turn because it is not Hob's — see 0037.
                      ...(draft.who === "npc" ? { origin: "assistant" } : {}),
                    }),
                  )}
                  on conflict (id) do update
                  set body = excluded.body,
                      finish_reason = excluded.finish_reason,
                      updated_at = now()
                  returning *
                `;
                yield* sql`
                  update npc_thread set updated_at = now()
                  where npc_thread.id = ${threadId} and ${threadReachable(creator, npcId)}
                `;
                return toNpcTurn(rows[0]!);
              }),
            ),
          ),

        playerList: (campaignId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<ThreadRow>`
                select npc_thread.* from npc_thread
                where ${playerThreadReachable(campaignId, npcId, actor)}
                order by npc_thread.updated_at desc, npc_thread.id desc
              `;
              return rows.map(toThread);
            }),
          ),

        playerFindById: (campaignId, npcId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<ThreadRow>`
                select npc_thread.* from npc_thread
                where npc_thread.id = ${id} and ${playerThreadReachable(campaignId, npcId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc_thread", id });
              return toThread(rows[0]!);
            }),
          ),

        playerStart: (campaignId, npcId, firstLine, limits) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const live = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc where npc.id = ${npcId} and ${playerNpcReadable(sql, campaignId, actor)}
                `;
                if (live.length === 0) return yield* new NotFound({ resource: "npc", id: npcId });
                yield* checkPlayerRate(campaignId, actor, limits);
                const rows = yield* sql<ThreadRow>`
                  insert into npc_thread ${sql.insert({
                    npc_id: npcId,
                    account_id: actor.accountId,
                    channel: "player_direct",
                    title: titleFrom(firstLine),
                  })}
                  returning *
                `;
                return toThread(rows[0]!);
              }),
            ),
          ),

        playerTurns: (campaignId, npcId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* ensurePlayerThread(campaignId, npcId, threadId);
              const rows = yield* sql<TurnRow>`
                select npc_turn.* from npc_turn
                where npc_turn.thread_id = ${threadId}
                  and exists (select 1 from npc_thread where npc_thread.id = npc_turn.thread_id and ${playerThreadReachable(campaignId, npcId, actor)})
                order by npc_turn.created_at asc, npc_turn.id asc
              `;
              return rows.map(toNpcTurn);
            }),
          ),

        playerAppend: (campaignId, npcId, threadId, draft, limits) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* ensurePlayerThread(campaignId, npcId, threadId);
                if (draft.who === "user" && limits !== undefined) {
                  yield* checkPlayerRate(campaignId, actor, limits);
                }
                const rows = yield* sql<TurnRow>`
                  insert into npc_turn ${sql.insert(
                    defined({
                      id: draft.id,
                      thread_id: threadId,
                      who: draft.who,
                      body: draft.text,
                      template_version: draft.templateVersion,
                      prompt_tokens: draft.promptTokens,
                      model: draft.model,
                      finish_reason: draft.finishReason,
                      ...(draft.who === "npc" ? { origin: "assistant" } : {}),
                    }),
                  )}
                  on conflict (id) do update
                  set body = excluded.body,
                      finish_reason = excluded.finish_reason,
                      updated_at = now()
                  returning *
                `;
                yield* sql`
                  update npc_thread set updated_at = now()
                  where npc_thread.id = ${threadId} and ${playerThreadReachable(campaignId, npcId, actor)}
                `;
                return toNpcTurn(rows[0]!);
              }),
            ),
          ),
      };
    }),
  );
}
