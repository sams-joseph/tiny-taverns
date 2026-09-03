import {
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  CurrentActor,
  type GroupId,
  type HobProposal,
  HobThread,
  HobTurn,
  type HobWho,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
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
 * A thread is campaign-scoped like a note and a turn hangs off a thread like a
 * prep item hangs off a session, so **this repository writes no predicate of its
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
 * verbatim, one table across.
 *
 * The one thing here that is not ordinary CRUD is that turn ids are **generated
 * in TypeScript** rather than by the column default. `Hob.ask` has to tell the
 * client which turn its answer will be saved as *before* the answer exists —
 * that is the id an accept names — and a row inserted at the end of a stream
 * cannot supply an id at the start of one. Same reason `EncounterRuns.resume`
 * generates combatant ids ahead of its insert.
 */

interface ThreadRow extends ProvenanceColumns {
  readonly id: AssistantThreadId;
  readonly campaign_id: CampaignId | null;
  readonly group_id: GroupId | null;
  readonly title: string;
}

interface TurnRow extends ProvenanceColumns {
  readonly id: AssistantTurnId;
  readonly thread_id: AssistantThreadId;
  readonly who: HobWho;
  readonly body: string;
  /** `jsonb`; the pg driver parses it, so this arrives as the document itself. */
  readonly proposal: HobProposal | null;
  readonly accepted_at: Date | null;
}

const toThread = (row: ThreadRow): HobThread => {
  const { createdAt, updatedAt } = provenanceOf(row);
  return new HobThread({
    id: row.id,
    campaignId: row.campaign_id,
    groupId: row.group_id,
    title: row.title,
    createdAt,
    updatedAt,
  });
};

export const toTurn = (row: TurnRow): HobTurn =>
  new HobTurn({
    id: row.id,
    threadId: row.thread_id,
    who: row.who,
    text: row.body,
    proposal: row.proposal,
    acceptedAt: row.accepted_at === null ? null : DateTime.fromDateUnsafe(row.accepted_at),
    createdAt: provenanceOf(row).createdAt,
  });

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

/** What `Hob.ask` appends. `id` is supplied so the client can be told it early. */
export interface TurnDraft {
  readonly id: AssistantTurnId;
  readonly who: HobWho;
  readonly text: string;
  readonly proposal?: HobProposal;
}

export class HobThreads extends Context.Service<
  HobThreads,
  {
    /** Newest first — the panel resumes the one at the front. */
    readonly list: (
      reach: ConversationReach,
      scopeId: CampaignId | GroupId,
    ) => Effect.Effect<ReadonlyArray<HobThread>, NotFound, CurrentActor>;
    readonly findById: (
      reach: ConversationReach,
      scopeId: CampaignId | GroupId,
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
      scopeId: CampaignId | GroupId,
      firstQuestion: string,
    ) => Effect.Effect<HobThread, NotFound, CurrentActor>;
    /** Oldest first: a conversation, read in the order it happened. */
    readonly turns: (
      reach: ConversationReach,
      scopeId: CampaignId | GroupId,
      threadId: AssistantThreadId,
    ) => Effect.Effect<ReadonlyArray<HobTurn>, NotFound, CurrentActor>;
    readonly append: (
      reach: ConversationReach,
      scopeId: CampaignId | GroupId,
      threadId: AssistantThreadId,
      draft: TurnDraft,
    ) => Effect.Effect<HobTurn, NotFound, CurrentActor>;
  }
>()("HobThreads") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (reach, scopeId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* reach === "group"
                ? ensureGroupReadable(sql, scopeId as GroupId, actor)
                : ensureCampaignReadable(sql, scopeId as CampaignId, actor);
              const rows = yield* sql<ThreadRow>`
                select assistant_thread.* from assistant_thread
                where ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
                order by assistant_thread.updated_at desc, assistant_thread.id desc
              `;
              return rows.map(toThread);
            }),
          ),

        findById: (reach, scopeId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<ThreadRow>`
                select assistant_thread.* from assistant_thread
                where assistant_thread.id = ${id}
                  and ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "assistant_thread", id });
              }
              return toThread(rows[0]!);
            }),
          ),

        reachOf: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<Pick<ThreadRow, "id"> & { account_id: string | null }>`
                select assistant_thread.id, assistant_thread.account_id from assistant_thread
                where assistant_thread.id = ${id}
                  and (${conversationReachable(sql, "assistant_thread", "dm", campaignId, actor)}
                    or ${conversationReachable(sql, "assistant_thread", "own", campaignId, actor)})
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "assistant_thread", id });
              }
              return rows[0]!.account_id === null ? ("dm" as const) : ("own" as const);
            }),
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
              // Three gates for three scopes: the DM's thread needs the
              // campaign writable, a player's needs it readable, and the
              // group's needs a live group membership — the chronicle's own
              // gate, because the group's conversation is the group's.
              yield* reach === "group"
                ? ensureGroupReadable(sql, scopeId as GroupId, actor)
                : reach === "own"
                  ? ensureCampaignReadable(sql, scopeId as CampaignId, actor)
                  : ensureCampaignWritable(sql, scopeId as CampaignId, actor);
              const rows = yield* sql<ThreadRow>`
                insert into assistant_thread ${sql.insert(
                  defined({
                    campaign_id: reach === "group" ? undefined : scopeId,
                    group_id: reach === "group" ? scopeId : undefined,
                    account_id: reach === "own" ? actor.accountId : undefined,
                    title: titleFrom(firstQuestion),
                  }),
                )}
                returning *
              `;
              return toThread(rows[0]!);
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
              const rows = yield* sql<TurnRow>`
                select assistant_turn.* from assistant_turn
                where ${conversationTurnReachable(sql, TURNS, reach, threadId, scopeId, actor)}
                order by assistant_turn.created_at asc, assistant_turn.id asc
              `;
              return rows.map(toTurn);
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
                const rows = yield* sql<TurnRow>`
                  insert into assistant_turn ${sql.insert(
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
                  )}
                  returning *
                `;
                // A thread's `updated_at` is what orders the list, so it has to
                // move when the conversation does — the thread row itself never
                // changes otherwise.
                yield* sql`
                  update assistant_thread set updated_at = now()
                  where assistant_thread.id = ${threadId}
                    and ${conversationReachable(sql, "assistant_thread", reach, scopeId, actor)}
                `;
                return toTurn(rows[0]!);
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
export const lockTurnForAccept = (
  sql: SqlClient.SqlClient,
  reach: ConversationReach,
  scopeId: CampaignId | GroupId,
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;
    const rows = yield* sql<TurnRow>`
      select assistant_turn.* from assistant_turn
      where assistant_turn.id = ${turnId}
        and ${conversationTurnReachable(sql, TURNS, reach, threadId, scopeId, actor)}
      for update
    `;
    if (rows.length === 0) {
      return yield* new NotFound({ resource: "assistant_turn", id: turnId });
    }
    return rows[0]!;
  });

/** Records that a human said yes, in the transaction that made the row. */
export const markAccepted = (sql: SqlClient.SqlClient, turnId: AssistantTurnId) =>
  sql`update assistant_turn set accepted_at = now(), updated_at = now() where assistant_turn.id = ${turnId}`;
