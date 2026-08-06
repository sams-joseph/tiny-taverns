import { Schema } from "effect";
import { CombatantId, EncounterId, EncounterRunId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * One playing of an encounter — the live fight, as distinct from the authored
 * template it was started from.
 *
 * The split is the whole reason this table exists. `encounter` is reusable and
 * is never mutated by running it; damaging a goblin writes here. The fixtures
 * show exactly this shape: `data.js:9-13` is a list of templates with names,
 * bands and tags, and `data.js:14-22` is a list of instances with hit points
 * and conditions. Running the same encounter next week is a second row here,
 * not a reset of the first — §1.4's "a fight interrupted and resumed".
 */
export class EncounterRun extends Schema.Class<EncounterRun>("EncounterRun")({
  id: EncounterRunId,
  sessionId: SessionId,
  /**
   * The template this was started from, or `null` once that template has been
   * deleted.
   *
   * `on delete set null`, not cascade: the run is a record of a night that
   * happened, and deleting a reusable template a month later should not erase
   * it. `encounterName` below is what keeps the run legible afterwards.
   */
  encounterId: Schema.NullOr(EncounterId),
  /**
   * The template's name, snapshotted when the run started.
   *
   * Denormalised on purpose, and it is not the "second answer" antipattern:
   * it answers a different question. `encounter.name` is what the template is
   * called *now*; this is what the fight was called *that night*. Renaming a
   * template must not rewrite history, and deleting one must not blank it.
   */
  encounterName: Schema.String,
  round: Schema.Int,
  /**
   * Whose turn it is, as a pointer rather than an index into initiative order.
   *
   * The report sketched a `turn_index`, and the fixture's prototype does hold
   * one (`EncounterRunner.jsx:88`) — but that prototype never adds or removes a
   * combatant, and the real runner does both (`:137` "Add combatant", `:107`
   * removal is explicit) as well as rerolling initiative wholesale (`:138`).
   * Every one of those reorders the list, and an index silently comes to mean a
   * different creature; a pointer survives all three. The client renders "is up"
   * by matching this against each row's id, which is one character different
   * from what the prototype already does.
   */
  activeCombatantId: Schema.NullOr(CombatantId),
  startedAt: Schema.DateTimeUtcFromString,
  /** Null while the fight is on the table. */
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  /**
   * The runner's `Share` switch (`EncounterRunner.jsx:122`) — the master toggle
   * over the whole fight, with each combatant's own `visibility` as the
   * per-row override (`:139`, "Hide from players").
   *
   * The report called this a separate `player_view_enabled` column. It is not
   * one, because the two-level predicate this repository already has says
   * exactly the same thing: a nested row is readable only if its parent is, so
   * `run.visibility` gates every combatant under it. A second boolean meaning
   * "shared" beside a column called `visibility` is a second answer to one
   * question, and they part company the first time only one of them is written.
   *
   * It defaults to `dm`, unlike the prototype's switch, which starts on. Fail
   * closed is not negotiable here — see `AGENTS.md`.
   */
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Start a fight: seed the initiative list and put it on the table.
 *
 * Seeding is the whole point of the endpoint. `combatant` rows are created from
 * the encounter's roster — `count` instances of each creature, so a roster line
 * of six goblins becomes six rows that can be damaged apart — plus one row per
 * party member. §1.4: "created when the run starts (seeded from
 * `encounter_creature` × count, plus the party)".
 */
export const EncounterRunStart = Schema.Struct({
  encounterId: EncounterId,
  /**
   * Seed the party from `character` as well as the roster. On by default,
   * because a fight without the PCs in initiative is not a fight.
   */
  includeParty: Schema.optional(Schema.Boolean),
  visibility: Schema.optional(Visibility),
});
export type EncounterRunStart = typeof EncounterRunStart.Type;

export const EncounterRunUpdate = Schema.Struct({
  round: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
  /** Moving the turn marker by hand — `EncounterRunner.jsx:143` `onSelect`. */
  activeCombatantId: Schema.optional(Schema.NullOr(CombatantId)),
  /** The `Share` switch. */
  visibility: Schema.optional(Visibility),
});
export type EncounterRunUpdate = typeof EncounterRunUpdate.Type;

/**
 * A live mutation the client may safely repeat.
 *
 * `requestId` is client-generated and deduplicated per run. This is not
 * offline-first design — it stops a double-tapped damage button applying twice,
 * which on a touch device at a table is a matter of when rather than whether.
 * §4.3. Omitting it is legal and simply opts out.
 */
const requestId = Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128)));

/** Advance initiative — `EncounterRunner.jsx:112-116`, including the round roll-over. */
export const NextTurn = Schema.Struct({ requestId });
export type NextTurn = typeof NextTurn.Type;
