import {
  type AccountId,
  Actor,
  CampaignId,
  Conflict,
  CurrentActor,
  NpcId,
  NpcSessionMonitor,
  type NpcSessionState,
  NpcThread,
  NpcThreadId,
  NpcTurn,
  type NpcTurnId,
  type NpcWho,
  NotFound,
  PlayerNpc,
  RateLimited,
  SessionId,
} from "@taverns/api";
import { Array as Arr, Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { initiativeOrder } from "./liveTables.js";
import {
  npcImageSigner,
  type PlayerNpcRow,
  playerNpcColumns,
  playerNpcReadable,
  toPlayerNpc,
} from "./Npcs.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  timestampColumns,
} from "./rows.js";
import {
  type Containment,
  campaignWritableById,
  containedChildWritable,
  ensureContainedRowWritable,
  inCampaign,
  rowReadable,
  under,
} from "./visibility.js";

/**
 * NPC transcripts — `npc_thread` and `npc_turn`, as rows.
 *
 * The three channels are separate modes, not authorization models: `rehearsal`
 * is the creator's Rehearse transcript, `player_direct` is one player's Talk
 * privately transcript, and `session_shared` is the Open at the table
 * live-session transcript. A thread hangs off its NPC and a turn off its
 * thread, so this repository composes the existing containment and player
 * projection predicates instead of inventing a second reach rule.
 *
 * Creator rehearsal methods take the `CampaignCreatorActor` proof. Player and
 * session methods use the account/session gates underneath: private chats never
 * create proposal rows, and session-shared chats may create proposals that the
 * creator reviews later in Cast.
 *
 * Turn ids are **generated in TypeScript** (`NpcAgent`), as Hob's are: the
 * client is told which turn the reply will be saved as before there is a reply,
 * so a dropped stream keeps the line the reader already saw.
 */

export const NPC: Containment = inCampaign("npc");
export const NPC_THREADS: Containment = under("npc_thread", "npc_id", NPC);
export const NPC_TURNS: Containment = under("npc_turn", "thread_id", NPC_THREADS);

/** An `npc_thread` row as the wire reads it, decoded off `npc_thread.*` by `SqlSchema`. */
const ThreadRow = classFromColumns(NpcThread, { ...NpcThread.fields, ...timestampColumns });

/**
 * An `npc_turn` row as the wire reads it: the line is `body`, and
 * `speaker_name` is there only where a query joins the speaker's account —
 * everywhere else the turn names no speaker.
 */
const TurnRow = classFromColumns(
  NpcTurn,
  {
    ...NpcTurn.fields,
    speakerName: Schema.NullOr(Schema.String).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(null)),
    ),
    createdAt: timestampColumns.createdAt,
  },
  { text: "body" },
);

/**
 * What a creator read is asked with: the proof's campaign and actor, which is
 * what its predicates take. The proof itself stays in the method signatures.
 */
const creatorFields = { campaign: CampaignId, actor: Actor } as const;
const asked = (creator: CampaignCreatorActor) => ({
  campaign: creator.campaign,
  actor: creator.actor,
});

/** The written columns of an insert, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

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
  /** Copied only for shared-session user turns, so the transcript can say who spoke. */
  readonly accountId?: AccountId;
  readonly requestId?: string;
}

export interface NpcTurnWrite {
  readonly turn: NpcTurn;
  readonly inserted: boolean;
}

export interface NpcSessionPromptContext {
  readonly sessionNumber: number;
  readonly sessionTitle: string | null;
  readonly fight: null | {
    readonly round: number;
    readonly upNext: string | null;
    readonly order: ReadonlyArray<string>;
  };
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

const blockedSessionState = (state: NpcSessionState): Conflict =>
  new Conflict({
    message:
      state === "paused"
        ? "that NPC conversation is paused by the DM"
        : "that NPC conversation is closed for this session",
  });

const alreadyClosed = new Conflict({ message: "that NPC conversation is already closed" });

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
    /** Creator action: make this shared NPC available in the active session. */
    readonly openSession: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      sessionId: SessionId,
    ) => Effect.Effect<NpcThread, NotFound | Conflict, never>;
    readonly pauseSession: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      sessionId: SessionId,
    ) => Effect.Effect<NpcThread, NotFound | Conflict, never>;
    readonly resumeSession: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      sessionId: SessionId,
    ) => Effect.Effect<NpcThread, NotFound | Conflict, never>;
    readonly closeSession: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      sessionId: SessionId,
    ) => Effect.Effect<NpcThread, NotFound | Conflict, never>;
    readonly sessionMonitor: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      model: string | null,
      available: boolean,
    ) => Effect.Effect<ReadonlyArray<NpcSessionMonitor>, NotFound, never>;
    /** Player-safe, shared live-session NPCs, visible to creator or active seated players. */
    readonly sessionList: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<ReadonlyArray<PlayerNpc>, NotFound, CurrentActor>;
    readonly sessionFind: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
    ) => Effect.Effect<PlayerNpc, NotFound, CurrentActor>;
    readonly sessionTurns: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcTurn>, NotFound, CurrentActor>;
    readonly sessionAppend: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
      draft: NpcTurnDraft,
    ) => Effect.Effect<NpcTurnWrite, NotFound | Conflict, CurrentActor>;
    readonly sessionPromptContext: (
      campaignId: CampaignId,
      sessionId: SessionId,
      npcId: NpcId,
    ) => Effect.Effect<NpcSessionPromptContext, NotFound, CurrentActor>;
  }
>()("NpcThreads") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // A session read hands the NPC back as a `PlayerNpc`, portrait included,
      // signed only on the handlers' copy of this repository (`app.ts`).
      const sign = yield* npcImageSigner;
      const live = yield* Effect.serviceOption(LiveEvents);

      const threadReachable = (
        creator: Pick<CampaignCreatorActor, "campaign" | "actor">,
        npcId: NpcId,
      ) =>
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

      const hasActiveSeat = (campaignId: CampaignId, actor: Actor) => sql`
        exists (select 1 from campaign_character
                where campaign_character.campaign_id = ${campaignId}
                  and campaign_character.account_id = ${actor.accountId}
                  and campaign_character.left_at is null
                  and campaign_character.character_id is not null)
      `;

      const sessionParticipant = (campaignId: CampaignId, sessionId: SessionId, actor: Actor) =>
        sql.or([
          campaignWritableById(sql, campaignId, actor),
          sql.and([
            hasActiveSeat(campaignId, actor),
            sql`exists (select 1 from session
                        join campaign on campaign.current_session_id = session.id
                        where campaign.id = ${campaignId}
                          and session.id = ${sessionId}
                          and ${rowReadable(sql, "session", campaignId, actor)})`,
          ]),
        ]);

      const sessionThreadReachable = (
        campaignId: CampaignId,
        sessionId: SessionId,
        npcId: NpcId,
        actor: Actor,
      ) =>
        sql.and([
          sql`npc_thread.npc_id = ${npcId}`,
          sql`npc_thread.channel = 'session_shared'`,
          sql`npc_thread.session_id = ${sessionId}`,
          sessionParticipant(campaignId, sessionId, actor),
          sql`(${campaignWritableById(sql, campaignId, actor)} or (npc_thread.visibility = 'shared' and npc_thread.session_state <> 'closed'))`,
          sql`exists (select 1 from npc
                      where npc.id = npc_thread.npc_id
                        and npc.campaign_id = ${campaignId}
                        and npc.archived_at is null
                        and (${campaignWritableById(sql, campaignId, actor)} or npc.visibility = 'shared'))`,
        ]);

      const ensureSessionParticipant = (campaignId: CampaignId, sessionId: SessionId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<{ readonly ok: boolean }>`
            select true as ok where ${sessionParticipant(campaignId, sessionId, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "session", id: sessionId });
          return actor;
        });

      const SessionNpcRequest = Schema.toType(
        Schema.Struct({ campaignId: CampaignId, sessionId: SessionId, npcId: NpcId }),
      );
      /** This NPC's table chat for this night, as the caller may reach it. */
      const sessionThread = SqlSchema.findOne({
        Request: SessionNpcRequest,
        Result: ThreadRow,
        execute: ({ campaignId, sessionId, npcId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select npc_thread.* from npc_thread
              where ${sessionThreadReachable(campaignId, sessionId, npcId, actor)}
              limit 1
            `,
          ),
      });
      const ensureSessionThread = (campaignId: CampaignId, sessionId: SessionId, npcId: NpcId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const thread = yield* sessionThread({ campaignId, sessionId, npcId }).pipe(
            orNotFound("npc_thread", npcId),
          );
          return { actor, thread };
        });

      const creatorSessionThread = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, npcId: NpcId, sessionId: SessionId }),
        ),
        Result: ThreadRow,
        execute: ({ campaign, actor, npcId, sessionId }) => sql`
          select npc_thread.* from npc_thread
          join npc on npc.id = npc_thread.npc_id
          join session on session.id = npc_thread.session_id
          join campaign on campaign.id = session.campaign_id
          where npc_thread.npc_id = ${npcId}
            and npc_thread.channel = 'session_shared'
            and npc_thread.session_id = ${sessionId}
            and npc.campaign_id = ${campaign}
            and npc.archived_at is null
            and campaign.id = ${campaign}
            and campaign.current_session_id = session.id
            and ${containedChildWritable(sql, NPC_THREADS, npcId, campaign, actor)}
          limit 1
        `,
      });
      const ensureCreatorSessionThread = (
        creator: CampaignCreatorActor,
        npcId: NpcId,
        sessionId: SessionId,
      ) =>
        creatorSessionThread({ ...asked(creator), npcId, sessionId }).pipe(
          orNotFound("npc_thread", npcId),
        );

      const setThreadState = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ id: NpcThreadId, state: NpcThread.fields.sessionState }),
        ),
        Result: ThreadRow,
        execute: ({ id, state }) => sql`
          update npc_thread
          set session_state = ${state}, updated_at = now()
          where npc_thread.id = ${id}
          returning *
        `,
      });

      const setSessionState = (
        creator: CampaignCreatorActor,
        npcId: NpcId,
        sessionId: SessionId,
        state: NpcSessionState,
      ) =>
        Effect.gen(function* () {
          const current = yield* ensureCreatorSessionThread(creator, npcId, sessionId);
          if (current.sessionState === "closed") return yield* alreadyClosed;
          if (current.sessionState === state) return current;
          // The row was just read under the creator's predicate; losing it now is a defect.
          const changed = yield* setThreadState({ id: current.id, state }).pipe(
            Effect.catchTag("NoSuchElementError", Effect.die),
          );
          yield* Option.match(live, {
            onNone: () => Effect.void,
            onSome: (events) => events.touched(sessionId),
          });
          return changed;
        });

      const CreatorNpcRequest = Schema.toType(Schema.Struct({ ...creatorFields, npcId: NpcId }));
      const PlayerNpcRequest = Schema.toType(
        Schema.Struct({ campaignId: CampaignId, npcId: NpcId }),
      );

      /** A creator's rehearsal threads with one NPC, newest first. */
      const rehearsals = SqlSchema.findAll({
        Request: CreatorNpcRequest,
        Result: ThreadRow,
        execute: ({ npcId, ...creator }) => sql`
          select npc_thread.* from npc_thread
          where ${threadReachable(creator, npcId)}
          order by npc_thread.updated_at desc, npc_thread.id desc
        `,
      });
      const rehearsal = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcThreadId })),
        Result: ThreadRow,
        execute: ({ npcId, id, ...creator }) => sql`
          select npc_thread.* from npc_thread
          where npc_thread.id = ${id} and ${threadReachable(creator, npcId)}
        `,
      });
      const rehearsalTurns = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, threadId: NpcThreadId })),
        Result: TurnRow,
        execute: ({ campaign, actor, threadId }) => sql`
          select npc_turn.* from npc_turn
          where ${containedChildWritable(sql, NPC_TURNS, threadId, campaign, actor)}
          order by npc_turn.created_at asc, npc_turn.id asc
        `,
      });
      /** A player's own private threads with one NPC, newest first. */
      const privateThreads = SqlSchema.findAll({
        Request: PlayerNpcRequest,
        Result: ThreadRow,
        execute: ({ campaignId, npcId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select npc_thread.* from npc_thread
              where ${playerThreadReachable(campaignId, npcId, actor)}
              order by npc_thread.updated_at desc, npc_thread.id desc
            `,
          ),
      });
      const privateThread = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, npcId: NpcId, id: NpcThreadId }),
        ),
        Result: ThreadRow,
        execute: ({ campaignId, npcId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select npc_thread.* from npc_thread
              where npc_thread.id = ${id} and ${playerThreadReachable(campaignId, npcId, actor)}
            `,
          ),
      });
      const privateTurns = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, npcId: NpcId, threadId: NpcThreadId }),
        ),
        Result: TurnRow,
        execute: ({ campaignId, npcId, threadId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select npc_turn.* from npc_turn
              where npc_turn.thread_id = ${threadId}
                and exists (select 1 from npc_thread where npc_thread.id = npc_turn.thread_id and ${playerThreadReachable(campaignId, npcId, actor)})
              order by npc_turn.created_at asc, npc_turn.id asc
            `,
          ),
      });
      /** A new thread. What reaches it was checked by the method that built the columns. */
      const insertThread = SqlSchema.findOne({
        Request: Columns,
        Result: ThreadRow,
        execute: (columns) => sql`insert into npc_thread ${sql.insert(columns)} returning *`,
      });
      /**
       * A turn of a rehearsal or a private chat. The turn id is minted before
       * the reply, so a second write of the same id is the finished reply
       * replacing the streamed one.
       */
      const upsertTurn = SqlSchema.findOne({
        Request: Columns,
        Result: TurnRow,
        execute: (columns) => sql`
          insert into npc_turn ${sql.insert(columns)}
          on conflict (id) do update
          set body = excluded.body,
              finish_reason = excluded.finish_reason,
              updated_at = now()
          returning *
        `,
      });
      /** The night's table chat, opened or found as it is. */
      const openTableThread = SqlSchema.findOne({
        Request: Columns,
        Result: ThreadRow,
        execute: (columns) => sql`
          insert into npc_thread ${sql.insert(columns)}
          on conflict (npc_id, session_id) where channel = 'session_shared'
          do update set updated_at = npc_thread.updated_at
          returning *
        `,
      });
      /** A table chat's lines, each user line with who said it. */
      const tableTurns = SqlSchema.findAll({
        Request: Schema.toType(Schema.Array(NpcThreadId)),
        Result: TurnRow,
        execute: (threadIds) => sql`
          select npc_turn.*, account.name as speaker_name
          from npc_turn
          left join account on account.id = npc_turn.account_id
          where npc_turn.thread_id = any(${[...threadIds]})
          order by npc_turn.thread_id, npc_turn.created_at asc, npc_turn.id asc
        `,
      });
      /**
       * A player's line at the table, unless this request already wrote it:
       * the request id is what makes a retried send land once. `None` is the
       * retry.
       */
      const insertTableTurn = SqlSchema.findOneOption({
        Request: Columns,
        Result: TurnRow,
        execute: (columns) => sql`
          insert into npc_turn ${sql.insert(columns)}
          on conflict (thread_id, account_id, request_id) where who = 'user' and request_id is not null and account_id is not null
          do nothing
          returning *
        `,
      });
      /** The line a retried request wrote the first time. */
      const requestedTurn = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            threadId: NpcThreadId,
            accountId: Schema.String,
            requestId: Schema.String,
          }),
        ),
        Result: TurnRow,
        execute: ({ threadId, accountId, requestId }) => sql`
          select npc_turn.*, account.name as speaker_name
          from npc_turn
          left join account on account.id = npc_turn.account_id
          where npc_turn.thread_id = ${threadId}
            and npc_turn.account_id = ${accountId}
            and npc_turn.request_id = ${requestId}
            and npc_turn.who = 'user'
          limit 1
        `,
      });

      /** Every table chat of this night, newest first — what the creator's monitor lists. */
      const tableThreads = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ campaign: CampaignId, sessionId: SessionId })),
        Result: ThreadRow,
        execute: ({ campaign, sessionId }) => sql`
          select npc_thread.*
          from npc_thread
          join npc on npc.id = npc_thread.npc_id
          where npc_thread.channel = 'session_shared'
            and npc_thread.session_id = ${sessionId}
            and npc.campaign_id = ${campaign}
            and npc.archived_at is null
          order by npc_thread.updated_at desc, npc_thread.id desc
        `,
      });
      /** How many proposals each thread has waiting; a thread with none has no row. */
      const pendingProposals = SqlSchema.findAll({
        Request: Schema.toType(Schema.Array(NpcThreadId)),
        Result: fromColumns(Schema.Struct({ threadId: NpcThreadId, count: Schema.Int })),
        execute: (threadIds) => sql`
          select npc_proposal.thread_id, count(*)::int as count
          from npc_proposal
          where npc_proposal.thread_id = any(${[...threadIds]})
            and npc_proposal.state = 'pending'
          group by npc_proposal.thread_id
        `,
      });
      /** How each thread's latest NPC line ended; a thread the NPC has not spoken in has no row. */
      const lastFinishes = SqlSchema.findAll({
        Request: Schema.toType(Schema.Array(NpcThreadId)),
        Result: fromColumns(
          Schema.Struct({ threadId: NpcThreadId, finishReason: Schema.NullOr(Schema.String) }),
        ),
        execute: (threadIds) => sql`
          select distinct on (npc_turn.thread_id) npc_turn.thread_id, npc_turn.finish_reason
          from npc_turn
          where npc_turn.thread_id = any(${[...threadIds]})
            and npc_turn.who = 'npc'
          order by npc_turn.thread_id, npc_turn.created_at desc, npc_turn.id desc
        `,
      });

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* rehearsals({ ...asked(creator), npcId });
            }),
          ),

        findById: (creator, npcId, id) =>
          dieOnSqlError(
            rehearsal({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_thread", id)),
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
              // An insert answers with its row; not getting one is a defect.
              return yield* insertThread({
                npc_id: npcId,
                channel: "rehearsal",
                title: titleFrom(firstLine),
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        turns: (creator, npcId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureThread(creator, npcId, threadId);
              return yield* rehearsalTurns({ ...asked(creator), threadId });
            }),
          ),

        append: (creator, npcId, threadId, draft) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureThread(creator, npcId, threadId);
                const turn = yield* upsertTurn(
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
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                yield* sql`
                  update npc_thread set updated_at = now()
                  where npc_thread.id = ${threadId} and ${threadReachable(creator, npcId)}
                `;
                return turn;
              }),
            ),
          ),

        playerList: (campaignId, npcId) => dieOnSqlError(privateThreads({ campaignId, npcId })),

        playerFindById: (campaignId, npcId, id) =>
          dieOnSqlError(
            privateThread({ campaignId, npcId, id }).pipe(orNotFound("npc_thread", id)),
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
                return yield* insertThread({
                  npc_id: npcId,
                  account_id: actor.accountId,
                  channel: "player_direct",
                  title: titleFrom(firstLine),
                }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              }),
            ),
          ),

        playerTurns: (campaignId, npcId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensurePlayerThread(campaignId, npcId, threadId);
              return yield* privateTurns({ campaignId, npcId, threadId });
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
                const turn = yield* upsertTurn(
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
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                yield* sql`
                  update npc_thread set updated_at = now()
                  where npc_thread.id = ${threadId} and ${playerThreadReachable(campaignId, npcId, actor)}
                `;
                return turn;
              }),
            ),
          ),

        openSession: (creator, npcId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const thread = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const reachable = yield* sql<{ readonly id: NpcId }>`
                    select npc.id from npc
                    join campaign on campaign.id = npc.campaign_id
                    join session on session.id = ${sessionId}
                    where npc.id = ${npcId}
                      and npc.archived_at is null
                      and session.campaign_id = campaign.id
                      and campaign.current_session_id = session.id
                      and ${containedChildWritable(sql, NPC, npcId, creator.campaign, creator.actor)}
                  `;
                  if (reachable.length === 0)
                    return yield* new NotFound({ resource: "npc", id: npcId });
                  const row = yield* openTableThread({
                    npc_id: npcId,
                    session_id: sessionId,
                    channel: "session_shared",
                    visibility: "shared",
                    session_state: "open",
                    title: "At the table",
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  if (row.sessionState === "closed") return yield* blockedSessionState("closed");
                  return row;
                }),
              );
              yield* Option.match(live, {
                onNone: () => Effect.void,
                onSome: (events) => events.touched(sessionId),
              });
              return thread;
            }),
          ),

        pauseSession: (creator, npcId, sessionId) =>
          dieOnSqlError(setSessionState(creator, npcId, sessionId, "paused")),

        resumeSession: (creator, npcId, sessionId) =>
          dieOnSqlError(setSessionState(creator, npcId, sessionId, "open")),

        closeSession: (creator, npcId, sessionId) =>
          dieOnSqlError(setSessionState(creator, npcId, sessionId, "closed")),

        sessionMonitor: (creator, sessionId, model, configured) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const sessionRows = yield* sql<{ readonly id: SessionId }>`
                select session.id
                from session
                join campaign on campaign.id = session.campaign_id
                where session.id = ${sessionId}
                  and campaign.id = ${creator.campaign}
                  and campaign.current_session_id = session.id
                  and ${campaignWritableById(sql, creator.campaign, creator.actor)}
              `;
              if (sessionRows.length === 0)
                return yield* new NotFound({ resource: "session", id: sessionId });

              const threads = yield* tableThreads({ campaign: creator.campaign, sessionId });
              if (threads.length === 0) return [];
              const threadIds = threads.map((thread) => thread.id);

              // Everything below is one statement per kind of child for every
              // open thread at once, filed back by thread id: the monitor is
              // re-read on every doorbell during play, and it used to cost four
              // statements per thread. `npc-session-monitor.test.ts` holds the
              // count. The ids came out of the creator's query above, so these
              // need no predicate of their own.
              // A night has one table chat per NPC, so the NPC's id names its thread here.
              const npcRows = yield* sql<PlayerNpcRow>`
                select ${playerNpcColumns(sql)}, npc_thread.session_state
                from npc
                join npc_thread on npc_thread.npc_id = npc.id
                where npc_thread.id = any(${threadIds})
              `;
              const npcOf = new Map(npcRows.map((row) => [row.id, row]));
              const turnsOf = Arr.groupBy(yield* tableTurns(threadIds), (turn) => turn.threadId);
              const pendingOf = new Map(
                (yield* pendingProposals(threadIds)).map((row) => [row.threadId, row.count]),
              );
              const finishOf = new Map(
                (yield* lastFinishes(threadIds)).map((row) => [row.threadId, row.finishReason]),
              );

              return threads.map((thread) => {
                const finish = finishOf.get(thread.id) ?? null;
                const lastFailure =
                  finish === null || finish === "stop" ? null : `Last reply ended with ${finish}.`;
                return new NpcSessionMonitor({
                  npc: toPlayerNpc(npcOf.get(thread.npcId)!, sign),
                  thread,
                  turns: turnsOf[thread.id] ?? [],
                  pendingProposals: pendingOf.get(thread.id) ?? 0,
                  available: configured && thread.sessionState === "open",
                  model,
                  lastFailure: configured ? lastFailure : "No model is configured behind NPC chat.",
                });
              });
            }),
          ),

        sessionList: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* ensureSessionParticipant(campaignId, sessionId);
              const rows = yield* sql<PlayerNpcRow>`
                select ${playerNpcColumns(sql)}, npc_thread.session_state
                from npc
                join npc_thread on npc_thread.npc_id = npc.id
                where npc_thread.channel = 'session_shared'
                  and npc_thread.session_id = ${sessionId}
                  and ${sessionParticipant(campaignId, sessionId, actor)}
                  and npc.campaign_id = ${campaignId}
                  and npc.archived_at is null
                  and (${campaignWritableById(sql, campaignId, actor)} or (npc.visibility = 'shared' and npc_thread.visibility = 'shared' and npc_thread.session_state <> 'closed'))
                order by npc.name asc, npc.id asc
              `;
              return rows.map((row) => toPlayerNpc(row, sign));
            }),
          ),

        sessionFind: (campaignId, sessionId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<PlayerNpcRow>`
                select ${playerNpcColumns(sql)}, npc_thread.session_state
                from npc
                join npc_thread on npc_thread.npc_id = npc.id
                where npc.id = ${npcId}
                  and ${sessionThreadReachable(campaignId, sessionId, npcId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc", id: npcId });
              return toPlayerNpc(rows[0]!, sign);
            }),
          ),

        sessionTurns: (campaignId, sessionId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const { thread } = yield* ensureSessionThread(campaignId, sessionId, npcId);
              return yield* tableTurns([thread.id]);
            }),
          ),

        sessionAppend: (campaignId, sessionId, npcId, draft) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const written = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const { actor, thread } = yield* ensureSessionThread(
                    campaignId,
                    sessionId,
                    npcId,
                  );
                  if (draft.who === "user" && thread.sessionState !== "open") {
                    return yield* blockedSessionState(thread.sessionState);
                  }
                  const accountId = draft.accountId ?? actor.accountId;
                  const inserted = yield* insertTableTurn(
                    defined({
                      id: draft.id,
                      thread_id: thread.id,
                      who: draft.who,
                      body: draft.text,
                      account_id: draft.who === "user" ? accountId : undefined,
                      request_id: draft.who === "user" ? draft.requestId : undefined,
                      template_version: draft.templateVersion,
                      prompt_tokens: draft.promptTokens,
                      model: draft.model,
                      finish_reason: draft.finishReason,
                      ...(draft.who === "npc" ? { origin: "assistant" } : {}),
                    }),
                  );
                  if (Option.isNone(inserted)) {
                    // A retry: answer with the line the first attempt wrote.
                    const turn = yield* requestedTurn({
                      threadId: thread.id,
                      accountId,
                      requestId: draft.requestId ?? "",
                    }).pipe(orNotFound("npc_turn", draft.id));
                    return { turn, inserted: false };
                  }
                  yield* sql`update npc_thread set updated_at = now() where npc_thread.id = ${thread.id}`;
                  return { turn: inserted.value, inserted: true };
                }),
              );
              if (written.inserted) {
                yield* Option.match(live, {
                  onNone: () => Effect.void,
                  onSome: (events) => events.touched(sessionId),
                });
              }
              return written;
            }),
          ),

        sessionPromptContext: (campaignId, sessionId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureSessionThread(campaignId, sessionId, npcId);
              const sessionRows = yield* sql<{
                readonly number: number;
                readonly title: string | null;
              }>`
                select session.number, session.title
                from session
                where session.id = ${sessionId}
              `;
              const runRows = yield* sql<{
                readonly id: string;
                readonly round: number;
                readonly active_name: string | null;
              }>`
                select encounter_run.id::text as id, encounter_run.round, active.display_name as active_name
                from encounter_run
                left join combatant active on active.id = encounter_run.active_combatant_id and active.visibility = 'shared'
                where encounter_run.session_id = ${sessionId}
                  and encounter_run.ended_at is null
                  and encounter_run.visibility = 'shared'
                limit 1
              `;
              const fight =
                runRows[0] === undefined
                  ? null
                  : {
                      round: runRows[0].round,
                      upNext: runRows[0].active_name,
                      order: (yield* sql<{ readonly display_name: string }>`
                  select combatant.display_name
                  from combatant
                  where combatant.encounter_run_id = ${runRows[0].id}
                    and combatant.visibility = 'shared'
                  ${initiativeOrder(sql)}
                `).map((row) => row.display_name),
                    };
              return {
                sessionNumber: sessionRows[0]?.number ?? 0,
                sessionTitle: sessionRows[0]?.title ?? null,
                fight,
              };
            }),
          ),
      };
    }),
  );
}
