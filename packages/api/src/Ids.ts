import { Schema } from "effect";

/**
 * Every identifier in the product is a v4 UUID. They are branded so an
 * `AccountId` can never be passed where a `CampaignId` is wanted — the ids are
 * structurally identical strings and the compiler is the only thing that can
 * tell them apart.
 */
const id = <const Name extends string>(name: Name) =>
  Schema.String.check(Schema.isUUID()).pipe(Schema.brand(name));

export const AccountId = id("AccountId");
export type AccountId = typeof AccountId.Type;

/**
 * The top-level social container for connected play — the table's group of
 * people, holding campaigns and the history they share. `play_group` in SQL,
 * because `group` is a keyword; a group everywhere else.
 */
export const GroupId = id("GroupId");
export type GroupId = typeof GroupId.Type;

export const CampaignId = id("CampaignId");
export type CampaignId = typeof CampaignId.Type;

export const SessionId = id("SessionId");
export type SessionId = typeof SessionId.Type;

export const CharacterId = id("CharacterId");
export type CharacterId = typeof CharacterId.Type;

export const NoteId = id("NoteId");
export type NoteId = typeof NoteId.Type;

export const EncounterId = id("EncounterId");
export type EncounterId = typeof EncounterId.Type;

export const PrepItemId = id("PrepItemId");
export type PrepItemId = typeof PrepItemId.Type;

export const CreatureId = id("CreatureId");
export type CreatureId = typeof CreatureId.Type;

/** A spell in the shared SRD corpus, an account Library, or a campaign copy. */
export const SpellId = id("SpellId");
export type SpellId = typeof SpellId.Type;

/** Mundane 2014 equipment in the shared corpus, an account Library, or a campaign copy. */
export const EquipmentId = id("EquipmentId");
export type EquipmentId = typeof EquipmentId.Type;

/** A 2014 SRD magic item in the bundle, an account Library, or a campaign copy. */
export const MagicItemId = id("MagicItemId");
export type MagicItemId = typeof MagicItemId.Type;

/** One top-level 2014 rules compendium article, copyable into a campaign. */
export const RuleArticleId = id("RuleArticleId");
export type RuleArticleId = typeof RuleArticleId.Type;

/** One ordered section inside a rules compendium article. */
export const RuleSectionId = id("RuleSectionId");
export type RuleSectionId = typeof RuleSectionId.Type;

/** A 2014 feat in the bundle, an account Library, or a campaign copy. */
export const FeatId = id("FeatId");
export type FeatId = typeof FeatId.Type;

/** One ordered prerequisite group under a feat. */
export const FeatPrerequisiteGroupId = id("FeatPrerequisiteGroupId");
export type FeatPrerequisiteGroupId = typeof FeatPrerequisiteGroupId.Type;

/**
 * One piece a character is **built from** — a class, a race, or a background.
 * Not the character: two characters made from one class are two
 * rows that share nothing but a label, because the class is read once at
 * creation and never again.
 *
 * The same three-owner shape a `CreatureId` names: the bundle, an account's
 * Library original, or a campaign's copy of one.
 */
export const CharacterOptionId = id("CharacterOptionId");
export type CharacterOptionId = typeof CharacterOptionId.Type;

/** A concrete 2014 subclass row, owned by the same Library/campaign model as a class. */
export const SubclassId = id("SubclassId");
export type SubclassId = typeof SubclassId.Type;

/** One concrete 2014 class or subclass level. */
export const ClassLevelId = id("ClassLevelId");
export type ClassLevelId = typeof ClassLevelId.Type;

/** One concrete 2014 class or subclass feature. */
export const FeatureId = id("FeatureId");
export type FeatureId = typeof FeatureId.Type;

/** A concrete 2014 ability-score identity (STR, DEX, …). */
export const AbilityScoreId = id("AbilityScoreId");
export type AbilityScoreId = typeof AbilityScoreId.Type;

/** A concrete 2014 language identity. */
export const LanguageId = id("LanguageId");
export type LanguageId = typeof LanguageId.Type;

/** A concrete 2014 skill identity, tied to an ability score. */
export const SkillId = id("SkillId");
export type SkillId = typeof SkillId.Type;

/** A concrete 2014 proficiency identity. */
export const ProficiencyId = id("ProficiencyId");
export type ProficiencyId = typeof ProficiencyId.Type;

/** A racial trait row, either bundled or a snapshot owned by an account/campaign. */
export const RacialTraitId = id("RacialTraitId");
export type RacialTraitId = typeof RacialTraitId.Type;

/** A contained subrace row under one race option. */
export const CharacterOptionSubraceId = id("CharacterOptionSubraceId");
export type CharacterOptionSubraceId = typeof CharacterOptionSubraceId.Type;

/** One concrete choice group hanging off a rules option, subrace or trait. */
export const RuleChoiceGroupId = id("RuleChoiceGroupId");
export type RuleChoiceGroupId = typeof RuleChoiceGroupId.Type;

/**
 * A creature's place on one encounter's roster — the join row, not the creature.
 * It has an id of its own because the roster line is what a client edits: the
 * count changes, the creature does not.
 */
export const EncounterCreatureId = id("EncounterCreatureId");
export type EncounterCreatureId = typeof EncounterCreatureId.Type;

/**
 * One playing of an encounter. Not the encounter: the same template can be run
 * again next week, and each run is its own row with its own combatants.
 */
export const EncounterRunId = id("EncounterRunId");
export type EncounterRunId = typeof EncounterRunId.Type;

/**
 * One creature *instance* in one fight. `data.js:18-19` has two `Goblin Archer`
 * rows with different ids and different hit points — this is what tells them
 * apart, and why a combatant is never addressed by its creature.
 */
export const CombatantId = id("CombatantId");
export type CombatantId = typeof CombatantId.Type;

/** One line of the append-only session log. */
export const SessionEventId = id("SessionEventId");
export type SessionEventId = typeof SessionEventId.Type;

/** One browser-rolled character-sheet die result filed under a live night. */
export const RollId = id("RollId");
export type RollId = typeof RollId.Type;

/**
 * One line of prose about what happened at the table. Unlike a `SessionEventId`
 * this names something the DM can go back and correct — which is the whole
 * reason beats are not log lines.
 */
export const BeatId = id("BeatId");
export type BeatId = typeof BeatId.Type;

/**
 * One invitation to join a group — optionally admitting to one of its campaigns
 * in the same act.
 *
 * Names the *row*, never the token — the token is a secret the server only ever
 * stores as a digest, and it is what a person holds. This is what the group
 * owner revokes.
 */
export const GroupInviteId = id("GroupInviteId");
export type GroupInviteId = typeof GroupInviteId.Type;

/**
 * One character's place in one campaign's party — the join row, not the
 * character. The character is account-owned and carries the playable state;
 * this names the participation, its lifecycle, and the display snapshots the
 * campaign keeps.
 */
export const CampaignCharacterId = id("CampaignCharacterId");
export type CampaignCharacterId = typeof CampaignCharacterId.Type;

/** One canonical fact admitted to a group's shared history. */
export const GroupHistoryEntryId = id("GroupHistoryEntryId");
export type GroupHistoryEntryId = typeof GroupHistoryEntryId.Type;

/** One derived summary over a group's history entries. */
export const GroupHistorySummaryId = id("GroupHistorySummaryId");
export type GroupHistorySummaryId = typeof GroupHistorySummaryId.Type;

/** One conversation with Hob — a thread of turns, scoped to one campaign. */
export const AssistantThreadId = id("AssistantThreadId");
export type AssistantThreadId = typeof AssistantThreadId.Type;

/**
 * Points at the assistant conversation turn that produced a row.
 *
 * `assistant_turn` is a real table now, and every content table's
 * `assistant_turn_id` is a real foreign key into it — so "where did this NPC
 * name come from?" is a join rather than a guess. See `HobTurn`.
 */
export const AssistantTurnId = id("AssistantTurnId");
export type AssistantTurnId = typeof AssistantTurnId.Type;

/** One audited resource counter Hob moved directly during a live fight. */
export const HobDirectResourceUpdateId = id("HobDirectResourceUpdateId");
export type HobDirectResourceUpdateId = typeof HobDirectResourceUpdateId.Type;

/**
 * A campaign NPC — the structured, bounded persona a creator builds inside a
 * campaign and rehearses with (the NPC builder decisions of 2026-09-04). Not a
 * `CharacterId` and not a `CreatureId`: a speaking persona is a third thing,
 * and the row it names carries creator-only material neither of those may.
 */
export const NpcId = id("NpcId");
export type NpcId = typeof NpcId.Type;

/**
 * One conversation with an NPC, on one channel. Its own table rather than an
 * `AssistantThreadId`: an NPC conversation is not Hob's, offers no proposals,
 * and will carry channels (rehearsal, later player and session) that
 * `assistant_thread` has no axis for.
 */
export const NpcThreadId = id("NpcThreadId");
export type NpcThreadId = typeof NpcThreadId.Type;

/** One line of an NPC conversation — the creator's, or the NPC's. */
export const NpcTurnId = id("NpcTurnId");
export type NpcTurnId = typeof NpcTurnId.Type;

/** One explicit copied fact the creator lets an NPC know. */
export const NpcKnowledgeFactId = id("NpcKnowledgeFactId");
export type NpcKnowledgeFactId = typeof NpcKnowledgeFactId.Type;

/** One curated memory an NPC may use after the creator approves it. */
export const NpcMemoryId = id("NpcMemoryId");
export type NpcMemoryId = typeof NpcMemoryId.Type;
