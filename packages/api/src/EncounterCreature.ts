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
