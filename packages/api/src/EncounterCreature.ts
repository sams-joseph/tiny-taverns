import { Schema } from "effect";
import { CreatureId, EncounterCreatureId, EncounterId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

const count = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 }));

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
   * Points at a creature the actor could reach in this encounter's campaign —
   * either one of the campaign's own or one from the global `system` corpus.
   *
   * Unlike `note.encounter_id`, this cannot be a composite foreign key: half
   * the rows it may legally point at are global and have no campaign to name.
   * The containment is enforced in the repository instead, against the same
   * read predicate every other creature read uses.
   */
  creatureId: CreatureId,
  count: Schema.Int,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const EncounterCreatureCreate = Schema.Struct({
  creatureId: CreatureId,
  /** Omit and the column default — one — decides. */
  count: Schema.optional(count),
  visibility: Schema.optional(Visibility),
});
export type EncounterCreatureCreate = typeof EncounterCreatureCreate.Type;

/**
 * The creature is not patchable. Swapping which creature a roster line points
 * at is deleting the line and adding another; allowing it here would mean an
 * edit that silently changes what the encounter contains while keeping the id
 * a client is holding.
 */
export const EncounterCreatureUpdate = Schema.Struct({
  count: Schema.optional(count),
  visibility: Schema.optional(Visibility),
});
export type EncounterCreatureUpdate = typeof EncounterCreatureUpdate.Type;
