import { Schema } from "effect";
import { CampaignId, CharacterId, CombatantId, EncounterRunId, SessionId } from "./Ids.js";

/**
 * What is happening at a table **right now**, told to somebody sitting at it.
 *
 * This is the read behind the live banner on the player's character sheet —
 * *"The Salt Road is playing right now · session 12 · round 3 · Brannoc is
 * up"* — and the *Go to the table* action beside it. Until it existed both
 * were drawn and neither had anything behind them.
 *
 * ### A distinct type on a distinct endpoint, and never a filtered DM one
 *
 * The captain's decision of 2026-08-12, which `PlayerRecap.ts` is the first
 * instance of and this is the second: a leak has to be something somebody
 * *writes*, not something a forgotten flag causes. So there is no field here
 * for an exact hit-point total, a hit-point band, an armour class, a
 * condition, an initiative number, or the rest of the initiative order — and
 * adding one would be a visible edit to a schema whose whole job is to refuse
 * them, not a line in a handler.
 *
 * ### What is in it, and why each part is safe to say
 *
 * The test applied to every field was the brief's: **a player must not learn
 * from this anything they could not learn sitting at the table.**
 *
 * - *that the table is playing, and which night it is* — the DM opened the
 *   session, and the people at the table are the ones it was opened for;
 * - *the round* — read out loud every time it turns over;
 * - *whose turn it is, by the name the DM is saying* — likewise, and it is the
 *   single most useful thing a player away from the screen wants to know;
 * - *which of this account's own characters are in the fight* — its own rows,
 *   compared to its own account and to nothing a caller supplied.
 *
 * Everything else was left out, and the two that were closest calls are worth
 * naming because leaving them out was a choice rather than an oversight:
 *
 * - **the encounter's name.** `PlayerRecapFight.run` carries it for a night
 *   that is over, where the party has already lived through it. A fight *on
 *   the table* is different: *"Ambush in the reeds"* is a thing the DM may not
 *   have said yet, and the banner does not ask for it. Left out.
 * - **the whole initiative order.** That is the player fight view's decision to
 *   take deliberately, and a banner is not the place to settle it by accident.
 *   `PlayerRecap.ts` refused the same temptation from the other side.
 *
 * ### Every part of it is still gated by `repo/visibility.ts`, unchanged
 *
 * Narrowing here is of *fields*. Which rows exist at all is the shipped seam
 * and nothing in this file relaxes it, which has three visible consequences and
 * they are the fail-closed ones:
 *
 * - a session the DM has not shared answers **nothing** — no banner, exactly as
 *   the player Chronicle shows no night until one is shared;
 * - a fight whose `Share` switch is off answers a session and no `fight`;
 * - a combatant hidden from players is not `upNext` and is not a `seat`, so the
 *   banner says the round and stops rather than naming a row the DM hid.
 */

/**
 * Whose turn it is.
 *
 * The name and the id, and nothing else — no initiative number, no hit points,
 * no band. `combatantId` is here so a client can ask *"is that mine"* by
 * comparing it against a `seat` below, which is a comparison between two things
 * the response already contains rather than a fact this schema has to state.
 */
export const PlayerLiveTurn = Schema.Struct({
  combatantId: CombatantId,
  /** The snapshot name the DM is reading out — `"Brannoc"`, `"Marsh Hag"`. */
  displayName: Schema.String,
});
export type PlayerLiveTurn = typeof PlayerLiveTurn.Type;

/**
 * One of **this account's own** characters, as it sits in the fight.
 *
 * The join key between the sheet a player is looking at and the initiative
 * order they are in, and the whole of what the banner needs to tell its two
 * remaining states apart: *your character is in this fight* and *your character
 * is not*.
 *
 * It discloses nothing, and that is a property of the query rather than of the
 * shape: `repo/PlayerTable.ts` selects these through `ownRowReadable`, so every
 * `characterId` here is one the caller already owns and could read in full at
 * `GET /me/characters`. There is no request shape that asks for somebody
 * else's.
 */
export const PlayerLiveSeat = Schema.Struct({
  characterId: CharacterId,
  combatantId: CombatantId,
});
export type PlayerLiveSeat = typeof PlayerLiveSeat.Type;

/**
 * The fight on the table, to a player.
 *
 * Present only while a run of this night is live *and* the DM has shared it —
 * a session running in a tavern with nothing on the table is the ordinary state
 * of an evening (see `Session`), so `null` here is not an absence of
 * information.
 */
export const PlayerLiveFight = Schema.Struct({
  /**
   * The run's own id.
   *
   * Carried because a fight the player is being told about is a row, and every
   * other schema in the product names the row it is about — it is what makes
   * *"this is still the same fight"* answerable across two reads. It is an id
   * for a row this actor may read; it discloses nothing on its own, and nothing
   * is read *through* it that the predicate would not gate again.
   */
  id: EncounterRunId,
  round: Schema.Int,
  /** `null` when the DM has set no marker, or has hidden the row it names. */
  upNext: Schema.NullOr(PlayerLiveTurn),
  /** This account's own characters in this fight. Usually one, often none. */
  seats: Schema.Array(PlayerLiveSeat),
});
export type PlayerLiveFight = typeof PlayerLiveFight.Type;

/**
 * The night this table is on, and the fight on it — or nothing.
 *
 * `null` from the endpoint is the **common** answer and is not an error: most
 * of the time nobody is playing. It is also what a player gets while the DM
 * keeps the night to themselves, which is the master toggle working rather than
 * a gap.
 *
 * The campaign's *name* is deliberately not here. `campaignId` is the join key
 * and `GET /me/campaigns` is the read that names campaigns — a name here would
 * be a second answer to what a campaign is called, the rule
 * `CampaignMember.accountId` and `GET /me/characters` already follow.
 */
export class PlayerLiveTable extends Schema.Class<PlayerLiveTable>("PlayerLiveTable")({
  campaignId: CampaignId,
  sessionId: SessionId,
  /** *"Session 12"* — the number, not the whole `Session`, which carries the DM's title. */
  sessionNumber: Schema.Int,
  fight: Schema.NullOr(PlayerLiveFight),
}) {}
