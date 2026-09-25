import { Schema } from "effect";
import { EncounterKind, EncounterPlayed } from "./Encounter.js";
import { CampaignId, EncounterId } from "./Ids.js";

/**
 * One line of an encounter's roster, as a player is told it: what it is and how
 * many. **There is no field for a challenge rating, an armour class, hit
 * points or XP**, for the reason `PlayerMonsterCombatant` has none: which
 * numbers the party has learned is the DM's to decide at the table, and a
 * schema that can carry them is a schema that will.
 */
export const PlayerEncounterCreature = Schema.Struct({
  name: Schema.String,
  count: Schema.Int,
});
export type PlayerEncounterCreature = typeof PlayerEncounterCreature.Type;

/**
 * A shared encounter, told to somebody sitting at the table — Shared and
 * Ready: a draft reaches no player, whatever its Share switch says.
 *
 * **A distinct type on a distinct path, not a filtered `Encounter`** — the
 * `PlayerSessionRecap` decision, for the same reason. `Encounter` carries the
 * computed difficulty (the band, the XP, the multiplier and the party's
 * thresholds) and `EncounterCreature` each creature's numbers; both are the
 * creator's alone, behind the creator proof, and this cannot spell either.
 *
 * **No difficulty at all, not even the band** (captain's decision,
 * 2026-09-25: players see creature names and counts, and no numbers). A band
 * rated over the lines a player can see calls a fight with a hidden hag
 * "Easy"; one rated over the whole roster says the hag is there. Neither is an
 * answer this projection can give honestly.
 *
 * `creatures` are the roster lines the DM shared, oldest first; a line kept
 * `dm` is not here and is not counted. `lastPlayed` is over the fights this
 * reader can see, as on `Encounter`.
 */
export class PlayerEncounter extends Schema.Class<PlayerEncounter>("PlayerEncounter")({
  id: EncounterId,
  campaignId: CampaignId,
  name: Schema.String,
  kind: EncounterKind,
  tags: Schema.Array(Schema.String),
  creatures: Schema.Array(PlayerEncounterCreature),
  lastPlayed: Schema.NullOr(EncounterPlayed),
}) {}
