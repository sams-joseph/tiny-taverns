import {
  AccountId,
  type Actor,
  AssistantThreadId,
  AssistantTurnId,
  CampaignId,
  CurrentActor,
  Conflict,
  SharedWorldId,
  type HobKept,
  HobProposal,
  HobThread,
  HobTurn,
  type HobWho,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  timestampColumns,
} from "./rows.js";
import {
  type ConversationReach,
  conversationReachable,
  conversationTurnReachable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  ensureConversationReachable,
  ensureGroupReadable,
  type NestedTable,
} from "./visibility.js";

/**
 * The conversation with Hob, as rows.
 *
 * A thread is scoped like a note (to a campaign, a Shared World, or for drafting
 * with no campaign an account alone) and a turn hangs off a thread like a prep
 * item hangs off a session, so **this repository writes no predicate of its
 * own** — it is `repo/visibility.ts`'s `conversationReachable` and the existing
 * `NestedTable` machinery, applied to two more tables. A campaign-scoped
 * credential cannot reach another table's conversations for exactly the reason
 * it cannot reach another table's notes: `campaignInScope` is inside the clause
 * it inherits.
 *
 * ### Every method takes a reach, and it is one argument rather than a twin
 *
 * A conversation belongs either to the campaign (the DM's, `account_id is
 * null`) or to one account (a player's, drafting a character). `character`
 * answers that shape with twins — `create`/`createOwn`, `update`/`updateOwn` —
 * because its two paths differ in their *payload* as well as in whose row they
 * reach. Here nothing differs but whose it is: the same thread, the same turn,
 * the same insert. So `reach` is a parameter, the way `Memberships.mine` takes
 * a shelf, and the choice between the two predicates is made once in
 * `repo/visibility.ts` instead of five times here.
 *
 * The one method where the reaches genuinely diverge is `start`, and the
 * difference is the gate: a DM's thread needs `ensureCampaignWritable`, which
 * is exactly what made a player unable to ask at all, and a player's needs
 * `ensureCampaignReadable` — the campaign half of `withinReadableCampaign`, so
 * a thread started through it is reachable by its author afterwards by the same
 * clauses rather than by two rules kept in step. That is `Characters.createOwn`
 * verbatim, one table across. An `"account"` thread (drafting with no campaign)
 * has no gate, like `Characters.createCore`: it names nothing but its author.
 *
 * The one thing here that is not ordinary CRUD is that turn ids are **generated
 * in TypeScript** rather than by the column default. `Hob.ask` has to tell the
 * client which turn its answer will be saved as *before* the answer exists —
 * that is the id an accept names — and a row inserted at the end of a stream
 * cannot supply an id at the start of one. Same reason `EncounterRuns.resume`
 * generates combatant ids ahead of its insert.
 */

/**
 * An `assistant_thread` row as the wire reads it, decoded off
 * `assistant_thread.*` by `SqlSchema`. The wire's `worldId` is `group_id`;
 * `account_id` and the provenance tail are not on the wire and the decode
 * drops them.
 */
const ThreadRow = classFromColumns(
  HobThread,
  { ...HobThread.fields, ...timestampColumns },
  { worldId: "group_id" },
);

/**
 * An `assistant_turn` row as the wire reads it: `text` is `body`, and
 * `proposal` is the `jsonb` document the driver has already parsed.
 */
const TurnRow = classFromColumns(
  HobTurn,
  {
    ...HobTurn.fields,
    acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    discardedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    createdAt: Schema.DateTimeUtcFromDate,
  },
  { text: "body" },
);

/**
 * What an accept or a discard reads off the turn it locks: its proposal, and
 * whether a person already answered it.
 */
const LockedTurnRow = fromColumns(
  Schema.Struct({
    id: AssistantTurnId,
    proposal: Schema.NullOr(HobProposal),
    acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    discardedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  }),
);

/** `assistant_turn` hangs off `assistant_thread`, which hangs off `campaign`. */
export const TURNS: NestedTable = {
  table: "assistant_turn",
  parent: "assistant_thread",
  foreignKey: "thread_id",
};

/** A thread's name is the question that started it, shortened rather than cut mid-word. */
const titleFrom = (text: string): string => {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * What a thread is scoped to: the campaign for `"dm"`/`"own"`, the Shared
 * World for `"sharedWorld"`, and the actor's own account for `"account"`.
 */
export type ConversationScope = CampaignId | SharedWorldId | AccountId;

/** What `Hob.ask` appends. `id` is supplied so the client can be told it early. */
export interface TurnDraft {
  readonly id: AssistantTurnId;
  readonly who: HobWho;
  readonly text: string;
  readonly proposal?: HobProposal;
}

/** What a conversation read is asked with: whose conversation, and in which scope. */
const reachFields = {
  reach: Schema.Literals(["dm", "own", "sharedWorld", "account"]),
  scopeId: Schema.Union([CampaignId, SharedWorldId, AccountId]),
} as const;
const ReachRequest = Schema.toType(Schema.Struct(reachFields));

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

export class HobThreads extends Context.Service<
  HobThreads,
  {
    /** Newest first — the panel resumes the one at the front. */
    readonly list: (
      reach: ConversationReach,
      scopeId: ConversationScope,
    ) => Effect.Effect<ReadonlyArray<HobThread>, NotFound, CurrentActor>;
    readonly findById: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      id: AssistantThreadId,
    ) => Effect.Effect<HobThread, NotFound, CurrentActor>;
    /**
     * Which reach a named campaign thread answers to, read off the row.
     *
     * A creator holds threads in **both** campaign sets now — the campaign's
     * own conversation, and drafting threads of their own (see `HobAsk.intent`)
     * — so a handler that derived one reach from the `CampaignCreatorActor`
     * proof would 404 a creator's own thread. The thread's shape is the one
     * answer that cannot be wrong: `account_id` null is the campaign's,
     * an account's is its owner's. The row is only read through the disjunction
     * of the two complete predicates, so an unreachable thread is still the
     * ordinary `NotFound` and neither arm widens the other — the
     * `copyableIntoCampaign` shape, one table across.
     */
    readonly reachOf: (
      campaignId: CampaignId,
      id: AssistantThreadId,
    ) => Effect.Effect<"dm" | "own", NotFound, CurrentActor>;
    /** Starts one, named after the question that started it. */
    readonly start: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      firstQuestion: string,
    ) => Effect.Effect<HobThread, NotFound, CurrentActor>;
    /** Oldest first: a conversation, read in the order it happened. */
    readonly turns: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      threadId: AssistantThreadId,
    ) => Effect.Effect<ReadonlyArray<HobTurn>, NotFound, CurrentActor>;
    readonly append: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      threadId: AssistantThreadId,
      draft: TurnDraft,
    ) => Effect.Effect<HobTurn, NotFound, CurrentActor>;
    /**
     * A person turning a proposal down: it stays on its turn and stops being
     * an offer (`0080`). Writes nothing else, so it needs no more than the
     * reach every read of the turn needs. Discarding twice is one discard;
     * a turn with no proposal is `NotFound` about the proposal, as the accept
     * answers it, and one already kept is a `Conflict`.
     */
    readonly discard: (
      reach: ConversationReach,
      scopeId: ConversationScope,
      threadId: AssistantThreadId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<void, NotFound | Conflict, CurrentActor>;
  }
>()("HobThreads") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const threads = SqlSchema.findAll({
        Request: ReachRequest,
        Result: ThreadRow,
        execute: ({ reach, scopeId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select assistant_thread.* from assistant_thread
              where ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
              order by assistant_thread.updated_at desc, assistant_thread.id desc
            `,
          ),
      });
      const thread = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...reachFields, id: AssistantThreadId })),
        Result: ThreadRow,
        execute: ({ reach, scopeId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select assistant_thread.* from assistant_thread
              where assistant_thread.id = ${id}
                and ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
            `,
          ),
      });
      /** Whose a campaign thread is, read through either complete predicate. */
      const threadOwner = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: AssistantThreadId })),
        Result: fromColumns(
          Schema.Struct({ id: AssistantThreadId, accountId: Schema.NullOr(Schema.String) }),
        ),
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select assistant_thread.id, assistant_thread.account_id from assistant_thread
              where assistant_thread.id = ${id}
                and (${conversationReachable(sql, "assistant_thread", "dm", campaignId, actor)}
                  or ${conversationReachable(sql, "assistant_thread", "own", campaignId, actor)})
            `,
          ),
      });
      const insertThread = SqlSchema.findOne({
        Request: Columns,
        Result: ThreadRow,
        execute: (columns) => sql`insert into assistant_thread ${sql.insert(columns)} returning *`,
      });
      const threadTurns = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...reachFields, threadId: AssistantThreadId })),
        Result: TurnRow,
        execute: ({ reach, scopeId, threadId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select assistant_turn.* from assistant_turn
              where ${conversationTurnReachable(sql, TURNS, reach, threadId, scopeId, actor)}
              order by assistant_turn.created_at asc, assistant_turn.id asc
            `,
          ),
      });
      const upsertTurn = SqlSchema.findOne({
        Request: Columns,
        Result: TurnRow,
        execute: (columns) => sql`
          insert into assistant_turn ${sql.insert(columns)}
          on conflict (id) do update
          set body = excluded.body,
              proposal = excluded.proposal,
              updated_at = now()
          returning *
        `,
      });

      return {
        list: (reach, scopeId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // An account's threads have no container to gate on: the
              // predicate below answers them, and another account's are none.
              if (reach === "sharedWorld") {
                yield* ensureGroupReadable(sql, scopeId as SharedWorldId, actor);
              } else if (reach !== "account") {
                yield* ensureCampaignReadable(sql, scopeId as CampaignId, actor);
              }
              return yield* threads({ reach, scopeId });
            }),
          ),

        findById: (reach, scopeId, id) =>
          dieOnSqlError(thread({ reach, scopeId, id }).pipe(orNotFound("assistant_thread", id))),

        reachOf: (campaignId, id) =>
          dieOnSqlError(
            threadOwner({ campaignId, id }).pipe(
              orNotFound("assistant_thread", id),
              Effect.map((row) => (row.accountId === null ? ("dm" as const) : ("own" as const))),
            ),
          ),

        /**
         * The one place the two reaches differ by more than a `WHERE` — see the
         * class doc. `account_id` is the actor's own and is written *here*,
         * from the credential: `HobAsk` has no field for one and neither has
         * any path, so there is no request shape that starts a conversation for
         * somebody else. The `Invites.redeem` shape, a third time.
         */
        start: (reach, scopeId, firstQuestion) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // Four gates for four scopes: the DM's thread needs the
              // campaign writable, a player's needs it readable, the group's
              // needs a live group membership — the chronicle's own gate,
              // because the group's conversation is the group's — and an
              // account's needs only to be the actor's own account.
              if (reach === "account") {
                if (scopeId !== actor.accountId) {
                  return yield* new NotFound({ resource: "account", id: scopeId });
                }
              } else {
                yield* reach === "sharedWorld"
                  ? ensureGroupReadable(sql, scopeId as SharedWorldId, actor)
                  : reach === "own"
                    ? ensureCampaignReadable(sql, scopeId as CampaignId, actor)
                    : ensureCampaignWritable(sql, scopeId as CampaignId, actor);
              }
              // An insert answers with its row; not getting one is a defect.
              return yield* insertThread(
                defined({
                  campaign_id: reach === "dm" || reach === "own" ? scopeId : undefined,
                  group_id: reach === "sharedWorld" ? scopeId : undefined,
                  account_id: reach === "own" || reach === "account" ? actor.accountId : undefined,
                  title: titleFrom(firstQuestion),
                }),
              ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        turns: (reach, scopeId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // Names the thread, so an unreachable one is a 404 about the
              // thread rather than an empty conversation that reads as "you
              // never asked Hob anything".
              yield* ensureConversationReachable(
                sql,
                "assistant_thread",
                reach,
                threadId,
                scopeId,
                actor,
              );
              return yield* threadTurns({ reach, scopeId, threadId });
            }),
          ),

        append: (reach, scopeId, threadId, draft) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureConversationReachable(
                  sql,
                  "assistant_thread",
                  reach,
                  threadId,
                  scopeId,
                  actor,
                );
                const turn = yield* upsertTurn(
                  defined({
                    id: draft.id,
                    thread_id: threadId,
                    who: draft.who,
                    body: draft.text,
                    proposal:
                      draft.proposal === undefined ? undefined : JSON.stringify(draft.proposal),
                    // A hob turn is the assistant's own content, and the turn
                    // that produced it is itself. See `0010`.
                    ...(draft.who === "hob"
                      ? { origin: "assistant", assistant_turn_id: draft.id }
                      : {}),
                  }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                // A thread's `updated_at` is what orders the list, so it has to
                // move when the conversation does — the thread row itself never
                // changes otherwise.
                yield* sql`
                  update assistant_thread set updated_at = now()
                  where assistant_thread.id = ${threadId}
                    and ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
                `;
                return turn;
              }),
            ),
          ),

        discard: (reach, scopeId, threadId, turnId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // The accept's lock, so a keep and a discard pressed together
                // are one answer and one `Conflict`, never both.
                const turn = yield* lockTurnForAccept(sql, reach, scopeId, threadId, turnId);
                if (turn.proposal === null) {
                  return yield* new NotFound({ resource: "proposal", id: turnId });
                }
                if (turn.acceptedAt !== null) {
                  return yield* new Conflict({ message: "that is already kept" });
                }
                if (turn.discardedAt !== null) return;
                yield* sql`
                  update assistant_turn set discarded_at = now(), updated_at = now()
                  where assistant_turn.id = ${turnId}
                `;
              }),
            ),
          ),
      };
    }),
  );
}

/**
 * The turn an accept names, locked for the write that follows it.
 *
 * Not a method on the service because it is not a read anyone else should have:
 * it is the first statement of `Proposals.accept`'s transaction and it exists to
 * take the row lock that makes a double-tapped *Save to session* one row rather
 * than two. `for update` on the turn is the whole of the idempotency story —
 * cheaper than the partial unique index `combatant.damage` needed, because
 * there is exactly one thing a turn can produce.
 */
export const reserveHobTurn = (
  sql: SqlClient.SqlClient,
  reach: ConversationReach,
  scopeId: ConversationScope,
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
  actor: Actor,
) =>
  Effect.gen(function* () {
    yield* ensureConversationReachable(sql, "assistant_thread", reach, threadId, scopeId, actor);
    yield* sql`
      insert into assistant_turn (id, thread_id, who, body, origin, assistant_turn_id)
      values (${turnId}, ${threadId}, 'hob', '', 'assistant', ${turnId})
      on conflict (id) do nothing
    `;
    yield* sql`
      update assistant_thread set updated_at = now()
      where assistant_thread.id = ${threadId}
        and ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
    `;
  });

export const lockTurnForAccept = (
  sql: SqlClient.SqlClient,
  reach: ConversationReach,
  scopeId: ConversationScope,
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
) =>
  Effect.flatMap(Effect.service(CurrentActor), (actor) =>
    SqlSchema.findOne({
      Request: Schema.toType(AssistantTurnId),
      Result: LockedTurnRow,
      execute: (id) => sql`
        select assistant_turn.* from assistant_turn
        where assistant_turn.id = ${id}
          and ${conversationTurnReachable(sql, TURNS, reach, threadId, scopeId, actor)}
        for update
      `,
    })(turnId).pipe(orNotFound("assistant_turn", turnId)),
  );

/**
 * Records that a human said yes, in the transaction that made the row, and
 * what it made — the pointer a kept card's *Open it* follows (`HobKept`).
 */
export const markAccepted = (sql: SqlClient.SqlClient, turnId: AssistantTurnId, kept: HobKept) =>
  sql`
    update assistant_turn
    set accepted_at = now(), kept = ${JSON.stringify(kept)}, updated_at = now()
    where assistant_turn.id = ${turnId}
  `;

/** A discarded proposal is no longer an offer, so there is nothing to accept. */
export const discardedConflict = new Conflict({ message: "that was discarded" });
