import { Schema } from "effect";
import { LocationId, PartyMoveId, SessionId } from "./Ids.js";
import { provenanceFields } from "./Provenance.js";

/**
 * One move of the party, as the campaign's creator reads its travel log.
 *
 * Where the party is now is the newest move; there is no position anywhere
 * else to disagree with it. `locationId` is `null` once the place has been
 * deleted, and `locationName` is what it was called when the party went
 * there, so the record still reads. `sessionId` is the night it happened on,
 * or `null` for a move made between nights.
 */
export class PartyMove extends Schema.Class<PartyMove>("PartyMove")({
  id: PartyMoveId,
  locationId: Schema.NullOr(LocationId),
  locationName: Schema.String,
  sessionId: Schema.NullOr(SessionId),
  movedAt: Schema.DateTimeUtcFromString,
  ...provenanceFields,
}) {}

/**
 * The same move, as a player at the table is told it: no provenance, and
 * `locationId` only while the place is still revealed to their table,
 * computed in SQL — the name stays, because they were there.
 */
export class PlayerPartyMove extends Schema.Class<PlayerPartyMove>("PlayerPartyMove")({
  id: PartyMoveId,
  locationId: Schema.NullOr(LocationId),
  locationName: Schema.String,
  movedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Moving the party to a place in the campaign's world. The move reveals the
 * place to the table: the party is standing in it.
 */
export const PartyMoveCreate = Schema.Struct({ locationId: LocationId });
export type PartyMoveCreate = typeof PartyMoveCreate.Type;
