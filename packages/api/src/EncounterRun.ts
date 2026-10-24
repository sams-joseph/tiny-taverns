import { Schema, Struct } from "effect";
import { EncounterKind } from "./EncounterKind.js";
import {
  CombatantId,
  EncounterId,
  EncounterRunId,
  HobAutopilotDriverId,
  LevelVisitId,
  SessionId,
} from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * Why a fight is off the table.
 *
 * `resolved` — the DM ended it, deliberately. `carried` — the night finished
 * while it was still running, so it is waiting for the next one. A closed
 * vocabulary because the recap branches on it: "Ambush in the reeds — paused at
 * round 4" and "Resumed: Ambush in the reeds, from round 4" are only
 * expressible because this is a value and not a guess.
 */
export const EncounterRunEndedReason = Schema.Literals(["resolved", "carried"]);
export type EncounterRunEndedReason = typeof EncounterRunEndedReason.Type;

/**
 * Where a fight is: still collecting initiative, or taking turns.
 *
 * `initiative` — the numbers are arriving (the DM rolls for the monsters and
 * types what the table calls out; a player may enter their own). Nobody is up
 * and *Next turn* is refused. `turns` — *Start round 1* happened, the marker
 * is on somebody, and the order is being played through.
 *
 * A fight starts in `initiative`; `begin` moves it to `turns` once every
 * combatant has a number, and `reroll` moves it back, keeping every number so
 * the DM changes only what changed. A fight that was running before phases
 * existed is `turns`.
 */
export const EncounterRunPhase = Schema.Literals(["initiative", "turns"]);
export type EncounterRunPhase = typeof EncounterRunPhase.Type;

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
   *
   * Also `null` to a player who may not read that encounter (Shared and Ready),
   * who is told the fight and not which encounter it was.
   */
  encounterId: Schema.NullOr(EncounterId),
  /**
   * The template's name, snapshotted when the run started.
   *
   * Denormalised on purpose, and it is not the "second answer" antipattern:
   * it answers a different question. `encounter.name` is what the template is
   * called *now*; this is what the fight was called *that night*. Renaming a
   * template must not rewrite history, and deleting one must not blank it.
   *
   * A player who may not read the encounter — not Shared, not Ready, or since
   * deleted — is told "A fight" instead: sharing a fight shares the fight, not
   * the name of an encounter the DM kept to themselves.
   */
  encounterName: Schema.String,
  /**
   * How this run is played: its encounter's kind, snapshotted when it started,
   * so changing the template's kind never changes a scene already on the table.
   * A fight takes turns in initiative; a conversation, a skill challenge and a
   * hazard log checks and saves instead (`EncounterRunScene`). A conversation
   * that turns ugly becomes a fight (`escalate`), and only that way.
   *
   * Not the DM's secret: a player who may read the encounter already reads its
   * kind, and one who may not is told the kind of scene in its neutral name.
   */
  mode: EncounterKind,
  round: Schema.Int,
  phase: EncounterRunPhase,
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
   * Why the fight came off the table — and therefore whether it is waiting to
   * be picked up again.
   *
   * Not inferable from `endedAt`, which is the whole reason it is a column:
   * without it every ended run looks resumable, and a recap would report a
   * fight the party is still standing in as concluded. It is `resolved` while
   * the fight is live too, because "still running" is not a reason and the
   * database refuses `carried` on a run with no end time.
   */
  endedReason: EncounterRunEndedReason,
  /**
   * Whether Hob may spend existing character resources directly during this live fight.
   *
   * This is deliberately a per-run switch rather than a campaign preference:
   * direct writes are only expressible while one fight is live, and the DM has to
   * turn the capability on for the fight they are watching. The default is
   * `false`, and turning it off mid-fight makes the tool disappear on the next
   * question and makes any in-flight tool call fail at write time.
   */
  allowHobDirectWrites: Schema.Boolean,
  /**
   * Hob's autopilot for this fight, and the runner tab that drives it: `null`
   * is off. While it is set, that tab takes each monster's turn on its own
   * (the recharge dice, the ask, the keep and the next turn) through the
   * endpoints a press uses; any other tab says it is driven elsewhere and
   * offers to drive there instead. Not carried by `resume`
   * (`0099_hob_autopilot.ts`), and not on a player's read
   * (`PlayerEncounterRun`).
   */
  hobAutopilotDriver: Schema.NullOr(HobAutopilotDriverId),
  /**
   * The runner's *Share map* switch: whether a player seated at the table sees
   * the fight's board (`PlayerLiveFight.board`). It narrows `visibility`
   * rather than replacing it, so the board is shown only while the fight is
   * shared as well. `false` by default: fail closed.
   */
  mapShown: Schema.Boolean,
  /**
   * The map's *Hide from players*: while on, no NPC row has a token on a
   * player's board, though its row stays in their order. A combatant's own
   * `visibility` still removes its row, token and all.
   */
  hostileTokensHidden: Schema.Boolean,
  /**
   * The fight this one continues, for a run created by `resume`.
   *
   * **Provenance, never an access path** — the same status as
   * `creature.derivedFrom`. Nothing is read *through* it, and it goes `null`
   * rather than taking this row with it if its ancestor is ever deleted. A
   * carried fight is a second row precisely so that each row belongs honestly
   * to one night; this is the only thing that says the two are one fight.
   */
  continuedFrom: Schema.NullOr(EncounterRunId),
  /**
   * The level visit this fight borrowed (`LevelVisit.ts`), or `null` for a
   * fight on its own copy of its level or on the plain grid. A fight started
   * on an encounter whose level's visit is on the table plays on the dungeon
   * as it stands, copied from the visit; ending it resolved hands doors,
   * lights, reveals, fog, what the party saw and where it stands back to the
   * visit. A carried fight's successor inherits it. `null` too once the
   * visit is reset: the fight keeps its own copy. The creator's only: not on
   * a player's read (`PlayerEncounterRun`).
   */
  levelVisitId: Schema.NullOr(LevelVisitId),
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
 * A fight, to a player who was at it (`PlayerRecapFight.run`,
 * `PlayerChronicleNight.runs`): `EncounterRun` without the DM's two Hob
 * switches, which say how the DM ran the fight rather than what happened in
 * it, and without the level visit it borrowed, which is the DM's own record.
 * The server selects it without those columns (`playerRunColumns`), so they
 * never leave Postgres for a player.
 */
export class PlayerEncounterRun extends Schema.Class<PlayerEncounterRun>("PlayerEncounterRun")(
  Struct.omit(EncounterRun.fields, ["allowHobDirectWrites", "hobAutopilotDriver", "levelVisitId"]),
) {}

/**
 * Start a fight: seed the initiative list and put it on the table.
 *
 * Seeding is the whole point of the endpoint. `combatant` rows are created from
 * the encounter's roster — `count` instances of each creature, so a roster line
 * of six goblins becomes six rows that can be damaged apart — plus one row per
 * party member. §1.4: "created when the run starts (seeded from
 * `encounter_creature` × count, plus the party)".
 *
 * On a level, which board the fight plays on is the campaign's: an encounter
 * whose level has a visit on the table borrows that visit (`levelVisitId`),
 * played on the dungeon as it stands with the party where its tokens are; one
 * whose level has a visit that is not on the table is a `Conflict` (put it on
 * the table, or reset it), since a fight on a fresh copy would fork the
 * dungeon; one whose level has no visit plays on a fresh copy of the level.
 * Either way a placed creature starts on its spot (`EncounterLevelPlacement`)
 * where it can stand there, and down its side's edge where it cannot.
 */
export const EncounterRunStart = Schema.Struct({
  encounterId: EncounterId,
  /**
   * Seed the party from `character` as well as the roster. On by default,
   * because a fight without the PCs in initiative is not a fight.
   */
  includeParty: Schema.optional(Schema.Boolean),
  /**
   * Absent means `dm`, except for a fight on a level visit: the table is
   * already looking at that dungeon, so it starts `shared` with its map shown.
   */
  visibility: Schema.optional(Visibility),
});
export type EncounterRunStart = typeof EncounterRunStart.Type;

/**
 * Pick a carried fight back up, on a new night.
 *
 * **Its own endpoint rather than a field on `EncounterRunStart`**, because a
 * resume shares none of that payload: the encounter, the visibility, the
 * roster, the round and whose turn it was all come from the predecessor, and
 * the only thing a client supplies is which fight. The precedent is
 * `POST /campaigns/:c/creatures/:id/derive` — the same operation shape, which is
 * "copy a readable row into a new context, in one request".
 *
 * The successor is a **second row**: it starts tonight, it has its own id and
 * therefore its own stable runner URL, and its own log lines are filed under
 * its own night. `continuedFrom` is the only thing that says the two are one
 * fight. See `0007_run_carryover.ts` for why that beats moving the row.
 */
export const EncounterRunResume = Schema.Struct({
  /** The carried fight to continue. Must be one this campaign can reach. */
  continuedFrom: EncounterRunId,
});
export type EncounterRunResume = typeof EncounterRunResume.Type;

export const EncounterRunUpdate = Schema.Struct({
  round: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
  /**
   * Moving the turn marker by hand — `EncounterRunner.jsx:143` `onSelect`.
   * Refused as a `Conflict` during the initiative phase, when nobody is up.
   */
  activeCombatantId: Schema.optional(Schema.NullOr(CombatantId)),
  /** The `Share` switch. */
  visibility: Schema.optional(Visibility),
  /** The per-fight direct-write switch for the DM's Hob. */
  allowHobDirectWrites: Schema.optional(Schema.Boolean),
  /**
   * Hob's autopilot: this tab's id turns it on, or takes the drive from
   * another tab; `null` turns it off. Logged `dm` whatever the fight's Share.
   */
  hobAutopilotDriver: Schema.optional(Schema.NullOr(HobAutopilotDriverId)),
  /** The *Share map* switch. */
  mapShown: Schema.optional(Schema.Boolean),
  /** The map's *Hide from players*, over every NPC token at once. */
  hostileTokensHidden: Schema.optional(Schema.Boolean),
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
const requestId = Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128)));

/**
 * Advance initiative — `EncounterRunner.jsx:112-116`, including the round
 * roll-over. A monster at zero hit points is passed over; a character at zero
 * still gets a turn, for death saves.
 */
export const NextTurn = Schema.Struct({
  requestId,
  /**
   * Who the caller saw up. When it is given and the marker is on somebody
   * else, the advance is a `Conflict` rather than a second step: two tabs, or
   * Hob's autopilot and a press, that both advanced from one creature's turn
   * would otherwise skip the next creature's.
   */
  expectedActiveCombatantId: Schema.optional(CombatantId),
});
export type NextTurn = typeof NextTurn.Type;

/**
 * *Start round 1*: leave the initiative phase and put the marker on whoever is
 * first. Refused while any combatant has no number.
 */
export const BeginTurns = Schema.Struct({ requestId });
export type BeginTurns = typeof BeginTurns.Type;

/**
 * *Reroll initiative*: go back to the initiative phase. Every number is kept
 * and so is the round; the marker comes off.
 */
export const RerollInitiative = Schema.Struct({ requestId });
export type RerollInitiative = typeof RerollInitiative.Type;
