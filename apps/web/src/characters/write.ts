import type {
  CampaignId,
  Character,
  CharacterOwnCreate,
  CharacterOwnUpdate,
  CharacterSheet,
} from "@taverns/api";
import type { TavernsClient } from "../api/client";
import { reads, type Invalidation } from "../api/keys";

/**
 * How a player writes their own character — **the one call, written once.**
 *
 * `PATCH /me/characters/:characterId` is the first write in the product a
 * non-DM may make, and until this file every write predicate in
 * `repo/visibility.ts` bottomed out in `isDm`. Three surfaces on the sheet send
 * it (the identity dialog, the backstory, the gear list) plus the death-save
 * pips, and they go through here rather than each naming the endpoint, so
 * *which* endpoint a player's edit takes is one fact rather than four.
 *
 * ### Both boundaries are somewhere else, and neither is in this file
 *
 * - **Which rows** — `ownRowWritable` on the server: yours, inside a campaign
 *   you hold a live membership of, through a credential that reaches it, while
 *   the DM has shared it.
 * - **Which columns** — `CharacterOwnUpdate`, which has no field for
 *   `hpCurrent`, `tempHp`, `conditions`, `visibility` or `accountId`. A control
 *   for one of those is not a check that would fail here; it does not compile,
 *   and if it somehow did the client's own encoder drops the key before a
 *   request leaves the browser.
 *
 * So there is nothing to guard in this module, and adding a guard would be the
 * second answer that eventually disagrees with the first.
 *
 * ### Everything this screen reads is writable, by construction
 *
 * `GET /me/characters` composes `ownRowReadable`, which is `ownedRowReadable`
 * *conjoined* with ownership — and once `account_id` is the actor's own, the
 * row-level `visibility` disjunct it relaxes is already satisfied. What is left
 * on both sides is the same pair of clauses `ownRowWritable` names. So a
 * character on this screen never needs asking whether it may be edited: it is
 * in the answer, therefore it is this account's, therefore it is writable.
 */
export const saveOwnCharacter = (
  client: TavernsClient,
  character: Character,
  payload: CharacterOwnUpdate,
) => client.me.updateCharacter({ params: { characterId: character.id }, payload });

/**
 * Writing one down for the first time — `POST /me/campaigns/:c/characters`.
 *
 * **The campaign is the one thing a player's write ever names**, and only
 * because an insert has nothing else to name it with: a PATCH asks the
 * predicate about the row's own `campaign_id`, and there is no row yet. It is a
 * claim, refused by `ensureCampaignReadable` if it is a false one, which is why
 * this function takes it as an argument rather than reaching for a "current"
 * table — inventing one would silently write a character into a table nobody
 * chose.
 *
 * There is still nothing to guard here. Whose it is comes from the credential
 * on the server, and `CharacterOwnCreate` has no field for an account, a live
 * column or a visibility — see `create.ts`'s `payloadFrom`, which is where the
 * form's values become one.
 */
export const createOwnCharacter = (
  client: TavernsClient,
  campaignId: CampaignId,
  payload: CharacterOwnCreate,
) => client.me.createCharacter({ params: { campaignId }, payload });

/**
 * What a player's write to their own sheet changes — **two reads, and the
 * second one is the interesting half.**
 *
 * `reads.myCharacters` is the obvious one: it is the read this screen is built
 * on, and the roster behind it.
 *
 * `reads.characters` is the campaign's party list — **a DM's screen, which this
 * write has never seen and cannot reach.** A level-up moves `descriptor` on the
 * party strip and the party screen; a name change moves a row on the roster the
 * DM is looking at in another tab. That is exactly the shape of write this
 * design has to be careful about, and it is answered by naming the *resource*
 * rather than the screen — nobody has to know which screens exist.
 *
 * It is one function rather than four spellings for the reason `api/keys.ts`
 * exists at all: the four surfaces that write a sheet (identity, backstory,
 * gear, a death save) all change the same two things, and four copies of a list
 * is four chances for one of them to fall behind.
 */
export const characterWritesAt = (campaignId: CampaignId): Invalidation => [
  reads.myCharacters,
  reads.characters(campaignId),
];

/**
 * The same two reads, from a row that already exists.
 *
 * A create knows only where it is going and an edit knows which row it moved,
 * so the two spell the campaign differently and name the same list — one
 * function under both, because two copies of a key list is two chances for one
 * of them to fall behind.
 */
export const ownCharacterWrites = (character: Character): Invalidation =>
  characterWritesAt(character.campaignId);

/**
 * The whole document, with one part replaced.
 *
 * **`sheet` is a whole-document write and it races**, exactly as
 * `CharacterUpdate.sheet` does for the DM — `Character.ts` says so at
 * `SpellSlot` and this is the client half of the same statement. Two edits from
 * two tabs (or a player and their DM at once) do not merge: the second save
 * carries the document the second editor loaded, and the first edit is gone.
 * The fix, when two people editing one sheet becomes common, is a patch grain
 * or an `updatedAt` precondition — not a merge invented here, which would be a
 * third answer to what the sheet says.
 *
 * What this *does* prevent is the smaller and much likelier loss: a form that
 * sent only the keys it drew would erase every ability, skill, spell and
 * feature it was never shown. `CharacterDialog` and `CreatureForm` both carry
 * the untouched half through for the same reason.
 */
export const sheetWith = (character: Character, part: Partial<CharacterSheet>): CharacterSheet => ({
  ...character.sheet,
  ...part,
});
