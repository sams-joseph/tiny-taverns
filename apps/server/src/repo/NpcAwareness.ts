import {
  type Actor,
  type AssistantTurnId,
  CampaignId,
  Conflict,
  NpcAwarenessCandidate,
  type NpcAwarenessCandidateApprove,
  NpcAwarenessCandidateId,
  type NpcAwarenessCandidateKind,
  type NpcAwarenessCandidateReject,
  type NpcAwarenessCandidateUpdate,
  NpcId,
  type NpcKnowledgeSourceKind,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { NpcKnowledge } from "./NpcKnowledge.js";
import { NpcMemories } from "./NpcMemories.js";
import { NPC } from "./NpcThreads.js";
import {
  classFromColumns,
  dieOnSqlError,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  containedChildWritable,
  containedRowReadable,
  copyableIntoCampaign,
  ensureContainedRowWritable,
  inCampaign,
  rowReadable,
  rowWritable,
  under,
  type Containment,
} from "./visibility.js";

/**
 * Hob-assisted NPC awareness candidates.
 *
 * Campaign Hob may use its DM-only research toolkit to discover a note, beat,
 * recap or other campaign fact that looks relevant to a specific NPC. The tool
 * creates only this candidate row: a creator must edit/approve/reject it before
 * anything enters the NPC's explicit knowledge or memory, and NPC agents never
 * receive Hob's broad campaign repositories.
 */

export const NPC_AWARENESS: Containment = under("npc_awareness_candidate", "npc_id", NPC);

export interface NpcAwarenessDraft {
  readonly npcId: NpcId;
  readonly kind: NpcAwarenessCandidateKind;
  readonly body: string;
  readonly sourceKind: NpcKnowledgeSourceKind;
  readonly sourceId: string | null;
  readonly sourceLabel: string;
  readonly sourceExcerpt: string;
  readonly rationale: string;
}

/**
 * The fields of an `npc_awareness_candidate` row as the wire reads it, off
 * `npc_awareness_candidate.*` and the campaign it was read under, which the
 * table does not carry. Exported for the follow-up queue, which reads the same
 * row beside its NPC.
 */
export const npcAwarenessCandidateFields = {
  ...NpcAwarenessCandidate.fields,
  ...timestampColumns,
  decidedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
};

/** An `npc_awareness_candidate` row as the wire reads it, decoded by `SqlSchema`. */
const NpcAwarenessCandidateRow = classFromColumns(
  NpcAwarenessCandidate,
  npcAwarenessCandidateFields,
);

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the awareness candidate moved on while you were reviewing it (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

const alreadyApproved = new Conflict({
  message: "that NPC awareness candidate has already been approved",
});
const alreadyRejected = new Conflict({
  message: "that NPC awareness candidate has already been rejected",
});
const manualWithSource = new Conflict({
  message: "manual NPC awareness candidates cannot carry a source id",
});

export class NpcAwareness extends Context.Service<
  NpcAwareness,
  {
    readonly validateDraft: (
      creator: CampaignCreatorActor,
      draft: NpcAwarenessDraft,
    ) => Effect.Effect<NpcAwarenessDraft, NotFound | Conflict, never>;
    readonly recordFromHob: (
      creator: CampaignCreatorActor,
      assistantTurnId: AssistantTurnId,
      draft: NpcAwarenessDraft,
    ) => Effect.Effect<NpcAwarenessCandidate, NotFound | Conflict, never>;
    readonly list: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcAwarenessCandidate>, NotFound, never>;
    readonly update: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcAwarenessCandidateId,
      patch: NpcAwarenessCandidateUpdate,
    ) => Effect.Effect<NpcAwarenessCandidate, NotFound | Conflict, never>;
    readonly approve: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcAwarenessCandidateId,
      payload: NpcAwarenessCandidateApprove,
    ) => Effect.Effect<NpcAwarenessCandidate, NotFound | Conflict, never>;
    readonly reject: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcAwarenessCandidateId,
      payload: NpcAwarenessCandidateReject,
    ) => Effect.Effect<NpcAwarenessCandidate, NotFound | Conflict, never>;
  }
>()("NpcAwareness") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const knowledge = yield* NpcKnowledge;
      const memories = yield* NpcMemories;

      const ensureNpc = (creator: CampaignCreatorActor, npcId: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: NpcId }>`
            select npc.id from npc
            where npc.id = ${npcId}
              and npc.archived_at is null
              and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id: npcId });
        });

      const ensureSource = (creator: CampaignCreatorActor, draft: NpcAwarenessDraft) =>
        Effect.gen(function* () {
          const sourceId = draft.sourceId;
          if (sourceId === null) return;
          if (draft.sourceKind === "manual") return yield* manualWithSource;

          const actor = creator.actor;
          const campaign = creator.campaign;
          const rows =
            draft.sourceKind === "note"
              ? yield* sql<{ readonly id: string }>`
                  select note.id from note
                  where note.id = ${sourceId} and ${rowReadable(sql, "note", campaign, actor)}
                `
              : draft.sourceKind === "beat"
                ? yield* sql<{ readonly id: string }>`
                    select beat.id from beat
                    where beat.id = ${sourceId}
                      and ${containedRowReadable(sql, under("beat", "session_id", inCampaign("session")), campaign, actor)}
                  `
                : draft.sourceKind === "character"
                  ? yield* sql<{ readonly id: string }>`
                      select character.id from character
                      join campaign_character on campaign_character.character_id = character.id
                      where character.id = ${sourceId}
                        and campaign_character.campaign_id = ${campaign}
                        and campaign_character.left_at is null
                        and ${rowReadable(sql, "campaign_character", campaign, actor)}
                    `
                  : draft.sourceKind === "creature"
                    ? yield* sql<{ readonly id: string }>`
                        select creature.id from creature
                        where creature.id = ${sourceId}
                          and ${copyableIntoCampaign(sql, "creature", campaign, actor)}
                      `
                    : draft.sourceKind === "npc"
                      ? yield* sql<{ readonly id: string }>`
                          select npc.id from npc
                          where npc.id = ${sourceId}
                            and npc.archived_at is null
                            and ${rowWritable(sql, "npc", campaign, actor)}
                        `
                      : draft.sourceKind === "recap"
                        ? yield* sql<{ readonly id: string }>`
                            select session.id from session
                            where session.id = ${sourceId}
                              and ${rowReadable(sql, "session", campaign, actor)}
                          `
                        : yield* sql<{ readonly id: string }>`
                            select group_history_entry.id from group_history_entry
                            where group_history_entry.id = ${sourceId}
                              and group_history_entry.group_id = ${creator.group}
                          `;

          if (rows.length === 0) {
            return yield* new NotFound({ resource: `${draft.sourceKind}_source`, id: sourceId });
          }
        });

      const validateDraft = (creator: CampaignCreatorActor, draft: NpcAwarenessDraft) =>
        dieOnSqlError(
          Effect.gen(function* () {
            yield* ensureNpc(creator, draft.npcId);
            yield* ensureSource(creator, draft);
            return draft;
          }),
        );

      const CreatorCandidate = Schema.toType(
        Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcAwarenessCandidateId }),
      );
      const reachable = (campaign: CampaignId, actor: Actor, npcId: NpcId) =>
        containedChildWritable(sql, NPC_AWARENESS, npcId, campaign, actor);

      /** The candidate, locked for the review that follows. */
      const locked = SqlSchema.findOne({
        Request: CreatorCandidate,
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, actor, npcId, id }) => sql`
          select npc_awareness_candidate.*, ${campaign} as campaign_id
          from npc_awareness_candidate
          where npc_awareness_candidate.id = ${id}
            and npc_awareness_candidate.npc_id = ${npcId}
            and ${reachable(campaign, actor, npcId)}
          for update of npc_awareness_candidate
        `,
      });
      const one = (creator: CampaignCreatorActor, npcId: NpcId, id: NpcAwarenessCandidateId) =>
        locked({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_awareness_candidate", id));
      const insert = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaign: CampaignId, columns: Columns })),
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, columns }) => sql`
          insert into npc_awareness_candidate ${sql.insert(columns)}
          returning *, ${campaign} as campaign_id
        `,
      });
      const candidates = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, npcId: NpcId })),
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, actor, npcId }) => sql`
          select npc_awareness_candidate.*, ${campaign} as campaign_id
          from npc_awareness_candidate
          where ${reachable(campaign, actor, npcId)}
          order by npc_awareness_candidate.created_at desc, npc_awareness_candidate.id desc
        `,
      });
      /** The reviewer's edit, landing only on the version it read. */
      const change = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({
            campaign: CampaignId,
            id: NpcAwarenessCandidateId,
            columns: Columns,
            version: Schema.Int,
          }),
        ),
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, id, columns, version }) => sql`
          update npc_awareness_candidate set ${setClause(sql, columns)}, version = npc_awareness_candidate.version + 1
          where npc_awareness_candidate.id = ${id}
            and npc_awareness_candidate.version = ${version}
          returning *, ${campaign} as campaign_id
        `,
      });
      /** The approval, on a candidate `one` has just locked, pointing at what it became. */
      const approved = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcAwarenessCandidateId, destination: Columns }),
        ),
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, actor, id, destination }) => sql`
          update npc_awareness_candidate
          set state = 'approved',
              decided_by_account_id = ${actor.accountId},
              decided_at = now(),
              ${sql.update(destination)},
              version = npc_awareness_candidate.version + 1,
              updated_at = now()
          where npc_awareness_candidate.id = ${id}
          returning *, ${campaign} as campaign_id
        `,
      });
      /** The rejection, on a candidate `one` has just locked. */
      const rejected = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcAwarenessCandidateId, reason: Schema.String }),
        ),
        Result: NpcAwarenessCandidateRow,
        execute: ({ campaign, actor, id, reason }) => sql`
          update npc_awareness_candidate
          set state = 'rejected',
              decided_by_account_id = ${actor.accountId},
              decided_at = now(),
              rejection_reason = ${reason},
              version = npc_awareness_candidate.version + 1,
              updated_at = now()
          where npc_awareness_candidate.id = ${id}
          returning *, ${campaign} as campaign_id
        `,
      });

      const checkPending = (row: NpcAwarenessCandidate) => {
        if (row.state === "approved") return Effect.fail(alreadyApproved);
        if (row.state === "rejected") return Effect.fail(alreadyRejected);
        return Effect.void;
      };

      return {
        validateDraft,

        recordFromHob: (creator, assistantTurnId, draft) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* validateDraft(creator, draft);
              // An insert answers with its row; not getting one is a defect.
              return yield* insert({
                campaign: creator.campaign,
                columns: {
                  npc_id: draft.npcId,
                  kind: draft.kind,
                  body: draft.body,
                  source_kind: draft.sourceKind,
                  source_id: draft.sourceId,
                  source_label: draft.sourceLabel,
                  source_excerpt: draft.sourceExcerpt,
                  rationale: draft.rationale,
                  origin: "assistant",
                  assistant_turn_id: assistantTurnId,
                },
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* candidates({ ...asked(creator), npcId });
            }),
          ),

        update: (creator, npcId, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const before = yield* one(creator, npcId, id);
                yield* checkPending(before);
                if (patch.expectedVersion !== before.version) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const nextDraft: NpcAwarenessDraft = {
                  npcId,
                  kind: before.kind,
                  body: patch.body ?? before.body,
                  sourceKind: patch.sourceKind ?? before.sourceKind,
                  sourceId: patch.sourceId === undefined ? before.sourceId : patch.sourceId,
                  sourceLabel: patch.sourceLabel ?? before.sourceLabel,
                  sourceExcerpt: patch.sourceExcerpt ?? before.sourceExcerpt,
                  rationale: patch.rationale ?? before.rationale,
                };
                yield* ensureSource(creator, nextDraft);
                const changed = yield* change({
                  campaign: creator.campaign,
                  id,
                  columns: {
                    body: nextDraft.body,
                    source_kind: nextDraft.sourceKind,
                    source_id: nextDraft.sourceId,
                    source_label: nextDraft.sourceLabel,
                    source_excerpt: nextDraft.sourceExcerpt,
                    rationale: nextDraft.rationale,
                    ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
                  },
                  version: before.version,
                });
                if (Option.isNone(changed)) {
                  const now = yield* one(creator, npcId, id);
                  return yield* staleVersion(before.version, now.version);
                }
                return changed.value;
              }),
            ),
          ),

        approve: (creator, npcId, id, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* one(creator, npcId, id);
                yield* checkPending(row);
                if (payload.expectedVersion !== row.version) {
                  return yield* staleVersion(payload.expectedVersion, row.version);
                }
                const from =
                  row.assistantTurnId === null
                    ? undefined
                    : { assistantTurnId: row.assistantTurnId };
                const destination =
                  row.kind === "knowledge"
                    ? yield* Effect.map(
                        knowledge.create(
                          creator,
                          npcId,
                          {
                            body: row.body,
                            sourceKind: row.sourceKind,
                            sourceId: row.sourceId,
                            sourceLabel: row.sourceLabel,
                            visibility: row.visibility,
                          },
                          from,
                        ),
                        (fact) => ({ accepted_knowledge_fact_id: fact.id }),
                      )
                    : yield* Effect.map(
                        memories.draft(
                          creator,
                          npcId,
                          {
                            body: row.body,
                            sourceKind: row.sourceKind,
                            sourceId: row.sourceId,
                            sourceLabel: row.sourceLabel,
                            visibility: row.visibility,
                          },
                          from,
                        ),
                        (memory) => ({ accepted_memory_id: memory.id }),
                      );
                // The row is locked and in reach; not getting it back is a defect.
                return yield* approved({ ...asked(creator), id, destination }).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
              }),
            ),
          ),

        reject: (creator, npcId, id, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* one(creator, npcId, id);
                yield* checkPending(row);
                if (payload.expectedVersion !== row.version) {
                  return yield* staleVersion(payload.expectedVersion, row.version);
                }
                const reason = payload.reason?.trim() || "Rejected by the campaign creator.";
                // The row is locked and in reach; not getting it back is a defect.
                return yield* rejected({ ...asked(creator), id, reason }).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
              }),
            ),
          ),
      };
    }),
  );
}
