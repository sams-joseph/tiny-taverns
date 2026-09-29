import { Schema } from "effect";
import { Beat } from "./Beat.js";
import { Campaign, CAMPAIGN_DESCRIPTION_MAX } from "./Campaign.js";
import { CampaignAct } from "./CampaignAct.js";
import { CampaignStory } from "./CampaignStory.js";
import { Character, CharacterSheet, SheetBody } from "./Character.js";
import { Encounter, EncounterChallenge, EncounterKind } from "./Encounter.js";
import { ChallengeRating } from "./EncounterDifficulty.js";
import { SharedWorldHistoryEntry, SharedWorldHistorySummary } from "./SharedWorldHistory.js";
import {
  AssistantThreadId,
  AssistantTurnId,
  BeatId,
  CampaignActId,
  CampaignId,
  CampaignStoryId,
  CharacterId,
  CreatureId,
  EncounterId,
  NoteId,
  NpcId,
  SessionId,
  SharedWorldHistoryEntryId,
  SharedWorldHistorySummaryId,
  SharedWorldId,
} from "./Ids.js";
import { Note, NoteCategory, NoteKind } from "./Note.js";
import { Npc, NpcAttitude, NpcPersona, NpcPrivateMaterial, NpcSheet, NpcStatus } from "./Npc.js";
import { PrepItem } from "./PrepItem.js";
import { Session } from "./Session.js";
import { SharedWorld, SHARED_WORLD_DESCRIPTION_MAX } from "./SharedWorld.js";

/**
 * Hob: the assistant, on the wire.
 *
 * **Hob gets tools, not a context blob**, and that is the one architectural
 * rule this whole surface exists to keep. Nothing on this page carries campaign
 * material into the model: `HobAsk` is the thread the DM typed and nothing
 * else, and every fact in an answer arrives through a tool call that is an
 * ordinary actor-scoped repository read — the same call the HTTP API makes.
 * Because those reads require `CurrentActor` at the type level, Hob cannot
 * reach outside the campaign in the path or above the role in the credential,
 * and that is enforced by the compiler rather than by a sentence in a prompt.
 *
 * A pre-assembled context blob would be a *second* data path with its own
 * filtering, which is precisely the retrofit every decision in this repo has
 * been avoiding. See `apps/server/src/assistant/` for the toolkit.
 *
 * ### The conversation is the server's, and so is the proposal
 *
 * A thread and its turns are rows (`assistant_thread`, `assistant_turn`),
 * campaign-scoped through the ordinary predicates. So `HobAsk` carries **one
 * question and a thread id**, not a transcript: a client cannot forge what was
 * said, a reload does not lose the conversation, and `assistant_turn_id` — inert
 * on every content table since the first migration — finally points at a row.
 *
 * A **proposal is not a row in the campaign.** It is stored on the turn that
 * produced it and rendered for review; `accept` is the only thing that
 * materialises a note, a beat, an encounter or a character, and it writes
 * `origin: "assistant"` with that turn's id. Nothing else in the server ever writes that
 * origin — Hob has no write tool and no `SqlClient`, so "nothing enters the
 * campaign without an explicit human accept" is a property of the wiring rather
 * than a rule someone has to keep. See the captain's decision in
 * `decisions/assistant-generation.md` (option C, *generate with approval*).
 *
 * ### Unconfigured is a supported mode, not a broken one
 *
 * Exactly like hosted sign-in (`IdentityProvider.disabled`): with no model
 * endpoint configured the server starts, the suite passes, and `status`
 * answers `available: false`. The panel then renders the line it already
 * renders — *nothing is behind this panel* — instead of a composer that
 * swallows a question. `ask` in that state is a declared `HobUnavailable`, not
 * a stack trace.
 */

/**
 * Whether anything is behind the panel, and what.
 *
 * `model` is the configured model id and is `null` whenever `available` is
 * false. It is not decoration: a DM who has pointed the server at a local
 * server wants to see *which* model answered, and it is the one line that
 * distinguishes "no endpoint configured" from "configured, pointed at the
 * wrong model".
 */
export class HobStatus extends Schema.Class<HobStatus>("HobStatus")({
  available: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  /**
   * The campaign Hob is bound to, by name.
   *
   * Here because the panel draws a *"Knows"* strip and the strip must be true:
   * it is the one thing Hob can say it knows without asking, and the endpoint
   * has already read the row to authorise the request. Everything else the
   * delivered strip shows — the party, the fight on the table — would be a
   * second data path for a decoration, which is the whole thing this surface
   * refuses.
   */
  campaign: Schema.String,
}) {}

/**
 * `HobStatus` for a Shared World. Its own class because the *"Knows"* strip
 * names the world's canonical history, never any campaign's private prep.
 */
export class SharedWorldHobStatus extends Schema.Class<SharedWorldHobStatus>(
  "SharedWorldHobStatus",
)({
  available: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
  sharedWorld: Schema.String,
}) {}

/**
 * `HobStatus` for drafting a character with no campaign (`/me/hob`). It names
 * nothing Hob knows, because on that surface it knows only the core rules,
 * which is the same for everybody.
 */
export class HobDraftStatus extends Schema.Class<HobDraftStatus>("HobDraftStatus")({
  available: Schema.Boolean,
  model: Schema.NullOr(Schema.String),
}) {}

/**
 * Who said a line — the panel's own vocabulary, not the model provider's.
 *
 * `hob` rather than `assistant` because that is what `HobTurn` in `apps/web`
 * already calls it, and mapping to a provider's role names is one `switch` in
 * the one file that talks to a provider.
 */
export const HobWho = Schema.Literals(["user", "hob"]);
export type HobWho = typeof HobWho.Type;

/** One line of a thread, whoever said it. Bounded so a paste is a 400, not a row. */
const turnText = Schema.String.check(Schema.isLengthBetween(1, 4000));

/**
 * One creature on a proposed roster, resolved.
 *
 * `creatureId` is the half that matters — accepting inserts an
 * `encounter_creature` row pointing at it, through the same reachability check
 * `EncounterCreatures.create` applies to a DM's own roster edit. The other three
 * are the *display* half, resolved out of the bestiary when the proposal was
 * made so the card can be drawn without a second read per line. They are a
 * snapshot in exactly the sense `combatant.display_name` is: a creature renamed
 * between proposing and accepting leaves the card reading what Hob showed, and
 * the accepted roster still points at the row.
 */
export const HobRosterLine = Schema.Struct({
  creatureId: CreatureId,
  count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  name: Schema.String,
  /** As the DM says it — `"1/4"`. See the bestiary notes on `Creature.cr`. */
  cr: Schema.String,
  hp: Schema.Int,
});
export type HobRosterLine = typeof HobRosterLine.Type;

/**
 * What Hob is offering to add, if the person who asked says yes.
 *
 * **One member per accept target**, each one a shipped table: a `note` (prep
 * prose or read-aloud), a `beat` (the DM's line about what happened), a
 * `nightSummary` (a played night's summary, kept on the night), a `night`
 * (the next session, with its prep checklist), an `act` (a named run of
 * nights on the Chronicle), an
 * `encounter` (a template and its roster), a `character` (the asker's own,
 * drafted for them), the Shared World's Chronicle entry and Story So Far, a
 * campaign's own story so far (`campaignStory`), a new campaign NPC (`npc`),
 * an NPC's sheet (`npcSheet`), a `campaign` (the asker's new table) and a
 * `sharedWorld` (the asker's new world). The union is discriminated on `target` for the reason
 * `SearchHit` is discriminated on `source` — `roster` exists only on an
 * encounter and `title` only on the thing that has one, and a nullable field
 * the client renders anyway is the failure this schema style exists to
 * prevent.
 *
 * **Which of these can be offered is decided by which toolkit answered, not by
 * anything here.** A campaign's panel has `proposeNote`, `proposeBeat`,
 * `proposeNightSummary`, `proposeNight`, `proposeAct`, `proposeEncounter`,
 * `proposeCampaignStory`, `proposeNpc` and `proposeNpcSheet`; the drafting
 * composer's has `proposeCharacter` and nothing else (`HobAsk.intent` and
 * `HobDraftAsk.intent` pick it); the
 * account's own panel has `proposeCharacter`, `proposeCampaign` and
 * `proposeSharedWorld`. So the halves of this union are reachable from
 * disjoint conversations: a character, a campaign or a Shared World proposal
 * only ever lives in the asker's *own* thread and
 * materialises into their own ownership, and a member who cannot write the
 * campaign holds no thread an encounter could be accepted from. That is a set
 * of predicates, not a check anywhere. See `assistant/toolkit.ts` and
 * `repo/visibility.ts`'s `conversationReachable`.
 *
 * It is deliberately **not** a general artifact framework. The delivered
 * `ChatParts.jsx` draws eight kinds; the ones that are not one of these
 * have nowhere to go, so proposing one would be a card whose *Save* button
 * could only lie.
 */
export const HobProposal = Schema.Union([
  Schema.Struct({
    target: Schema.Literal("note"),
    title: Schema.String,
    body: Schema.String,
    kind: NoteKind,
    /**
     * What the note is about, when Hob named it; absent when it did not, and
     * on every proposal made before notes had a category.
     */
    category: Schema.optional(NoteCategory),
  }),
  Schema.Struct({
    target: Schema.Literal("beat"),
    body: Schema.String,
  }),
  /**
   * A summary of one night for the Chronicle, drafted for the DM who keeps it
   * (the captain's Q1 c: Hob drafts, the DM keeps). `sessionId` is resolved
   * when the proposal is made, against a night the DM may write and that has
   * been played, and is where the accept writes; `sessionNumber` is the
   * card's display half, a snapshot exactly as a roster line's name is.
   * Accepting replaces whatever summary the night held.
   */
  Schema.Struct({
    target: Schema.Literal("nightSummary"),
    sessionId: SessionId,
    sessionNumber: Schema.Int,
    text: Schema.String,
  }),
  /**
   * The next night, planned: its title, the lines of its "Before you sit
   * down" checklist, and optionally an act that starts at it. Offered to the
   * campaign's creator by the campaign's own Hob — the creator's toolkit alone
   * has `proposeNight`.
   *
   * No number: the accept numbers the night one past the highest the campaign
   * has at that moment, as *Start the night* would. Accepting creates the
   * session, each prep line and the act in one transaction, every row stamped
   * `origin = 'assistant'` with the turn and none shared with the table. The
   * night is planned, not open: the campaign does not point at it, so nothing
   * goes live until *Start the night* opens it.
   */
  Schema.Struct({
    target: Schema.Literal("night"),
    /** Null when Hob gave none, and the night reads as *Session N*. */
    title: Schema.NullOr(Schema.String),
    /** The checklist's lines, in the order Hob wrote them; each is one prep item. */
    prep: Schema.Array(Schema.String),
    /** The title of an act that starts at this night, when Hob named one. */
    actTitle: Schema.NullOr(Schema.String),
  }),
  /**
   * A new act on the Chronicle, starting at a night the campaign already has
   * and running until the next act. Offered to the campaign's creator by the
   * campaign's own Hob (`proposeAct`). Accepting is `Acts.create`, the
   * creator's own write, stamped with the turn; a night that has started an
   * act since is that create's `Conflict`.
   */
  Schema.Struct({
    target: Schema.Literal("act"),
    title: Schema.String,
    firstSessionNumber: Schema.Int,
  }),
  Schema.Struct({
    target: Schema.Literal("encounter"),
    name: Schema.String,
    /*
     * No difficulty: it is computed from the roster and the party once the
     * encounter exists (`EncounterDifficulty.ts`). A proposal stored before
     * that may still carry the band it once had; decoding ignores the key.
     */
    tags: Schema.Array(Schema.String),
    /**
     * The line the encounter's battle map is drawn from, when Hob wrote one;
     * absent when it did not, and on every proposal made before there was one.
     * The card shows it, because accepting draws the map from it.
     */
    setting: Schema.optional(Schema.String),
    /**
     * The encounter's kind and its DM prep, as the accept writes them. Absent
     * on every proposal made before Hob could offer them: those were fights
     * with no prep, so an absent `kind` is a fight.
     */
    kind: Schema.optional(EncounterKind),
    tactics: Schema.optional(Schema.Array(Schema.String)),
    treasure: Schema.optional(Schema.String),
    challenge: Schema.optional(EncounterChallenge),
    roster: Schema.Array(HobRosterLine),
  }),
  /**
   * A character, drafted for the player who asked — **the fourth member, and
   * the only one a DM can never be offered.**
   *
   * It is the whole of what an accept needs and nothing else: `name`, the two
   * halves of the descriptor, and the sheet document. There is no `level`,
   * because a new character is level 1 and levelling one up is an act somebody
   * takes afterwards; and no `visibility`, `hpCurrent` or `accountId`, for the
   * reason `CharacterOwnCreate` has none of them either — the row falls to its
   * column defaults and is `dm` and unhurt.
   *
   * **`sheet` is resolved when the proposal is made, not when it is accepted.**
   * The tool takes no numbers at all — it ranks the six abilities and the
   * server applies the standard array and derives each modifier — so this is
   * where that arithmetic has already happened, exactly as `roster` above is
   * where a creature's name and rating have already been read out of the
   * bestiary. A card and the row it becomes therefore cannot disagree, and the
   * accept does no work a reader could not see coming.
   *
   * `rationale` is the drawing's *What Hob did* aside
   * (`CharacterCreate.jsx:202-215`), and it is on the proposal rather than
   * re-derived because it is a fact about *this* draft — "Wisdom is highest
   * because you described someone who watches" — that nothing in the character
   * row records. It survives a reload with the card, and it is deliberately
   * **not** carried onto the accepted row: a character sheet has nowhere to
   * keep an argument, and `origin = 'assistant'` is the provenance the row
   * itself owes.
   */
  Schema.Struct({
    target: Schema.Literal("character"),
    name: Schema.String,
    /**
     * The descriptor labels, as **the vocabulary's own labels** where Hob could
     * resolve them.
     *
     * `proposeCharacter` takes `race` and `className` as closed enums where the
     * campaign vocabulary fits in one, so what lands here is a label
     * `packages/api/src/Ruleset.ts` can seed from — which is what lets the
     * three numbers below exist at all.
     *
     * They stay `NullOr(String)` rather than the enums themselves, and that is
     * not laziness. **A proposal is persisted** — it is `assistant_turn.proposal`,
     * a `jsonb` column read back on every thread read — so narrowing this type
     * would make a draft written before the vocabulary existed fail to decode,
     * and it would take the whole conversation down with it. The enum belongs
     * where a *new* value is chosen; this is where an old one has to survive.
     */
    race: Schema.NullOr(Schema.String),
    subrace: Schema.optional(Schema.NullOr(Schema.String)),
    className: Schema.NullOr(Schema.String),
    sheet: CharacterSheet,
    /**
     * What the character starts on — **resolved when the proposal is made, for
     * the reason `sheet` above is.**
     *
     * `Ruleset.seedFor` reads the class hit die, the race, and the
     * constitution and dexterity modifiers the `sheet` beside this already
     * carries, and it runs once: the card the player is looking at and the row
     * they get by pressing *Keep them* cannot disagree, and the accept does no
     * arithmetic a reader could not see coming.
     *
     * **Optional keys rather than nullable ones**, which is the same
     * persisted-column argument the two labels above make: a proposal written
     * before this existed simply has no key, decodes exactly as it did, and
     * accepts to a row whose three columns fall to their defaults — which is
     * what it would have done anyway.
     *
     * `level` is always 1 and is here rather than assumed at the accept for the
     * same one-answer reason. `ac` is the unarmoured base and `hpMax` the die
     * plus constitution; both are seeded starting points the player edits on the
     * sheet, and neither is ever recomputed.
     */
    level: Schema.optional(Schema.Int),
    ac: Schema.optional(Schema.Int),
    hpMax: Schema.optional(Schema.Int),
    /** Short lines, in the order Hob wrote them. Empty is legal and draws nothing. */
    rationale: Schema.Array(Schema.String),
  }),
  /**
   * A line for the Shared World's chronicle — the fifth member, and the only one
   * offered by Shared World Hob. Accepting it writes a `group_history_entry`
   * through the same repository path a member's own hand goes through,
   * with `origin = 'assistant'` and the turn on it; until then it is
   * transcript, exactly like the other four. A campaign Hob never offers one
   * and Shared World Hob offers nothing else — which toolkit was bound is the
   * whole of that rule.
   */
  Schema.Struct({
    target: Schema.Literal("sharedWorldHistory"),
    title: Schema.NullOr(Schema.String),
    body: Schema.String,
  }),
  /**
   * A proposed replacement for the Shared World's accepted Story So Far.
   * `lastWorldSeq` is captured by the server from the exact source batch Hob
   * read; it is never supplied by the model or the accepting client.
   */
  Schema.Struct({
    target: Schema.Literal("sharedWorldSummary"),
    text: Schema.String,
    lastWorldSeq: Schema.Int,
  }),
  /**
   * A campaign's story so far and its *Previously*, offered to the creator by
   * the campaign's own Hob. `afterSessionNumber` is the newest ended night in
   * the batch Hob read (`readCampaignStorySources`), captured by the server
   * the way `lastWorldSeq` is; neither the model nor the accepting client
   * supplies it. Accepting it replaces the campaign's story, `dm` until the
   * creator shares it.
   */
  Schema.Struct({
    target: Schema.Literal("campaignStory"),
    text: Schema.String,
    previously: Schema.NullOr(Schema.String),
    afterSessionNumber: Schema.Int,
  }),
  /**
   * A sheet for one of the campaign's NPCs, offered to its creator by the
   * campaign's own Hob — the creator's toolkit alone has `proposeNpcSheet`.
   *
   * It is `character`'s shape one row over, and for `character`'s reasons:
   * the model names a class, a level and optionally a race, a background and
   * a challenge rating; the server ranks nothing it was not told, composes the
   * document through `startingSheetBody` (the form's and `proposeCharacter`'s
   * one assembly) and seeds `ac` and `hpMax` at that level, so the card and
   * the row it becomes cannot disagree. `npcName` is the card's display half,
   * a snapshot as a roster line's creature name is.
   *
   * `replaces` is the sheet the NPC already had when Hob offered this one,
   * which the creator asked it to replace: its `version` is what the accept
   * sends as the PUT's `expectedVersion`, so a sheet edited by hand since the
   * offer refuses the keep rather than being overwritten, and `descriptor` is
   * the card's line saying what goes. Null is an NPC with no sheet, and the
   * accept is then refused if one has appeared since. Accepting writes the
   * sheet with `origin = 'assistant'` and the turn (`0077_npc_sheet_origin.ts`).
   */
  Schema.Struct({
    target: Schema.Literal("npcSheet"),
    npcId: NpcId,
    npcName: Schema.String,
    level: Schema.Int,
    race: Schema.NullOr(Schema.String),
    subrace: Schema.NullOr(Schema.String),
    className: Schema.String,
    ac: Schema.NullOr(Schema.Int),
    hpMax: Schema.NullOr(Schema.Int),
    cr: Schema.NullOr(ChallengeRating),
    sheet: SheetBody,
    replaces: Schema.NullOr(
      Schema.Struct({ version: Schema.Int, descriptor: Schema.NullOr(Schema.String) }),
    ),
    /** Short lines, in the order Hob wrote them — `character`'s *What Hob did*. */
    rationale: Schema.Array(Schema.String),
  }),
  /**
   * A new NPC for the campaign's cast, offered to its creator by the
   * campaign's own Hob — the creator's toolkit alone has `proposeNpc`.
   *
   * The fields are the ones the Cast drawer writes: the name and role, the
   * public persona (a summary, the appearance line the portrait is drawn
   * from, the voice and manner, what they want), the DM-only secret, and the
   * creator's prep (attitude, status, whereabouts). No `visibility`: a kept
   * NPC takes the column's default, hidden from the table until the DM shares
   * it, as every accepted row does.
   *
   * `sheet` is null unless the DM asked for stats; when drafted it is composed
   * exactly as `npcSheet`'s is, through `startingSheetBody`, so the two tools
   * cannot disagree about what a level 5 Fighter is. Accepting creates the
   * NPC through the cast's own create, then its prep and its sheet through
   * the creator's own writes, the NPC and the sheet stamped `origin =
   * 'assistant'` with the turn, and the handler starts the portrait after
   * the commit as the cast's create does.
   */
  Schema.Struct({
    target: Schema.Literal("npc"),
    name: Schema.String,
    /** `""` when Hob gave none, as the column's default is. */
    role: Schema.String,
    persona: NpcPersona,
    privateMaterial: NpcPrivateMaterial,
    prep: Schema.Struct({
      attitude: Schema.NullOr(NpcAttitude),
      status: Schema.NullOr(NpcStatus),
      whereabouts: Schema.NullOr(Schema.String),
    }),
    sheet: Schema.NullOr(
      Schema.Struct({
        level: Schema.Int,
        race: Schema.NullOr(Schema.String),
        subrace: Schema.NullOr(Schema.String),
        className: Schema.String,
        ac: Schema.NullOr(Schema.Int),
        hpMax: Schema.NullOr(Schema.Int),
        cr: Schema.NullOr(ChallengeRating),
        sheet: SheetBody,
      }),
    ),
  }),
  /**
   * A new campaign, drafted in the account's own conversation (`/me/hob`) —
   * the one member offered with no campaign or Shared World in view.
   *
   * The fields are the ones `NewCampaignDialog` writes, and both go through
   * `campaignCreateFrom`, so a form and a draft start a campaign the same way.
   * `world` is a Shared World the asker is a live member of, **resolved when
   * the proposal is made**: the id is what the accept creates the campaign in,
   * and the name is the card's display half, a snapshot exactly as a roster
   * line's creature name is. Null is a standalone campaign. The accept checks
   * the world again through the ordinary create, so a world left or archived
   * in between is the create's own refusal.
   */
  Schema.Struct({
    target: Schema.Literal("campaign"),
    name: Schema.String,
    partyName: Schema.NullOr(Schema.String),
    description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(CAMPAIGN_DESCRIPTION_MAX))),
    world: Schema.NullOr(Schema.Struct({ id: SharedWorldId, name: Schema.String })),
  }),
  /**
   * A new Shared World, drafted in the account's own conversation — the
   * panel's other thing an account founds on its own.
   *
   * The fields are the two `NewSharedWorldDialog` writes, and both go through
   * `sharedWorldCreateFrom`, so a form and a draft found a world the same way.
   * The accept makes the asker its owner and first member, as the form does,
   * and the one cover is drawn from `description` after it commits.
   */
  Schema.Struct({
    target: Schema.Literal("sharedWorld"),
    name: Schema.String,
    description: Schema.NullOr(
      Schema.String.check(Schema.isMaxLength(SHARED_WORLD_DESCRIPTION_MAX)),
    ),
  }),
]);
export type HobProposal = typeof HobProposal.Type;

/**
 * One conversation, as a row.
 *
 * `title` is the first question, shortened. It is not decoration: a thread is
 * the unit the panel resumes and the unit a future picker would list, and a
 * conversation with no name is one nobody can choose between. There is no
 * picker drawn yet — the panel resumes the newest thread — so this is the one
 * field here that is ahead of a surface, and it costs a `substring`.
 */
export class HobThread extends Schema.Class<HobThread>("HobThread")({
  id: AssistantThreadId,
  /**
   * The thread's scope: a campaign's conversation or a Shared World's, or
   * neither for a character drafted with no campaign, which belongs to its
   * author alone (`assistant_thread_one_scope`, `0054`).
   */
  campaignId: Schema.NullOr(CampaignId),
  worldId: Schema.NullOr(SharedWorldId),
  title: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * What a kept proposal made, as a pointer: the kind `HobAccepted` names and
 * the ids its screen is addressed by. It is what a kept card's *Open it*
 * opens, and it is stored on the turn by the accept, so the card still opens
 * after a reload or a move to another scope — the panel reads the turn back
 * and has nothing else to go on.
 *
 * A pointer and never an access path: the screen it opens reads the row
 * through its own actor-scoped read, so a row deleted since is that screen's
 * ordinary `NotFound`. `keptFrom` is the one way to make one.
 */
export const HobKept = Schema.Union([
  Schema.Struct({ accepted: Schema.Literal("note"), id: NoteId }),
  Schema.Struct({ accepted: Schema.Literal("beat"), id: BeatId, sessionId: SessionId }),
  Schema.Struct({ accepted: Schema.Literal("nightSummary"), sessionId: SessionId }),
  Schema.Struct({ accepted: Schema.Literal("night"), sessionId: SessionId }),
  Schema.Struct({ accepted: Schema.Literal("act"), id: CampaignActId }),
  Schema.Struct({ accepted: Schema.Literal("encounter"), id: EncounterId }),
  Schema.Struct({ accepted: Schema.Literal("character"), id: CharacterId }),
  Schema.Struct({
    accepted: Schema.Literal("sharedWorldHistory"),
    id: SharedWorldHistoryEntryId,
    worldId: SharedWorldId,
  }),
  Schema.Struct({
    accepted: Schema.Literal("sharedWorldSummary"),
    id: SharedWorldHistorySummaryId,
    worldId: SharedWorldId,
  }),
  Schema.Struct({ accepted: Schema.Literal("campaignStory"), id: CampaignStoryId }),
  Schema.Struct({ accepted: Schema.Literal("npc"), id: NpcId }),
  Schema.Struct({ accepted: Schema.Literal("npcSheet"), npcId: NpcId }),
  Schema.Struct({ accepted: Schema.Literal("campaign"), id: CampaignId }),
  Schema.Struct({ accepted: Schema.Literal("sharedWorld"), id: SharedWorldId }),
]);
export type HobKept = typeof HobKept.Type;

/**
 * One line of a persisted conversation.
 *
 * `proposal` is null on every user turn and on most of Hob's — it is set only
 * when Hob offered something, and **its presence is not its acceptance**.
 * `acceptedAt` is the difference between a card somebody is looking at and a
 * row in the campaign, which is the whole safety property: an unkept proposal
 * is a turn with a `proposal` and no `acceptedAt`, and no note, beat, encounter
 * or character anywhere.
 *
 * `discardedAt` is the other answer a person can give a card: no. A discarded
 * proposal stays on its turn — the record keeps what was offered, and Hob is
 * told it was turned down — but it is no longer an offer, so it cannot be
 * accepted and the panel no longer draws it. A turn is kept or discarded,
 * never both (`0080`). `kept` is what the accept made, for *Open it*; null on
 * everything unkept and on turns kept before it was recorded.
 *
 * There is no `origin` or `visibility` on the wire though the columns exist. A
 * turn's origin is `who` said it, and a conversation is DM-only by the column
 * default; restating either here would be two answers to one question.
 */
export class HobTurn extends Schema.Class<HobTurn>("HobTurn")({
  id: AssistantTurnId,
  threadId: AssistantThreadId,
  who: HobWho,
  text: Schema.String,
  proposal: Schema.NullOr(HobProposal),
  /** When the DM accepted it into the campaign, or null. */
  acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  /** When a person discarded the proposal, or null. */
  discardedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  kept: Schema.NullOr(HobKept),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A question, and the conversation it belongs to.
 *
 * **The thread is a row, so the client sends an id rather than a transcript.**
 * That is the fix for the gap this replaced: the old payload carried every
 * message, which meant a reload lost the conversation, a client could rewrite
 * what it had been told, and there was nothing for `assistant_turn_id` to point
 * at. The server reads the thread it owns, appends the question, and appends the
 * answer when it has one.
 *
 * `threadId` absent starts a new thread — which is what the panel's *New thread*
 * button does, and what a first question does.
 *
 * ### `intent` is which surface is asking, and it exists for the creator
 *
 * Two surfaces share this endpoint: the docked panel (the campaign's own
 * conversation, the creator's toolkit) and the character-drafting composer on
 * the create screen. They used to be told apart by the caller's relation —
 * only a player could reach the composer, and only a creator held the panel —
 * so the server could infer the surface from the `CampaignCreatorActor` proof.
 * The continuity decision broke that inference: a creator writes their own
 * characters like anybody else, so the same account now legitimately asks from
 * both surfaces, and a proof cannot say which one is open.
 *
 * `intent: "character"` is the drafting composer saying so. The server answers
 * it with the drafting toolkit (`proposeCharacter` + `searchCampaign`) and a
 * thread of the *asker's own*, whatever their relation to the campaign — for a
 * player that is what they already got, and for a creator it is what keeps a
 * character description out of the campaign's shared conversation. Absent
 * means the panel, which keeps its old behaviour exactly.
 */
export const HobAsk = Schema.Struct({
  threadId: Schema.optional(AssistantThreadId),
  text: turnText,
  intent: Schema.optional(Schema.Literal("character")),
});
export type HobAsk = typeof HobAsk.Type;

/**
 * A question to a campaign's Hob (`/campaigns/:c/hob/ask`): `HobAsk`, or the
 * Chronicle composer asking for a draft of one night's summary.
 *
 * `intent: "nightSummary"` is the composer saying which night it is writing
 * up, so the server can bind that night before the model is called: the
 * creator's toolkit and the campaign's own conversation, as the panel's, and
 * a night the creator cannot write is the ordinary `NotFound`. It is not a
 * second path to a summary: Hob offers the draft with `proposeNightSummary`
 * and the DM keeps it through the same accept every proposal takes.
 */
export const HobCampaignAsk = Schema.Union([
  HobAsk,
  Schema.Struct({
    threadId: Schema.optional(AssistantThreadId),
    text: turnText,
    intent: Schema.Literal("nightSummary"),
    sessionId: SessionId,
  }),
]);
export type HobCampaignAsk = typeof HobCampaignAsk.Type;

/**
 * A question to the account's own Hob, with no campaign (`/me/hob/ask`).
 *
 * Two surfaces share this endpoint, as two share `HobAsk`'s: the character
 * create screen's drafting composer and the docked panel on every screen
 * outside a campaign or Shared World. `intent: "character"` is the composer
 * saying so, and it gets the character-drafting toolkit and nothing else.
 * Absent means the panel, whose toolkit drafts a character, a campaign or a
 * Shared World.
 */
export const HobDraftAsk = Schema.Struct({
  threadId: Schema.optional(AssistantThreadId),
  text: turnText,
  intent: Schema.optional(Schema.Literal("character")),
});
export type HobDraftAsk = typeof HobDraftAsk.Type;

/**
 * The thread and the turn this answer is being written into, said first.
 *
 * Emitted before the model is called at all, because the client needs both ids
 * before it needs a word of the answer: the thread id is what the *next*
 * question continues, and the turn id is what an accept names. Sending them at
 * the end would mean a dropped connection loses the thread the question was
 * already saved to.
 */
export class HobBegun extends Schema.Class<HobBegun>("HobBegun")({
  threadId: AssistantThreadId,
  /** The turn Hob's answer will be saved as, and the one an accept names. */
  turnId: AssistantTurnId,
}) {}

/** A slice of the answer, as it is generated. */
export class HobDelta extends Schema.Class<HobDelta>("HobDelta")({
  text: Schema.String,
}) {}

/** Whether Hob has asked a tool for something, or heard back. */
export const HobToolPhase = Schema.Literals(["called", "answered"]);
export type HobToolPhase = typeof HobToolPhase.Type;

/**
 * Hob reaching for the record.
 *
 * On the wire because it is the honest account of where an answer came from:
 * a DM who is told the ferryman is called Cazril should be able to see that it
 * was read out of their own notes rather than invented. It is also the only
 * thing that makes a slow first token legible — a local model spends its first
 * seconds deciding to search.
 *
 * `detail` is a short, already-rendered line ("ferryman", "3 results"), not a
 * payload. The tool's parameters and result belong to the model; restating
 * them here would make a client branch on a shape that is the toolkit's to
 * change.
 */
export class HobToolStep extends Schema.Class<HobToolStep>("HobToolStep")({
  /** The tool's name, as the toolkit declares it — `searchCampaign`. */
  name: Schema.String,
  phase: HobToolPhase,
  detail: Schema.String,
}) {}

/**
 * Hob has proposed something, and it is saved on the turn named here.
 *
 * The turn id is repeated rather than assumed from `began`, because it is the
 * id an accept has to name and a client should not have to remember which of
 * two events carried it.
 */
export class HobProposed extends Schema.Class<HobProposed>("HobProposed")({
  turnId: AssistantTurnId,
  proposal: HobProposal,
}) {}

/** The answer is complete. `reason` is the provider's finish reason. */
export class HobDone extends Schema.Class<HobDone>("HobDone")({
  reason: Schema.String,
}) {}

/**
 * Generation failed part-way.
 *
 * An event inside a 200 rather than a status, because by the time this can
 * happen the response has already begun — the *authorization* answer is a real
 * 404 before a single byte of stream, exactly as `live.events` arranges it.
 */
export class HobFailure extends Schema.Class<HobFailure>("HobFailure")({
  message: Schema.String,
}) {}

/**
 * The answer, as SSE.
 *
 * `events` mode rather than `data` mode, for the reason `LiveEvent` records:
 * `data` mode fixes the event name to `message`, and the name is the
 * discriminant a client branches on.
 *
 * **No `id` line, and none is wanted.** The live log's `id` carries
 * `session_event.seq` so a reconnecting client can resume; an answer is not a
 * log and has no cursor. A dropped Hob stream is re-asked, not resumed — which
 * is also why there are no heartbeats here: the connection lives for one
 * answer, and a tool step is the traffic that proves it is alive.
 */
export const HobEvent = Schema.Union([
  Schema.Struct({
    event: Schema.Literal("began"),
    data: Schema.fromJsonString(HobBegun),
  }),
  Schema.Struct({
    event: Schema.Literal("delta"),
    data: Schema.fromJsonString(HobDelta),
  }),
  Schema.Struct({
    event: Schema.Literal("tool"),
    data: Schema.fromJsonString(HobToolStep),
  }),
  /**
   * Hob has something to offer. Sent once the answer is written, so the card
   * arrives with the sentence that introduces it rather than ahead of it.
   */
  Schema.Struct({
    event: Schema.Literal("proposal"),
    data: Schema.fromJsonString(HobProposed),
  }),
  Schema.Struct({
    event: Schema.Literal("done"),
    data: Schema.fromJsonString(HobDone),
  }),
  Schema.Struct({
    event: Schema.Literal("failed"),
    data: Schema.fromJsonString(HobFailure),
  }),
]);
export type HobEvent = typeof HobEvent.Type;

/**
 * What accepting a proposal produced.
 *
 * The whole row, not an id: the client has just changed the campaign and the
 * cheapest honest thing to hand back is the thing it made — carrying its
 * `origin: "assistant"` and the `assistantTurnId` that answers where it came
 * from. Discriminated on `accepted` for the same reason `HobProposal` is on
 * `target`.
 */
export const HobAccepted = Schema.Union([
  Schema.Struct({ accepted: Schema.Literal("note"), note: Note }),
  Schema.Struct({ accepted: Schema.Literal("beat"), beat: Beat }),
  /** The night whose summary the DM kept, carrying the summary's provenance. */
  Schema.Struct({ accepted: Schema.Literal("nightSummary"), session: Session }),
  /**
   * The night a campaign's creator kept from their Hob: the session, the prep
   * lines made under it in order, and the act that starts at it when the
   * draft named one.
   */
  Schema.Struct({
    accepted: Schema.Literal("night"),
    session: Session,
    prep: Schema.Array(PrepItem),
    act: Schema.NullOr(CampaignAct),
  }),
  /** The act a campaign's creator kept from their Hob. */
  Schema.Struct({ accepted: Schema.Literal("act"), act: CampaignAct }),
  Schema.Struct({ accepted: Schema.Literal("encounter"), encounter: Encounter }),
  /**
   * The character a player accepted, owned by them and carrying
   * `origin: "assistant"`.
   *
   * The whole row, like the three above, and here it earns its keep twice over:
   * the screen navigates straight to `/characters/:id` on the id, and
   * every correction from that moment on is an ordinary `PATCH
   * /me/characters/:id` against exactly this value.
   */
  Schema.Struct({ accepted: Schema.Literal("character"), character: Character }),
  /** The chronicle line a Shared World member kept — world Hob's one accept. */
  Schema.Struct({ accepted: Schema.Literal("sharedWorldHistory"), entry: SharedWorldHistoryEntry }),
  /** The Story So Far a Shared World member approved as its current summary. */
  Schema.Struct({
    accepted: Schema.Literal("sharedWorldSummary"),
    summary: SharedWorldHistorySummary,
  }),
  /** The story so far a campaign's creator kept from their Hob. */
  Schema.Struct({ accepted: Schema.Literal("campaignStory"), story: CampaignStory }),
  /**
   * The NPC a campaign's creator kept from their Hob, as the cast's create
   * answers it: `imagePending` when its portrait started after the commit.
   */
  Schema.Struct({ accepted: Schema.Literal("npc"), npc: Npc }),
  /** The NPC sheet a campaign's creator kept from their Hob. */
  Schema.Struct({ accepted: Schema.Literal("npcSheet"), sheet: NpcSheet }),
  /**
   * The campaign an account kept from its own conversation, created by the
   * same insert `POST /campaigns` (or a Shared World's create) uses, with its
   * cover started after the accept commits. The asker is its creator.
   */
  Schema.Struct({ accepted: Schema.Literal("campaign"), campaign: Campaign }),
  /**
   * The Shared World an account kept from its own conversation, founded by the
   * same insert `POST /worlds` uses, with its cover started after the accept
   * commits. The asker is its owner.
   */
  Schema.Struct({ accepted: Schema.Literal("sharedWorld"), sharedWorld: SharedWorld }),
]);
export type HobAccepted = typeof HobAccepted.Type;

/** The pointer an accept stores on its turn: what it made, by the ids its screen needs. */
export const keptFrom = (accepted: HobAccepted): HobKept => {
  switch (accepted.accepted) {
    case "note":
      return { accepted: "note", id: accepted.note.id };
    case "beat":
      return { accepted: "beat", id: accepted.beat.id, sessionId: accepted.beat.sessionId };
    case "nightSummary":
      return { accepted: "nightSummary", sessionId: accepted.session.id };
    case "night":
      return { accepted: "night", sessionId: accepted.session.id };
    case "act":
      return { accepted: "act", id: accepted.act.id };
    case "encounter":
      return { accepted: "encounter", id: accepted.encounter.id };
    case "character":
      return { accepted: "character", id: accepted.character.id };
    case "sharedWorldHistory":
      return {
        accepted: "sharedWorldHistory",
        id: accepted.entry.id,
        worldId: accepted.entry.worldId,
      };
    case "sharedWorldSummary":
      return {
        accepted: "sharedWorldSummary",
        id: accepted.summary.id,
        worldId: accepted.summary.worldId,
      };
    case "campaignStory":
      return { accepted: "campaignStory", id: accepted.story.id };
    case "npc":
      return { accepted: "npc", id: accepted.npc.id };
    case "npcSheet":
      return { accepted: "npcSheet", npcId: accepted.sheet.npcId };
    case "campaign":
      return { accepted: "campaign", id: accepted.campaign.id };
    case "sharedWorld":
      return { accepted: "sharedWorld", id: accepted.sharedWorld.id };
  }
};

/**
 * No model endpoint is configured, so there is nothing to ask.
 *
 * A declared error rather than a 500, and 503 rather than 404, because the
 * campaign is fine and the request was well formed — the *server* is missing a
 * part, and saying so is what lets the panel print one honest sentence. It is
 * the wire half of `IdentityProvider.disabled`: an opt-in dependency that is
 * absent must degrade, not break.
 */
export class HobUnavailable extends Schema.ErrorClass<HobUnavailable>("HobUnavailable")(
  {
    _tag: Schema.tag("HobUnavailable"),
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}
