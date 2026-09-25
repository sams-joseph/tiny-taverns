import { Schema } from "effect";
import { CharacterPortraitImages } from "./Character.js";
import { CharacterId, CombatantId, CreatureId, EncounterRunId } from "./Ids.js";
import { MAX_INITIATIVE_BONUS, MIN_INITIATIVE_BONUS } from "./Initiative.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * Which icon the initiative row draws, and which half of the seed produced it —
 * `EncounterRunner.jsx:32`, `shield` for a PC and `skull` for anything else.
 */
export const CombatantKind = Schema.Literals(["pc", "npc"]);
export type CombatantKind = typeof CombatantKind.Type;

/**
 * Who put a combatant's initiative number there: the DM (from the runner), or
 * the player whose character it is (from their Table, during the initiative
 * phase). `null` exactly when there is no number yet.
 *
 * It is what decides whether the player may still change it. A player's own
 * number is theirs to correct until the fight begins; once the DM has written
 * one, the DM's is the table's answer and the player's write is refused.
 */
export const InitiativeSetBy = Schema.Literals(["dm", "player"]);
export type InitiativeSetBy = typeof InitiativeSetBy.Type;

/**
 * A condition badge — `"Hostile"`, `"Concentrating"`, `"Prone"`, `"Downed"`,
 * `"Legendary"` (`data.js:15-21`).
 *
 * An open vocabulary in a `text[]`, for the same reason `encounter.tags` is:
 * `EncounterRunner.jsx:6` maps five known names to badge variants and falls
 * back to `secondary` for anything else, which is a UI that expects to meet
 * words it does not know.
 */
const Condition = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));

const conditions = Schema.Array(Condition).check(Schema.isLengthBetween(0, 24));

/**
 * A token's square on its fight's board (`EncounterRunBoard`): zero-based,
 * counted from the board's top-left, so `{ column: 0, row: 0 }` is the corner
 * square and the largest is one less than the board's `columns` and `rows`.
 */
export const CombatantPosition = Schema.Struct({
  column: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 199 })),
  row: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 199 })),
});
export type CombatantPosition = typeof CombatantPosition.Type;

/**
 * One creature *instance* in one fight.
 *
 * The fixtures settle this outright: `data.js:18-19` are two `Goblin Archer`
 * rows with different ids and `hp: 4` vs `hp: 0`. A combatant is not a creature
 * and not a roster line — the bestiary entry is a template, the roster says how
 * many, and this is one of them, with its own hit points.
 *
 * **Hit points reaching zero does not remove it.** `EncounterRunner.jsx:107`
 * says so in the product's own voice: "Still in initiative — remove them when
 * you're ready." A downed combatant stays in the order, greyed and struck
 * through (`:30`, `:34`); removal is a separate, explicit act.
 */
export class Combatant extends Schema.Class<Combatant>("Combatant")({
  id: CombatantId,
  encounterRunId: EncounterRunId,
  /**
   * The party member this was seeded from, if any. `null` for an NPC and for
   * anything the DM typed in mid-fight.
   *
   * `on delete set null`: retiring a character must not delete them out of a
   * fight that already happened. Nothing is ever read *through* this — every
   * displayable field below is a snapshot, and `portrait` is reached through
   * the character's seat, not this pointer — so it is provenance, not an
   * access path.
   */
  characterId: Schema.NullOr(CharacterId),
  /** The bestiary entry this was seeded from, if any. Same rules as above. */
  creatureId: Schema.NullOr(CreatureId),
  /**
   * `"Goblin Archer"`. Two instances of one creature carry the same name — the
   * fixture does not number them (`data.js:18-19`) and neither does this.
   *
   * Snapshotted at seed time rather than joined. A combatant must outlive its
   * template: `creature_id` goes null when the creature is deleted, and a row
   * whose name came from the join would go blank in a fight the DM is running.
   */
  displayName: Schema.String,
  /**
   * The descriptive half of the fixture's `sub` line: `"Half-orc paladin"` for a
   * PC (`data.js:15`), `"Small humanoid"` for an NPC (`data.js:16`).
   *
   * The report says `sub` is derived and to "store the parts", and this is the
   * part that is not `playerName`. It is one column rather than the four
   * (`descriptor`, `playerName`, `size`, `type`) that reconstructing it from
   * both source tables would need, and it is stored rather than joined for the
   * same reason `displayName` is.
   */
  subtitle: Schema.NullOr(Schema.String),
  /**
   * `"Ilse"` — the second half of `"Half-orc paladin · Ilse"`. Separate from
   * `subtitle` so the separator stays a rendering decision, exactly as
   * `Character` already documents for the same string.
   */
  playerName: Schema.NullOr(Schema.String),
  /**
   * `null` until somebody says: a fight is seeded with no numbers, and the
   * initiative phase (`EncounterRun.phase`) is where they arrive. A row with
   * no number sorts after every row with one.
   */
  initiative: Schema.NullOr(Schema.Int),
  /**
   * What this combatant adds to a d20 for initiative, snapshotted at seed time
   * from the sheet (its written initiative, else DEX) or the stat block (DEX).
   * `null` when the document says nothing usable, and for a row added by hand.
   *
   * Two jobs: "roll for them" is d20 plus this, and it breaks initiative ties
   * (`repo/liveTables.ts`, `initiativeOrderKeys`).
   */
  initiativeBonus: Schema.NullOr(Schema.Int),
  initiativeSetBy: Schema.NullOr(InitiativeSetBy),
  /** Zero is a legal, common, deliberate value. It does not mean "gone". */
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
  ac: Schema.NullOr(Schema.Int),
  kind: CombatantKind,
  conditions: Schema.Array(Schema.String),
  /** The per-row "Hide from players" override (`EncounterRunner.jsx:139`). */
  visibility: Visibility,
  /**
   * Where its token stands on the fight's board, or `null` while it is not on
   * the board — where every token starts, because nobody has put it anywhere
   * yet. A player reads it only as a token on their board
   * (`PlayerLiveBoard`), while the DM shows the map.
   */
  position: Schema.NullOr(CombatantPosition),
  /**
   * The portrait of the character this row was seeded from — **live, not a
   * snapshot**, and present only while that character sits in a seat of this
   * campaign the reader may see. The same URLs `Character.portrait` carries,
   * so a combatant never shows a picture its character would not. `null` for
   * an NPC, a hand-added row, a retired seat and a character without one.
   */
  portrait: Schema.NullOr(CharacterPortraitImages),
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const initiative = Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 100 }));
const initiativeBonus = Schema.Int.check(
  Schema.isBetween({ minimum: MIN_INITIATIVE_BONUS, maximum: MAX_INITIATIVE_BONUS }),
);
const hp = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));
const ac = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));

/**
 * Add a combatant by hand — `EncounterRunner.jsx:137`, the `plus` button.
 *
 * Everything but the name is optional because the thing this is for is a
 * summoned wolf or a guard captain the DM invented in the moment, which has no
 * bestiary entry to point at. `characterId`/`creatureId` are absent from the
 * payload deliberately: a combatant seeded *from* something is created by
 * starting the run, and letting a client claim a source it did not seed from
 * would be one more id in a path to have to contain.
 */
export const CombatantCreate = Schema.Struct({
  displayName: Schema.NonEmptyString,
  subtitle: Schema.optional(Schema.String),
  playerName: Schema.optional(Schema.String),
  kind: Schema.optional(CombatantKind),
  initiative: Schema.optional(initiative),
  initiativeBonus: Schema.optional(initiativeBonus),
  hpMax: Schema.optional(hp),
  hpCurrent: Schema.optional(hp),
  ac: Schema.optional(ac),
  conditions: Schema.optional(conditions),
  visibility: Schema.optional(Visibility),
});
export type CombatantCreate = typeof CombatantCreate.Type;

export const CombatantUpdate = Schema.Struct({
  displayName: Schema.optional(Schema.NonEmptyString),
  subtitle: Schema.optional(Schema.NullOr(Schema.String)),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  initiative: Schema.optional(initiative),
  initiativeBonus: Schema.optional(Schema.NullOr(initiativeBonus)),
  hpCurrent: Schema.optional(hp),
  hpMax: Schema.optional(hp),
  ac: Schema.optional(Schema.NullOr(ac)),
  conditions: Schema.optional(conditions),
  visibility: Schema.optional(Visibility),
});
export type CombatantUpdate = typeof CombatantUpdate.Type;

/**
 * Apply damage or healing — the runner's `minus` button
 * (`EncounterRunner.jsx:41`, `:103-110`).
 *
 * A delta rather than a new absolute value, and its own endpoint rather than a
 * `PATCH { hpCurrent }`, for two reasons. It is the mutation that actually
 * happens every few seconds, so it is the one that has to be safe to repeat —
 * hence `requestId`. And a delta is what the DM means: "the ogre hits for 12"
 * is true regardless of what anyone's screen last showed, whereas an absolute
 * write from a stale screen silently undoes whatever happened in between.
 *
 * The result is clamped into `[0, hpMax]`, matching `Math.max(0, c.hp - 5)`.
 */
export const CombatantDamage = Schema.Struct({
  /** Positive damages, negative heals. Zero is legal and does nothing. */
  amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 })),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128))),
});
export type CombatantDamage = typeof CombatantDamage.Type;

/**
 * Put a token on a square, move it, or take it off the board (`position:
 * null`) — the board's one write.
 *
 * Its own endpoint rather than a field on `CombatantUpdate`, for the reason
 * `CombatantDamage` is: it is the write that happens over and over while the
 * fight runs, so it is the one that carries a `requestId`, and the square is
 * checked against the fight's own board, which a general patch has no reason
 * to read. A square off that board, or any square on a fight with no board, is
 * a `Conflict`.
 */
export const CombatantMove = Schema.Struct({
  position: Schema.NullOr(CombatantPosition),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128))),
});
export type CombatantMove = typeof CombatantMove.Type;

/**
 * One line of the DM's initiative write: this combatant's number, or `null` to
 * clear one typed in error.
 */
export const InitiativeEntry = Schema.Struct({
  combatantId: CombatantId,
  initiative: Schema.NullOr(initiative),
});
export type InitiativeEntry = typeof InitiativeEntry.Type;

/**
 * The DM's initiative numbers, several at once: *Roll for monsters*, or the
 * totals the table called out. One transaction and one log line, so a roll for
 * seven goblins is one write that lands whole or not at all, and a repeat of
 * one already applied (`requestId`) changes nothing.
 */
export const InitiativeSet = Schema.Struct({
  entries: Schema.Array(InitiativeEntry).check(Schema.isLengthBetween(1, 200)),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128))),
});
export type InitiativeSet = typeof InitiativeSet.Type;

/**
 * A player's own initiative, from their Table, during the initiative phase.
 *
 * The combatant is in the path and must be the row of a character seated in
 * one of the asker's own seats; the server refuses anything else as not
 * found. See `PlayerTable.setInitiative` for when it is refused as a
 * conflict instead.
 */
export const PlayerInitiative = Schema.Struct({ initiative });
export type PlayerInitiative = typeof PlayerInitiative.Type;
