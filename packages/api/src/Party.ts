import { Schema } from "effect";
import { Character } from "./Character.js";
import { AccountId, CampaignCharacterId, CampaignId, CharacterId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * The party: the characters seated at one campaign's table.
 *
 * Under the continuity decision of 2026-09-01 a campaign's party is a set of
 * **joins to shared, account-owned characters**, never a fork of their state.
 * The seat is what a campaign owns about a character: when it joined and left,
 * what the table calls it (display snapshots that survive later renames and
 * even the character's deletion — the roster line is campaign history), and
 * the campaign-scoped `visibility` that says who at this table may see it.
 *
 * ### Who does what, structurally
 *
 * - **The owner seats their own character** (`POST …/party { characterId }`) —
 *   the schema proves ownership with a composite key, so a creator cannot take
 *   somebody else's character; consent is which endpoint exists.
 * - **The creator manages the table**: seat visibility, retiring any seat, and
 *   the damage delta. An owner may retire their own seat too — leaving a table
 *   is theirs.
 * - **Nobody writes another account's character through a seat.** Damage is
 *   the one write that reaches the shared row from the campaign side, and it
 *   is the same delta-with-one-clamp the fight has always made.
 */
export class CampaignCharacter extends Schema.Class<CampaignCharacter>("CampaignCharacter")({
  id: CampaignCharacterId,
  campaignId: CampaignId,
  /**
   * The character this seat holds — `null` once the character itself has been
   * deleted, with the display snapshot below still standing: losing the
   * character must not rewrite the campaign's history of who sat here.
   */
  characterId: Schema.NullOr(CharacterId),
  /** Whose seat it is — the character's owner at join time, and the join key. */
  accountId: AccountId,
  /**
   * What the table calls them — snapshotted from the character's name at join
   * time, so the roster and every later record survive renames. The shared
   * sheet's own name is on the character; this is the campaign's word.
   */
  displayName: Schema.String,
  playerDisplayName: Schema.NullOr(Schema.String),
  /**
   * Who at this table may see the seat and the shared character behind it —
   * the campaign-scoped half of the old `character.visibility`, now on the row
   * that belongs to the campaign. `dm` by default: a new seat fails closed.
   */
  visibility: Visibility,
  ...provenanceFields,
  joinedAt: Schema.DateTimeUtcFromString,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * One line of the roster: the seat, and the shared character it holds.
 *
 * `character` is `null` exactly when the character has been deleted — the seat
 * keeps saying who sat here. It is the whole `Character`, live state included:
 * a `shared` seat means the table may see the character, which is what sharing
 * a character at a table has always meant.
 */
export class PartySeat extends Schema.Class<PartySeat>("PartySeat")({
  seat: CampaignCharacter,
  character: Schema.NullOr(Character),
}) {}

/**
 * The owner seating their own character — the only way a character enters a
 * party. `characterId` is checked against the caller's own characters; there
 * is no field for anybody else's, so a creator seating another account's
 * character is not a refused request, it is not expressible.
 */
export const PartyJoin = Schema.Struct({
  characterId: CharacterId,
});
export type PartyJoin = typeof PartyJoin.Type;

/** The creator's seat PATCH: the campaign-scoped facts, and only those. */
export const PartySeatUpdate = Schema.Struct({
  visibility: Schema.optional(Visibility),
  playerDisplayName: Schema.optional(Schema.NullOr(Schema.String)),
  /** Temporary hit points are live character state, but they have no combatant copy. */
  tempHp: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
  /**
   * The live condition set, written through to the shared character and to
   * every live combatant in *this* campaign — the out-of-fight condition edit
   * the old DM character PATCH carried, now on the row the campaign owns.
   */
  conditions: Schema.optional(
    Schema.Array(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40))).check(
      Schema.isLengthBetween(0, 24),
    ),
  ),
});
export type PartySeatUpdate = typeof PartySeatUpdate.Type;

/** Where one of this account's characters is seated — `GET /me/characters`' join keys. */
export class CharacterSeatRef extends Schema.Class<CharacterSeatRef>("CharacterSeatRef")({
  campaignCharacterId: CampaignCharacterId,
  campaignId: CampaignId,
  joinedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A character of your own, with everywhere it is seated — the roster's row.
 * The campaign *names* still come from `GET /me/campaigns`; these are the join
 * keys, the rule `CampaignMember.accountId` follows from the other side.
 */
export class OwnedCharacter extends Schema.Class<OwnedCharacter>("OwnedCharacter")({
  character: Character,
  seats: Schema.Array(CharacterSeatRef),
}) {}
