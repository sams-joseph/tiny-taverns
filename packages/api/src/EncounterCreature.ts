import { Schema } from "effect";
import { CombatantSide } from "./Combatant.js";
import { CreatureId, EncounterCreatureId, EncounterId, NpcId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/** How many of one creature a roster line holds. */
export const EncounterCreatureCount = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 999 }),
);

/**
 * A line on an encounter's roster: this creature, this many times.
 *
 * This is where the fixture's `count: 6` comes from (`data.js:10`). The
 * encounter card's "6 creatures" is `sum(count)` over these rows — see
 * `Encounter.creatureCount` — which is why the roster had to exist before that
 * number could be anything but a lie.
 *
 * It is a roster line and not six creatures. The six goblins with separate hit
 * points arrive when the encounter is *run* (`data.js:18-19` — two `Goblin
 * Archer` combatants, one at 4 hp and one at 0). Those are instances of this
 * template, in a table this step does not build.
 *
 * One row per (encounter, creature): "Goblin Archer ×4" is a count, not four
 * rows, and a second row for the same creature would make `sum(count)` depend
 * on how the DM happened to add them. A repeat is a `Conflict`, not a silent
 * merge — merging would turn a mis-click into a doubled roster with nothing
 * said.
 */
export class EncounterCreature extends Schema.Class<EncounterCreature>("EncounterCreature")({
  id: EncounterCreatureId,
  encounterId: EncounterId,
  /**
   * Points at a creature row: one of the campaign's own internal instances, or
   * one from the global `system` corpus.
   *
   * **A campaign instance is plumbing, not a collection** (captain's decision,
   * 2026-09-02): a Library or group-shared creature put on a roster is
   * instanced into the campaign behind the scenes by `encounterCreatures.create`,
   * so the id here may name a row no list ever returns. That is why `name`
   * rides on the row — a client draws the roster without dereferencing ids.
   *
   * Unlike `note.encounter_id`, this cannot be a composite foreign key: half
   * the rows it may legally point at are global and have no campaign to name.
   * The containment is enforced in the repository instead, against the same
   * read predicate every other creature read uses.
   */
  creatureId: CreatureId,
  /**
   * The creature row's display name, resolved server-side at read time. The
   * roster is drawn from its own rows rather than by joining a corpus list in
   * the client — the corpus list no longer contains campaign instances.
   */
  name: Schema.String,
  /**
   * The member of the Cast this line puts in the fight as itself, fighting as
   * `creatureId`'s stat block ("Sildar, as a Veteran"), with its name and
   * whether it is archived, joined server-side as `name` is; `null` for a
   * line of creatures. Its count is always one.
   */
  npc: Schema.NullOr(Schema.Struct({ id: NpcId, name: Schema.String, archived: Schema.Boolean })),
  count: Schema.Int,
  /**
   * The creature's own numbers, read through the same join as `name`, so the
   * roster table draws *Creature / Qty / CR / AC / HP / XP* without a read per
   * creature. `cr`, `ac` and `hp` are columns every creature has.
   */
  cr: Schema.String,
  ac: Schema.Int,
  hp: Schema.Int,
  /**
   * XP for **one** of it: the stat block's own figure, else the XP table's for
   * its `cr` (`creatureXp`), else `null` — a homebrew rating the table does not
   * know has no XP, and the encounter's difficulty says `missing-xp` rather
   * than guess one.
   */
  xp: Schema.NullOr(Schema.Int),
  /** Which side its combatants start the fight on (`Combatant.side`); `foes` unless the DM said. */
  side: CombatantSide,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const EncounterCreatureCreate = Schema.Struct({
  /** For a Cast member's line, the stat block it fights as. */
  creatureId: CreatureId,
  /**
   * A member of this campaign's Cast, put in the fight as itself. Its line is
   * one creature, so a count other than one is refused.
   */
  npcId: Schema.optional(NpcId),
  /** Omit and the column default — one — decides. */
  count: Schema.optional(EncounterCreatureCount),
  /** Omit and the column default — `foes` — decides. */
  side: Schema.optional(CombatantSide),
  visibility: Schema.optional(Visibility),
}).check(
  Schema.makeFilter((line: { readonly npcId?: NpcId; readonly count?: number }) =>
    line.npcId === undefined || line.count === undefined || line.count === 1
      ? undefined
      : "a member of the Cast is one creature",
  ),
);
export type EncounterCreatureCreate = typeof EncounterCreatureCreate.Type;

/**
 * The creature is not patchable. Swapping which creature a roster line points
 * at is deleting the line and adding another; allowing it here would mean an
 * edit that silently changes what the encounter contains while keeping the id
 * a client is holding.
 */
export const EncounterCreatureUpdate = Schema.Struct({
  count: Schema.optional(EncounterCreatureCount),
  side: Schema.optional(CombatantSide),
  visibility: Schema.optional(Visibility),
});
export type EncounterCreatureUpdate = typeof EncounterCreatureUpdate.Type;
