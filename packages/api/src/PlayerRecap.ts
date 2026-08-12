import { Schema } from "effect";
import { Beat } from "./Beat.js";
import { EncounterRun } from "./EncounterRun.js";
import { CombatantId, EncounterRunId } from "./Ids.js";
import { Note } from "./Note.js";
import { PrepItem } from "./PrepItem.js";
import { RecapRunLink } from "./Recap.js";
import { Session } from "./Session.js";

/**
 * How hurt something is, to somebody who is not running it.
 *
 * `healthy` above half, `bloodied` at half or below, `down` at zero — the
 * vocabulary the architecture report's §2.2(d) named, and the same three words
 * a table already says out loud. It is deliberately the *whole* answer for a
 * monster: "the hag is bloodied" is what sharing hit-point bars means, and
 * "the hag has 41 of 82" is the thing the product promises to keep to the DM.
 *
 * **Derived in SQL, in the same statement that declines to select the numbers**
 * (`repo/playerCombatant.ts`), so a monster's exact hit points are never in a
 * row this projection could forget to drop. A band computed in TypeScript from
 * a wide row would be the post-filtering pattern `repo/visibility.ts` exists to
 * prevent, one type further along.
 */
export const HpBand = Schema.Literals(["healthy", "bloodied", "down"]);
export type HpBand = typeof HpBand.Type;

const shared = {
  id: CombatantId,
  encounterRunId: EncounterRunId,
  /** `"Goblin Archer"`, `"Brannoc"` — the snapshot, exactly as the DM sees it. */
  displayName: Schema.String,
  /** `"Half-orc paladin"`, `"Small humanoid"`. */
  subtitle: Schema.NullOr(Schema.String),
  playerName: Schema.NullOr(Schema.String),
  initiative: Schema.Int,
  /**
   * Whole, and **not filtered one condition at a time.**
   *
   * The vocabulary is open (`Combatant.conditions`), so a per-condition rule
   * would be a visibility judgement made outside `repo/visibility.ts` — a
   * second seam, in TypeScript, over a `text[]` nobody can enumerate. A
   * condition the DM does not want shared belongs on a row the DM does not
   * share; that control already exists and is one predicate rather than two.
   */
  conditions: Schema.Array(Schema.String),
} as const;

/**
 * Somebody at the table, as another player sees them.
 *
 * **Exact hit points, on purpose.** A player character's current total is the
 * one number everybody at the table needs to agree on — it is read out, it
 * decides whether the cleric moves, and banding it would break the agreement
 * rather than protect anything. There is nothing to protect: the party knows
 * these numbers already.
 */
export const PlayerCharacterCombatant = Schema.Struct({
  kind: Schema.Literal("pc"),
  ...shared,
  /** Zero is a legal, common, deliberate value. It does not mean "gone". */
  hpCurrent: Schema.Int,
  hpMax: Schema.Int,
});

/**
 * Everything the DM is running, as a player sees it.
 *
 * **There is no field here for exact hit points and none for armour class**,
 * which is the whole shape of the decision: narrowing is a property of the
 * type, so disclosing a monster's numbers through this endpoint would take
 * *writing new code* rather than forgetting a flag. A nullable `ac` or an
 * `hpCurrent` that handlers were trusted to blank is the version of this that
 * leaks the first time somebody adds a read.
 *
 * Armour class is absent rather than optional for the same reason: the DM
 * decides when the party has learned that a thing is hard to hit, and a schema
 * that can carry it is a schema that will.
 */
export const PlayerMonsterCombatant = Schema.Struct({
  kind: Schema.Literal("npc"),
  ...shared,
  hpBand: HpBand,
});

/**
 * One line of the initiative order, to a player.
 *
 * Discriminated on `kind`, the shape `SearchHit` and `NoteAttachment` already
 * use — so a client branches once and gets the fields that exist for that arm,
 * and there is no arm on which both an exact number and a band are spellable.
 */
export const PlayerCombatant = Schema.Union([PlayerCharacterCombatant, PlayerMonsterCombatant]);
export type PlayerCombatant = typeof PlayerCombatant.Type;

/**
 * One fight of the night, to a player.
 *
 * `run` is the whole `EncounterRun`, unchanged, and that is a scope decision
 * rather than an oversight: the settled projection covers the combatant, and
 * nothing on a run is a number the DM was keeping — it is the fight's name, the
 * round it reached and how it ended, all of which a player who was there
 * already lived through. A run they may not see is refused by the predicate, as
 * it always was. If the player fight view later wants a narrower run, that is
 * that screen's decision to take deliberately.
 */
export const PlayerRecapFight = Schema.Struct({
  run: EncounterRun,
  combatants: Schema.Array(PlayerCombatant),
  continuedFrom: Schema.NullOr(RecapRunLink),
  continuedInto: Schema.NullOr(RecapRunLink),
});
export type PlayerRecapFight = typeof PlayerRecapFight.Type;

/**
 * What happened on the night of session N, told to somebody who played in it.
 *
 * **A distinct type on a distinct endpoint, not a filtered `SessionRecap`.**
 * That is the captain's decision of 2026-08-12 and the reason it is worth the
 * duplication: a runtime field filter over the DM's type is one forgotten flag
 * away from disclosing everything, whereas a separate response schema makes a
 * leak something somebody has to *write*. `repo/Recap.ts` assembles both from
 * one set of queries, so the two cannot drift about what a night contains —
 * only about how much of a combatant each is allowed to say.
 *
 * Every other field is the DM's, unchanged, because every other field is
 * already narrowed by `repo/visibility.ts` at the row level: a player's
 * `beats`, `notes` and `prepDone` are the `shared` ones and nothing else, and
 * that seam has been the answer since `0001`. The combatant was the one place
 * where a `shared` row still said too much.
 */
export class PlayerSessionRecap extends Schema.Class<PlayerSessionRecap>("PlayerSessionRecap")({
  session: Session,
  /** Oldest first — the order the night was played in. */
  fights: Schema.Array(PlayerRecapFight),
  /** The `shared` ones, verbatim. */
  beats: Schema.Array(Beat),
  /** The ticked lines the DM shared. */
  prepDone: Schema.Array(PrepItem),
  /** The read-alouds that were actually read out, and were shared. */
  notes: Schema.Array(Note),
}) {}
