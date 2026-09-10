import type {
  CampaignId,
  CharacterId,
  CharacterOptionId,
  FeatId,
  NpcId,
  RuleArticleId,
  SessionId,
  SharedWorldId,
} from "@taverns/api";

/**
 * What a read is *about*, so a write can name it.
 *
 * **This module is the whole vocabulary a write has for saying what it
 * changed**, and every read in the product declares which of these it answers.
 * `api/atoms.ts` is the machinery; this is the map, and it is deliberately one
 * file so that "what does this write invalidate" is a question with one place
 * to look it up.
 *
 * ### Why this exists at all, and what it replaces
 *
 * Until it did, `api/mutation.ts` had **no concept of what a write
 * invalidates**: every caller hand-wired `onSaved → reload()`, and on the
 * campaign's five screens `reload()` meant re-reading the whole campaign. That
 * is why adding one line to the checklist cost one write and eight reads.
 * `CampaignChrome.tsx` argued for it in writing — *"one re-read is one source
 * of truth"* — and the argument was not wrong: a narrower cache is right until
 * the first write it did not hear about.
 *
 * **The captain accepted that trade on 2026-08-19, and this file is where the
 * cost of it lives.** A key is still a name somebody has to remember, so the
 * two things that bound the risk are both structural rather than habits:
 *
 *  - **Naming the reads is a required argument, not an option.** `apiAtom` and
 *    `Mutation.submit` both take one, so a new read or a new write does not
 *    compile until its author has answered the question. A write that genuinely
 *    changes nothing anybody reads says `[]`, which is a visible answer rather
 *    than a silence.
 *  - **The names are functions, not strings.** `reads.notes(campaignId)` cannot
 *    be misspelled, cannot be pointed at the wrong id shape, and is findable:
 *    one grep names every read and every write that touches a resource.
 *
 * ### The rule for a new one, and the failure it exists to prevent
 *
 * **Ask what the write changes that is not in its own response.** That is the
 * whole discipline, and it is the failure mode the old design made impossible
 * and this one does not. Two of them are already in the product and are worth
 * knowing as the shape of the thing:
 *
 *  - `Encounter.creatureCount` is `sum(encounter_creature.count)` **computed
 *    per read**, so writing a roster line changes a number on the encounter
 *    card without the encounter row ever being sent. Hence
 *    `encounterCreatures.*` names `reads.encounters`.
 *  - A note's attachment moves the *note count* on an encounter card, which is
 *    counted in the browser over the notes list. Hence a note write refreshes
 *    the notes, and the encounter screen redraws from them.
 *
 * Prefer over-naming to under-naming. A key nobody is listening on costs
 * nothing — `withReactivity` only registers an atom that something is actually
 * reading — and a key nobody named is a card that quietly says the wrong
 * number.
 */
declare const ReadKeyBrand: unique symbol;

/** One resource a read answers and a write can change. */
export type ReadKey = string & { readonly [ReadKeyBrand]: never };

/**
 * The reads a write changes, or the reads an atom answers.
 *
 * Empty is a legitimate answer and means what it says: *nothing anybody is
 * looking at moved.* The optimistic prep tick is the one write in the product
 * that says it — see `campaign/PrepChecklist.tsx`, where the checkbox renders
 * its own answer and a refresh would only fight it.
 */
export type Invalidation = ReadonlyArray<ReadKey>;

const key = (parts: TemplateStringsArray, ...values: ReadonlyArray<string>): ReadKey =>
  parts.reduce((out, part, index) => out + part + (values[index] ?? ""), "") as ReadKey;

/**
 * Every resource this app reads, named once.
 *
 * Scoped by the id that *owns* the resource rather than by the path it is
 * reached through: a session id is unique on its own, so the checklist is
 * `prep:<sessionId>` and not `campaign:<c>:session:<s>:prep`. Two reads of one
 * resource through different paths must land on the same key, or a write
 * refreshes one of them and not the other.
 */
export const reads = {
  // ---------------------------------------------------------------- campaign

  /** The campaign row itself — its name, its party, whether it is shared, and which night it points at. */
  campaign: (campaignId: CampaignId): ReadKey => key`campaign:${campaignId}`,

  /**
   * Every encounter built for this table — **including each one's
   * `creatureCount`**, which is computed per read and is why a roster write
   * names this rather than a key of its own.
   */
  encounters: (campaignId: CampaignId): ReadKey => key`encounters:${campaignId}`,

  /**
   * This campaign's notes.
   *
   * The encounter cards' *"· 1 note"* is counted in the browser over this list,
   * so a note that is attached or detached moves a number on a card that is not
   * a note — refreshing the notes is what redraws it.
   */
  notes: (campaignId: CampaignId): ReadKey => key`notes:${campaignId}`,

  /**
   * The party at this table: the seats, each holding a shared account-owned
   * character. One key for the roster and the characters under it, because a
   * seat and the character it holds arrive in one answer.
   */
  party: (campaignId: CampaignId): ReadKey => key`party:${campaignId}`,

  /**
   * The nights of this campaign — **the spine the Chronicle draws and the one
   * row the campaign view reads**, deliberately one key.
   *
   * Starting or finishing a night changes both, and they are on screen
   * together; splitting them would be two names for one act.
   */
  sessions: (campaignId: CampaignId): ReadKey => key`sessions:${campaignId}`,

  /** Invitations that grant a seat at one campaign. */
  campaignInvites: (campaignId: CampaignId): ReadKey => key`campaign-invites:${campaignId}`,

  /**
   * The campaign's cast — live NPCs and the archived shelf, one key. Archiving
   * moves a row from one list to the other, so a key per list would be a
   * write that has to remember both.
   */
  npcs: (campaignId: CampaignId): ReadKey => key`npcs:${campaignId}`,

  /** One NPC's row: the detail screen's read, refreshed by its own edits. */
  npc: (npcId: NpcId): ReadKey => key`npc:${npcId}`,

  /** One NPC's rehearsal threads, and whether a model is behind them. */
  npcRehearsal: (npcId: NpcId): ReadKey => key`npc-rehearsal:${npcId}`,

  /** One NPC's explicit selected facts. */
  npcKnowledge: (npcId: NpcId): ReadKey => key`npc-knowledge:${npcId}`,

  /** One NPC's draft, approved and retired memories. */
  npcMemories: (npcId: NpcId): ReadKey => key`npc-memories:${npcId}`,

  /** One NPC's pending, accepted and rejected proposals. */
  npcProposals: (npcId: NpcId): ReadKey => key`npc-proposals:${npcId}`,

  /** Campaign-level NPC follow-up over pending proposals and awareness candidates. */
  npcFollowUp: (campaignId: CampaignId): ReadKey => key`npc-follow-up:${campaignId}`,

  /** Hob-researched facts or memories waiting for creator curation. */
  npcAwarenessCandidates: (npcId: NpcId): ReadKey => key`npc-awareness:${npcId}`,

  /** Who is at this table. Withdrawing an accepted invitation takes a row out of it. */
  members: (campaignId: CampaignId): ReadKey => key`members:${campaignId}`,

  /** The Shared World's chronicle — entries and accepted summary, one key. */
  sharedWorldHistory: (worldId: SharedWorldId): ReadKey => key`shared-world-history:${worldId}`,

  /**
   * What this campaign can build an encounter from: the bundle, the caller's
   * own Library, and the group's shares — the encounter picker's read. Never a
   * campaign instance; those are internal rows the instancing decision of
   * 2026-09-02 keeps off every list.
   */
  creatures: (campaignId: CampaignId): ReadKey => key`creatures:${campaignId}`,

  /**
   * This campaign's rules vocabulary: the shared bundle, the reader's own
   * Library, and originals shared to the campaign's group — the create form's
   * picker, and the one campaign-scoped list a *player* reads.
   */
  options: (campaignId: CampaignId): ReadKey => key`options:${campaignId}`,

  // ----------------------------------------------------------------- a night

  /** *Before you sit down* — one night's checklist. */
  prep: (sessionId: SessionId): ReadKey => key`prep:${sessionId}`,

  /** The fights of one night, as a list — which one is on the table, and which are over. */
  runs: (sessionId: SessionId): ReadKey => key`runs:${sessionId}`,

  /**
   * What a night is assembled into.
   *
   * The one key with a reader and no writer, and that is honest rather than
   * dead: the web app writes no beat, and the three sources a recap is made of
   * — the fights, the ticked prep, the read-aloud notes — are all written from
   * screens that are not looking at a recap. When something does write one, the
   * key it names is already here.
   */
  recap: (sessionId: SessionId): ReadKey => key`recap:${sessionId}`,

  /** Browser-rolled dice filed under this night, newest first for the DM's tray. */
  rolls: (sessionId: SessionId): ReadKey => key`rolls:${sessionId}`,

  /** Shared live-session NPC channels available to active table participants. */
  sessionNpcs: (sessionId: SessionId): ReadKey => key`session-npcs:${sessionId}`,

  /** The player-safe live table and this account's own live-table roll log. */
  playerTable: (campaignId: CampaignId): ReadKey => key`player-table:${campaignId}`,

  // --------------------------------------------------------------- an account

  /**
   * The tables this account sits at, live and archived — `GET /me/campaigns`
   * and its shelf, deliberately one key.
   *
   * Archiving moves a row from one list to the other, so a key per list would
   * be a write that has to remember both.
   */
  myCampaigns: "me:campaigns" as ReadKey,

  /** The explicit Shared Worlds this account belongs to. */
  mySharedWorlds: "me:shared-worlds" as ReadKey,

  /** One Shared World: its row, campaign directory and roster. */
  sharedWorld: (worldId: SharedWorldId): ReadKey => key`shared-world:${worldId}`,

  /** The characters this account plays, across every table. */
  myCharacters: "me:characters" as ReadKey,

  /** One character's bounded spell vocabulary. */
  characterSpells: (characterId: CharacterId): ReadKey => key`me:characters:${characterId}:spells`,

  /** The account's Library: the creatures it authored, plus the bundle. */
  library: "library" as ReadKey,

  /** The account's spell Library: original spells, plus the 2014 SRD bundle. */
  librarySpells: "library:spells" as ReadKey,

  /** The account's equipment Library: original mundane gear, plus the 2014 SRD bundle. */
  libraryEquipment: "library:equipment" as ReadKey,

  /** The account's magic item Library: originals, plus the 2014 SRD bundle. */
  libraryMagicItems: "library:magic-items" as ReadKey,

  /** The account's Library of reference rules: originals, plus the pinned 2014 compendium. */
  libraryRuleArticles: "library:rule-articles" as ReadKey,

  /** The account's Library of feats: originals, plus the pinned 2014 baseline. */
  libraryFeats: "library:feats" as ReadKey,

  /** The account's Library of reusable NPC sources. */
  libraryNpcs: "library:npcs" as ReadKey,

  /** One reusable NPC source. */
  libraryNpc: (npcId: NpcId): ReadKey => key`library:npcs:${npcId}`,

  /** One Library feat and its prerequisite rows. */
  libraryFeat: (featId: FeatId): ReadKey => key`library:feats:${featId}`,

  /** One Library compendium article and its ordered sections. */
  libraryRuleArticle: (articleId: RuleArticleId): ReadKey =>
    key`library:rule-articles:${articleId}`,

  /**
   * The account's Library of **character options** — the classes, races and
   * backgrounds it authored, plus the bundle.
   *
   * Its own key rather than `library`'s, because the two lists have no reader
   * in common: nothing draws a monster and a class in one place, so refreshing
   * one on a write to the other would be a request nobody is waiting for.
   */
  libraryOptions: "library:options" as ReadKey,

  /** Concrete abilities, languages, skills, proficiencies and traits attachable in the Library. */
  libraryOptionVocabulary: "library:options:vocabulary" as ReadKey,

  /** One Library class's concrete subclass, level and feature rows. */
  libraryOptionProgression: (optionId: CharacterOptionId): ReadKey =>
    key`library:options:progression:${optionId}`,
} as const;
