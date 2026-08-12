import {
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  CurrentActor,
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
  ensureCampaignReadable,
  ensureCampaignWritable,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

/**
 * The conversation with Hob, as rows.
 *
 * A thread is campaign-scoped like a note and a turn hangs off a thread like a
 * prep item hangs off a session, so **this repository writes no predicate of its
 * own** — it is `rowReadable`/`rowWritable` and the existing `NestedTable`
 * machinery, applied to two more tables. A campaign-scoped credential cannot
 * reach another table's conversations for exactly the reason it cannot reach
 * another table's notes: `campaignInScope` is inside the clause it inherits.
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
  readonly campaign_id: CampaignId;
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
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<HobThread>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: AssistantThreadId,
    ) => Effect.Effect<HobThread, NotFound, CurrentActor>;
    /** Starts one, named after the question that started it. */
    readonly start: (
      campaignId: CampaignId,
      firstQuestion: string,
    ) => Effect.Effect<HobThread, NotFound, CurrentActor>;
    /** Oldest first: a conversation, read in the order it happened. */
    readonly turns: (
      campaignId: CampaignId,
      threadId: AssistantThreadId,
    ) => Effect.Effect<ReadonlyArray<HobTurn>, NotFound, CurrentActor>;
    readonly append: (
      campaignId: CampaignId,
      threadId: AssistantThreadId,
      draft: TurnDraft,
    ) => Effect.Effect<HobTurn, NotFound, CurrentActor>;
  }
>()("HobThreads") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<ThreadRow>`
                select assistant_thread.* from assistant_thread
                where ${rowReadable(sql, "assistant_thread", campaignId, actor)}
                order by assistant_thread.updated_at desc, assistant_thread.id desc
              `;
              return rows.map(toThread);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<ThreadRow>`
                select assistant_thread.* from assistant_thread
                where assistant_thread.id = ${id}
                  and ${rowReadable(sql, "assistant_thread", campaignId, actor)}
              `;
              if (rows.length === 0) {
                return yield* new NotFound({ resource: "assistant_thread", id });
              }
              return toThread(rows[0]!);
            }),
          ),

        start: (campaignId, firstQuestion) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignWritable(sql, campaignId, actor);
              const rows = yield* sql<ThreadRow>`
                insert into assistant_thread ${sql.insert({
                  campaign_id: campaignId,
                  title: titleFrom(firstQuestion),
                })}
                returning *
              `;
              return toThread(rows[0]!);
            }),
          ),

        turns: (campaignId, threadId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // Names the thread, so an unreachable one is a 404 about the
              // thread rather than an empty conversation that reads as "you
              // never asked Hob anything".
              yield* ensureNestedParentReadable(sql, TURNS, threadId, campaignId, actor);
              const rows = yield* sql<TurnRow>`
                select assistant_turn.* from assistant_turn
                where ${nestedRowReadable(sql, TURNS, threadId, campaignId, actor)}
                order by assistant_turn.created_at asc, assistant_turn.id asc
              `;
              return rows.map(toTurn);
            }),
          ),

        append: (campaignId, threadId, draft) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureNestedParentWritable(sql, TURNS, threadId, campaignId, actor);
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
                    and ${rowWritable(sql, "assistant_thread", campaignId, actor)}
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
  campaignId: CampaignId,
  threadId: AssistantThreadId,
  turnId: AssistantTurnId,
) =>
  Effect.gen(function* () {
    const actor = yield* CurrentActor;
    const rows = yield* sql<TurnRow>`
      select assistant_turn.* from assistant_turn
      where assistant_turn.id = ${turnId}
        and ${nestedRowWritable(sql, TURNS, threadId, campaignId, actor)}
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
