import {
  type AccountId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  NpcAwarenessCandidate,
  type NpcAwarenessCandidateApprove,
  type NpcAwarenessCandidateId,
  type NpcAwarenessCandidateKind,
  type NpcAwarenessCandidateReject,
  type NpcAwarenessCandidateState,
  type NpcAwarenessCandidateUpdate,
  type NpcId,
  type NpcKnowledgeFactId,
  type NpcKnowledgeSourceKind,
  type NpcMemoryId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { NpcKnowledge } from "./NpcKnowledge.js";
import { NpcMemories } from "./NpcMemories.js";
import { NPC } from "./NpcThreads.js";
import { dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
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

interface CandidateRow extends ProvenanceColumns {
  readonly id: NpcAwarenessCandidateId;
  readonly campaign_id: CampaignId;
  readonly npc_id: NpcId;
  readonly kind: NpcAwarenessCandidateKind;
  readonly body: string;
  readonly source_kind: NpcKnowledgeSourceKind;
  readonly source_id: string | null;
  readonly source_label: string;
  readonly source_excerpt: string;
  readonly rationale: string;
  readonly version: number;
  readonly state: NpcAwarenessCandidateState;
  readonly decided_by_account_id: AccountId | null;
  readonly decided_at: Date | null;
  readonly rejection_reason: string | null;
  readonly accepted_knowledge_fact_id: NpcKnowledgeFactId | null;
  readonly accepted_memory_id: NpcMemoryId | null;
}

export const toNpcAwarenessCandidate = (row: CandidateRow): NpcAwarenessCandidate =>
  new NpcAwarenessCandidate({
    id: row.id,
    campaignId: row.campaign_id,
    npcId: row.npc_id,
    kind: row.kind,
    body: row.body,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    sourceExcerpt: row.source_excerpt,
    rationale: row.rationale,
    version: row.version,
    state: row.state,
    decidedByAccountId: row.decided_by_account_id,
    decidedAt: row.decided_at === null ? null : DateTime.fromDateUnsafe(row.decided_at),
    rejectionReason: row.rejection_reason,
    acceptedKnowledgeFactId: row.accepted_knowledge_fact_id,
    acceptedMemoryId: row.accepted_memory_id,
    ...provenanceOf(row),
  });

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

      const candidateReachable = (creator: CampaignCreatorActor, npcId: NpcId) =>
        containedChildWritable(sql, NPC_AWARENESS, npcId, creator.campaign, creator.actor);

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

      const one = (creator: CampaignCreatorActor, npcId: NpcId, id: NpcAwarenessCandidateId) =>
        Effect.gen(function* () {
          const rows = yield* sql<CandidateRow>`
            select npc_awareness_candidate.*, ${creator.campaign} as campaign_id
            from npc_awareness_candidate
            where npc_awareness_candidate.id = ${id}
              and npc_awareness_candidate.npc_id = ${npcId}
              and ${candidateReachable(creator, npcId)}
            for update of npc_awareness_candidate
          `;
          if (rows.length === 0)
            return yield* new NotFound({ resource: "npc_awareness_candidate", id });
          return rows[0]!;
        });

      const checkPending = (row: CandidateRow) => {
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
              const rows = yield* sql<CandidateRow>`
                insert into npc_awareness_candidate ${sql.insert({
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
                })}
                returning *, ${creator.campaign} as campaign_id
              `;
              return toNpcAwarenessCandidate(rows[0]!);
            }),
          ),

        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<CandidateRow>`
                select npc_awareness_candidate.*, ${creator.campaign} as campaign_id
                from npc_awareness_candidate
                where ${candidateReachable(creator, npcId)}
                order by npc_awareness_candidate.created_at desc, npc_awareness_candidate.id desc
              `;
              return rows.map(toNpcAwarenessCandidate);
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
                  sourceKind: patch.sourceKind ?? before.source_kind,
                  sourceId: patch.sourceId === undefined ? before.source_id : patch.sourceId,
                  sourceLabel: patch.sourceLabel ?? before.source_label,
                  sourceExcerpt: patch.sourceExcerpt ?? before.source_excerpt,
                  rationale: patch.rationale ?? before.rationale,
                };
                yield* ensureSource(creator, nextDraft);
                const rows = yield* sql<CandidateRow>`
                  update npc_awareness_candidate set ${setClause(sql, {
                    body: nextDraft.body,
                    source_kind: nextDraft.sourceKind,
                    source_id: nextDraft.sourceId,
                    source_label: nextDraft.sourceLabel,
                    source_excerpt: nextDraft.sourceExcerpt,
                    rationale: nextDraft.rationale,
                    ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
                  })}, version = npc_awareness_candidate.version + 1
                  where npc_awareness_candidate.id = ${id}
                    and npc_awareness_candidate.version = ${before.version}
                  returning *, ${creator.campaign} as campaign_id
                `;
                if (rows.length === 0) {
                  const now = yield* one(creator, npcId, id);
                  return yield* staleVersion(before.version, now.version);
                }
                return toNpcAwarenessCandidate(rows[0]!);
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
                  row.assistant_turn_id === null
                    ? undefined
                    : { assistantTurnId: row.assistant_turn_id };
                const destination =
                  row.kind === "knowledge"
                    ? yield* Effect.map(
                        knowledge.create(
                          creator,
                          npcId,
                          {
                            body: row.body,
                            sourceKind: row.source_kind,
                            sourceId: row.source_id,
                            sourceLabel: row.source_label,
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
                            sourceKind: row.source_kind,
                            sourceId: row.source_id,
                            sourceLabel: row.source_label,
                            visibility: row.visibility,
                          },
                          from,
                        ),
                        (memory) => ({ accepted_memory_id: memory.id }),
                      );
                const rows = yield* sql<CandidateRow>`
                  update npc_awareness_candidate
                  set state = 'approved',
                      decided_by_account_id = ${creator.actor.accountId},
                      decided_at = now(),
                      ${sql.update(destination)},
                      version = npc_awareness_candidate.version + 1,
                      updated_at = now()
                  where npc_awareness_candidate.id = ${id}
                  returning *, ${creator.campaign} as campaign_id
                `;
                return toNpcAwarenessCandidate(rows[0]!);
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
                const rows = yield* sql<CandidateRow>`
                  update npc_awareness_candidate
                  set state = 'rejected',
                      decided_by_account_id = ${creator.actor.accountId},
                      decided_at = now(),
                      rejection_reason = ${reason},
                      version = npc_awareness_candidate.version + 1,
                      updated_at = now()
                  where npc_awareness_candidate.id = ${id}
                  returning *, ${creator.campaign} as campaign_id
                `;
                return toNpcAwarenessCandidate(rows[0]!);
              }),
            ),
          ),
      };
    }),
  );
}
