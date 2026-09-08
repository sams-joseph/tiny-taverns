import { Schema } from "effect";
import {
  AccountId,
  CampaignId,
  NpcId,
  NpcKnowledgeFactId,
  NpcMemoryId,
  NpcThreadId,
  NpcTurnId,
} from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * A campaign NPC: a structured, bounded persona and the rehearsal a creator
 * has with it.
 *
 * The captain's decisions of 2026-09-04 shape everything on this page. An NPC
 * is **a campaign content row that compiles a constrained persona prompt from
 * structured fields** — not a free-form prompt blob, not Hob wearing a name,
 * not a character and not a creature. It may also be an account-owned Library
 * source that is copied into campaigns as a snapshot, with group sharing
 * granting future copying only. Campaign NPCs have creator rehearsal and
 * private player direct chat channels, no tools, and write nothing into the
 * campaign.
 *
 * ### Private material is its own field, by construction
 *
 * `NpcPersona` is the **public** half — what a player-facing channel could one
 * day be shown. `NpcPrivateMaterial` is the creator-only half, in its own
 * column and its own prompt section, so a later audience excludes it by
 * *leaving it out* rather than by asking the model to keep a secret. That is
 * the secret-boundary decision made structural: nothing here lets a secret be
 * typed into the public document, and `apps/server/src/assistant/npcPrompt.ts`
 * renders the two from two arguments.
 *
 * ### Unconfigured is a supported mode, exactly as Hob's is
 *
 * `rehearse` is a declared `HobUnavailable` when no model endpoint is
 * configured — the same error class, deliberately, so the one client
 * classifier and the one boot line cover both surfaces. `status` answers
 * `available: false` and the screen renders a composer-less panel that says
 * so.
 */

const shortText = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const shortLines = (max: number) =>
  Schema.Array(Schema.String.check(Schema.isLengthBetween(1, max))).check(Schema.isMaxLength(12));

/** The name, said aloud: pronouns, how to say it, and the one-paragraph summary. */
export const NpcIdentity = Schema.Struct({
  pronouns: Schema.optional(shortText(40)),
  pronunciation: Schema.optional(shortText(80)),
  /** One paragraph of who they are — the *Basic* form's whole persona field. */
  summary: Schema.optional(shortText(2000)),
});
export type NpcIdentity = typeof NpcIdentity.Type;

/** How they talk. */
export const NpcVoice = Schema.Struct({
  manner: Schema.optional(shortText(600)),
  phrases: Schema.optional(shortLines(120)),
  /** Lines they would actually say, verbatim — the prompt's best teacher. */
  exampleLines: Schema.optional(shortLines(240)),
});
export type NpcVoice = typeof NpcVoice.Type;

/** What they want, and where they stop. */
export const NpcIntent = Schema.Struct({
  wants: Schema.optional(shortText(600)),
  fears: Schema.optional(shortText(600)),
  loyalties: Schema.optional(shortText(600)),
  attitude: Schema.optional(shortText(600)),
});
export type NpcIntent = typeof NpcIntent.Type;

/**
 * Player-safe boundaries — what the NPC dodges, refuses, or defers to the DM.
 *
 * Deliberately *behavioural* rather than factual: "becomes evasive when asked
 * about payment" is a boundary; "the patron is Fen" is a secret and belongs in
 * `NpcPrivateMaterial`. The distinction is the secret-boundary decision.
 */
export const NpcBoundaries = Schema.Struct({
  dodges: Schema.optional(shortLines(200)),
  refuses: Schema.optional(shortLines(200)),
  asksTheDm: Schema.optional(shortLines(200)),
});
export type NpcBoundaries = typeof NpcBoundaries.Type;

/**
 * The public persona document. Every key optional, so an NPC that is only a
 * name and a role decodes, and a section the creator never opened is absent
 * rather than blank. This is the whole player-facing profile.
 */
export const NpcPersona = Schema.Struct({
  identity: Schema.optional(NpcIdentity),
  voice: Schema.optional(NpcVoice),
  intent: Schema.optional(NpcIntent),
  boundaries: Schema.optional(NpcBoundaries),
});
export type NpcPersona = typeof NpcPersona.Type;

export const emptyNpcPersona: NpcPersona = {};

/**
 * Creator-only material. **Never mixed into `NpcPersona`**, never shown to a
 * player channel; included in a prompt only when the creator is the audience.
 */
export const NpcPrivateMaterial = Schema.Struct({
  /** What is true and must not be said — the patron's name, the ambush. */
  secrets: Schema.optional(shortText(4000)),
  /** How the creator wants the NPC played beyond what the public voice says. */
  instructions: Schema.optional(shortText(4000)),
});
export type NpcPrivateMaterial = typeof NpcPrivateMaterial.Type;

export const emptyNpcPrivateMaterial: NpcPrivateMaterial = {};

const npcName = Schema.NonEmptyString.check(Schema.isMaxLength(80));
const npcRole = Schema.String.check(Schema.isMaxLength(120));

/**
 * The row, as the creator reads it.
 *
 * `derivedFrom` is the nullable pointer a Library source leaves on a campaign
 * snapshot (`derived_from`, the `creature` idiom). `derivedFromVersion` and
 * `derivedFromName` keep the provenance understandable after the source moves
 * or is deleted. `archivedAt` is the reversible soft delete: transcripts hang
 * off an NPC and are worth keeping.
 *
 * `version` is the optimistic-concurrency counter `character` carries, for the
 * same reason: two tabs editing one persona should notice each other.
 */
export class Npc extends Schema.Class<Npc>("Npc")({
  id: NpcId,
  campaignId: CampaignId,
  derivedFrom: Schema.NullOr(NpcId),
  /** The source's version at the moment this campaign snapshot was copied. */
  derivedFromVersion: Schema.NullOr(Schema.Int),
  /** The source's name at the moment this campaign snapshot was copied, kept after source deletion. */
  derivedFromName: Schema.NullOr(Schema.String),
  name: Schema.String,
  /** A short role or subtitle — "the ferryman at the crossing". */
  role: Schema.String,
  persona: NpcPersona,
  privateMaterial: NpcPrivateMaterial,
  version: Schema.Int,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class NpcSource extends Schema.Class<NpcSource>("NpcSource")({
  id: NpcId,
  accountId: AccountId,
  name: Schema.String,
  role: Schema.String,
  persona: NpcPersona,
  privateMaterial: NpcPrivateMaterial,
  version: Schema.Int,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const NpcCreate = Schema.Struct({
  name: npcName,
  role: Schema.optional(npcRole),
  persona: Schema.optional(NpcPersona),
  privateMaterial: Schema.optional(NpcPrivateMaterial),
  visibility: Schema.optional(Visibility),
});
export type NpcCreate = typeof NpcCreate.Type;

/**
 * The persona and the private material are each replaced whole, like a
 * character sheet: the form always holds the whole document, and a merge
 * invented in the client is the one thing this must not do.
 */
export const NpcUpdate = Schema.Struct({
  /** Refused with a `Conflict` when the row moved on — see `Npc.version`. */
  expectedVersion: Schema.optional(Schema.Int),
  name: Schema.optional(npcName),
  role: Schema.optional(npcRole),
  persona: Schema.optional(NpcPersona),
  privateMaterial: Schema.optional(NpcPrivateMaterial),
  visibility: Schema.optional(Visibility),
});
export type NpcUpdate = typeof NpcUpdate.Type;

/** Live rows by default; `archived: true` is the other shelf. */
export const NpcListFilter = Schema.Struct({
  archived: Schema.optional(Schema.Boolean),
});
export type NpcListFilter = typeof NpcListFilter.Type;

/**
 * The channel a thread is on. **One member in this slice**, and the column
 * is a closed check so a second one is a migration rather than a string. Each
 * channel carries its own privacy decision: rehearsal is creator-only;
 * player_direct is one player's private transcript.
 */
export const NpcChannel = Schema.Literals(["rehearsal", "player_direct"]);
export type NpcChannel = typeof NpcChannel.Type;

export const NpcWho = Schema.Literals(["user", "npc"]);
export type NpcWho = typeof NpcWho.Type;

export class NpcThread extends Schema.Class<NpcThread>("NpcThread")({
  id: NpcThreadId,
  npcId: NpcId,
  channel: NpcChannel,
  /** The first line, shortened — what a picker would list. */
  title: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The row as a player may discover it: public persona only, no private
 * material, no version, no prompt/audit/usage metadata.
 */
export class PlayerNpc extends Schema.Class<PlayerNpc>("PlayerNpc")({
  id: NpcId,
  campaignId: CampaignId,
  name: Schema.String,
  role: Schema.String,
  persona: NpcPersona,
}) {}

/**
 * One line of a rehearsal.
 *
 * An NPC turn records **which prompt template produced it** and roughly how
 * large the prompt was. That is the audit the design asks for and the whole of
 * what is kept about the prompt: the assembled text itself is never stored,
 * because it carries private campaign material.
 */
export class NpcTurn extends Schema.Class<NpcTurn>("NpcTurn")({
  id: NpcTurnId,
  threadId: NpcThreadId,
  who: NpcWho,
  text: Schema.String,
  templateVersion: Schema.NullOr(Schema.String),
  promptTokens: Schema.NullOr(Schema.Int),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

export const NpcKnowledgeSourceKind = Schema.Literals([
  "manual",
  "note",
  "beat",
  "group_history",
  "recap",
]);
export type NpcKnowledgeSourceKind = typeof NpcKnowledgeSourceKind.Type;

const sourceId = Schema.String.check(Schema.isUUID());
const knowledgeBody = Schema.NonEmptyString.check(Schema.isMaxLength(4000));
const sourceLabel = Schema.String.check(Schema.isMaxLength(200));

/**
 * One explicit fact the creator has selected for this NPC.
 *
 * `body` is the copied fact. `source*` is provenance only: prompt assembly and
 * repository reads never follow it, so a source that is deleted, edited, or no
 * longer readable cannot leak fresh content into a later answer.
 */
export class NpcKnowledgeFact extends Schema.Class<NpcKnowledgeFact>("NpcKnowledgeFact")({
  id: NpcKnowledgeFactId,
  npcId: NpcId,
  body: Schema.String,
  sourceKind: NpcKnowledgeSourceKind,
  sourceId: Schema.NullOr(sourceId),
  sourceLabel: Schema.String,
  retiredAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const NpcKnowledgeFactCreate = Schema.Struct({
  body: knowledgeBody,
  sourceKind: Schema.optional(NpcKnowledgeSourceKind),
  sourceId: Schema.optional(Schema.NullOr(sourceId)),
  sourceLabel: Schema.optional(sourceLabel),
  visibility: Schema.optional(Visibility),
});
export type NpcKnowledgeFactCreate = typeof NpcKnowledgeFactCreate.Type;

export const NpcKnowledgeFactUpdate = Schema.Struct({
  body: Schema.optional(knowledgeBody),
  sourceKind: Schema.optional(NpcKnowledgeSourceKind),
  sourceId: Schema.optional(Schema.NullOr(sourceId)),
  sourceLabel: Schema.optional(sourceLabel),
  visibility: Schema.optional(Visibility),
});
export type NpcKnowledgeFactUpdate = typeof NpcKnowledgeFactUpdate.Type;

export const NpcMemoryStatus = Schema.Literals(["draft", "approved", "retired"]);
export type NpcMemoryStatus = typeof NpcMemoryStatus.Type;

const memoryBody = Schema.NonEmptyString.check(Schema.isMaxLength(4000));

/**
 * A curated memory. Drafts are audit/editing state only; only `approved` rows
 * with `retiredAt === null` enter model context.
 */
export class NpcMemory extends Schema.Class<NpcMemory>("NpcMemory")({
  id: NpcMemoryId,
  npcId: NpcId,
  body: Schema.String,
  status: NpcMemoryStatus,
  sourceThreadId: Schema.NullOr(NpcThreadId),
  sourceTurnId: Schema.NullOr(NpcTurnId),
  approvedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  retiredAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const NpcMemoryCreate = Schema.Struct({
  body: memoryBody,
  sourceThreadId: Schema.optional(Schema.NullOr(NpcThreadId)),
  sourceTurnId: Schema.optional(Schema.NullOr(NpcTurnId)),
  visibility: Schema.optional(Visibility),
});
export type NpcMemoryCreate = typeof NpcMemoryCreate.Type;

export const NpcMemoryUpdate = Schema.Struct({
  body: Schema.optional(memoryBody),
  visibility: Schema.optional(Visibility),
});
export type NpcMemoryUpdate = typeof NpcMemoryUpdate.Type;

/**
 * Whether a model is behind the rehearsal, and the prompt metadata the
 * inspector shows — the template version and an estimate of the prompt's
 * size as it stands, **never the prompt itself**.
 */
export class NpcRehearsalStatus extends Schema.Class<NpcRehearsalStatus>("NpcRehearsalStatus")({
  available: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  npc: Schema.String,
  templateVersion: Schema.String,
  /** A character-count estimate of the persona, active knowledge and approved memory. */
  estimatedTokens: Schema.Int,
  knowledgeIncluded: Schema.Int,
  knowledgeTotal: Schema.Int,
  memoriesIncluded: Schema.Int,
  memoriesTotal: Schema.Int,
}) {}

/** Player chat status: no context counts or usage metadata to infer from. */
export class NpcPlayerStatus extends Schema.Class<NpcPlayerStatus>("NpcPlayerStatus")({
  available: Schema.Boolean,
  npc: Schema.String,
}) {}

const turnText = Schema.String.check(Schema.isLengthBetween(1, 4000));

/** One line to the NPC, and the thread it continues. Absent starts one. */
export const NpcRehearse = Schema.Struct({
  threadId: Schema.optional(NpcThreadId),
  text: turnText,
});
export type NpcRehearse = typeof NpcRehearse.Type;

/** A private player direct message to one shared NPC. Absent starts a thread. */
export const NpcTalk = NpcRehearse;
export type NpcTalk = typeof NpcTalk.Type;

/**
 * Said first, before the model is called: the thread and the turn the reply
 * will be saved as. Rehearsal includes prompt metadata for the creator's
 * inspector; player direct chat omits it by leaving these fields absent.
 */
export class NpcBegun extends Schema.Class<NpcBegun>("NpcBegun")({
  threadId: NpcThreadId,
  turnId: NpcTurnId,
  templateVersion: Schema.optional(Schema.String),
  estimatedTokens: Schema.optional(Schema.Int),
  knowledgeIncluded: Schema.optional(Schema.Int),
  knowledgeTotal: Schema.optional(Schema.Int),
  memoriesIncluded: Schema.optional(Schema.Int),
  memoriesTotal: Schema.optional(Schema.Int),
}) {}

export class NpcDelta extends Schema.Class<NpcDelta>("NpcDelta")({
  text: Schema.String,
}) {}

export class NpcDone extends Schema.Class<NpcDone>("NpcDone")({
  reason: Schema.String,
}) {}

export class NpcFailure extends Schema.Class<NpcFailure>("NpcFailure")({
  message: Schema.String,
}) {}

/**
 * The reply, as SSE — `HobEvent`'s shape without the tool and proposal
 * members, because this loop has neither. No `id` line and no heartbeats, for
 * Hob's reasons: an answer is re-asked, not resumed.
 */
export const NpcEvent = Schema.Union([
  Schema.Struct({ event: Schema.Literal("began"), data: Schema.fromJsonString(NpcBegun) }),
  Schema.Struct({ event: Schema.Literal("delta"), data: Schema.fromJsonString(NpcDelta) }),
  Schema.Struct({ event: Schema.Literal("done"), data: Schema.fromJsonString(NpcDone) }),
  Schema.Struct({ event: Schema.Literal("failed"), data: Schema.fromJsonString(NpcFailure) }),
]);
export type NpcEvent = typeof NpcEvent.Type;
