import { Schema } from "effect";
import { CampaignId, EncounterId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * The encounter's difficulty band, which is **not** a creature's challenge
 * rating.
 *
 * The fixtures call the field `cr` (`data.js:10-12`) and then fill it with
 * `"Easy" | "Medium" | "Deadly"` and branch on those strings
 * (`CampaignHome.jsx:13`). Those are the DMG encounter-difficulty bands, so the
 * field is named for what it holds. `"Hard"` completes the band and is the one
 * value the three fixture rows happen not to use.
 *
 * Capitalised, unlike `visibility` or `kind`, because this vocabulary is the
 * DM's own and is rendered verbatim on the encounter card's badge. Lower-casing
 * it would mean a display map existing only to undo the change.
 */
export const Difficulty = Schema.Literals(["Easy", "Medium", "Hard", "Deadly"]);
export type Difficulty = typeof Difficulty.Type;

/**
 * A tag on an encounter — `"Marsh"`, `"Night"`, `"Boss"` (`data.js:10-12`).
 *
 * An open vocabulary in a `text[]`, not a join table: the fixtures show at most
 * two per encounter, and a join table would buy referential integrity over a
 * list the DM invents as they go, at the cost of a join on the card grid that
 * `CampaignHome` renders first.
 */
const Tag = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));

/**
 * The authored encounter — a reusable template, never mutated by running it.
 *
 * Two fields the fixture's encounter card shows are deliberately absent, and
 * neither is an oversight:
 *
 * - **`count`** (`data.js:10`, rendered as "6 creatures") is
 *   `sum(encounter_creature.count)`. `encounter_creature` and the bestiary are
 *   the next step; until they exist there is no honest number to send, and a
 *   field that is structurally always `0` is worse than an absent one.
 * - **`active`** (`data.js:10`, "On the table now") is not a column here at all.
 *   Exactly one encounter is live, so it is a pointer on the session — the
 *   active `encounter_run` — and a boolean per encounter would let two rows both
 *   claim the table. It arrives with the live-session step.
 */
export class Encounter extends Schema.Class<Encounter>("Encounter")({
  id: EncounterId,
  campaignId: CampaignId,
  name: Schema.String,
  /** Null until the DM has rated it; a sketched encounter has no band yet. */
  difficulty: Schema.NullOr(Difficulty),
  tags: Schema.Array(Schema.String),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const tags = Schema.Array(Tag).check(Schema.isLengthBetween(0, 16));

export const EncounterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  difficulty: Schema.optional(Difficulty),
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
});
export type EncounterCreate = typeof EncounterCreate.Type;

export const EncounterUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  difficulty: Schema.optional(Schema.NullOr(Difficulty)),
  tags: Schema.optional(tags),
  visibility: Schema.optional(Visibility),
});
export type EncounterUpdate = typeof EncounterUpdate.Type;
