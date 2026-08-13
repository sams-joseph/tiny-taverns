import { Schema } from "effect";
import { Ability, Trait } from "./Creature.js";
import { AccountId, CampaignId, CharacterId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * A player character, shaped the way a creature is: **a field earns a column
 * when the product reads it, and everything else goes in one document.**
 *
 * That rule is `creature`'s verbatim (`Creature.ts`) and it is what keeps
 * Taverns off the hook for the rules. Holding a character does not make this a
 * character builder — the whole of a builder is a different product, and the
 * first thing it owes anyone is errata. So the columns are the handful of
 * things a screen sorts, filters, seeds or indexes on, and the sheet itself is
 * one `jsonb` document that nothing queries into except full text.
 */

/**
 * The document half: whatever the player pasted or the DM typed.
 *
 * `Ability` and `Trait` are the bestiary's own shapes rather than a second pair
 * that means the same thing. A stat block's ability cell and a character
 * sheet's are one question — a label, a score, and the modifier the eye goes to
 * — and a named block of prose is a monster's trait, a character's feature, a
 * spell and a piece of equipment. Two shapes here would be two renderers, and
 * `apps/web/src/bestiary/StatBlock.tsx` already draws these.
 *
 * Nothing narrower is defined, because nobody has drawn a character page: the
 * delivered kit has a party *row* and no sheet. Modelling saves, skills and
 * spell slots as fields would be inventing that page in a schema, and it is the
 * document precisely so that it can hold what a real table keeps without a
 * migration each time.
 */
export const CharacterSheet = Schema.Struct({
  /**
   * Free prose about them — background, appearance, what they are afraid of.
   *
   * This is also where a descriptor written before `species` and `class_name`
   * were columns landed: `0012_character_sheet.ts` moved it here verbatim
   * rather than guessing at its parts.
   */
  notes: Schema.String,
  /** `STR 10 (+0)` — the same cell a stat block has. */
  abilities: Schema.Array(Ability),
  /** Named blocks: features, spells known, equipment. */
  traits: Schema.Array(Trait),
});
export type CharacterSheet = typeof CharacterSheet.Type;

/**
 * What a character created with no sheet gets — the same value the migration
 * states as the column default, so a client can render an empty sheet without a
 * special case.
 */
export const emptyCharacterSheet: CharacterSheet = { notes: "", abilities: [], traits: [] };

export class Character extends Schema.Class<Character>("Character")({
  id: CharacterId,
  campaignId: CampaignId,
  /**
   * Whose character it is — **the one pointer in the product that is read
   * through.**
   *
   * Null until a DM assigns the character to somebody at their table
   * (`CharacterAssign` below). Once set it is not merely provenance, unlike
   * `Combatant.characterId` and `Creature.derivedFrom`: a predicate names it,
   * and naming it is what lets the player whose character this is read their
   * own row whatever its `visibility` says.
   *
   * What that grants is deliberately small. It is *their own row and no one
   * else's*, inside a campaign they hold a live membership of, through a
   * credential that reaches that campaign, and only while the DM has shared the
   * campaign at all — the master toggle is untouched. It grants no write:
   * editing your own sheet is its own decision with its own predicate. See
   * `apps/server/src/repo/visibility.ts`'s `ownedRowReadable`.
   */
  accountId: Schema.NullOr(AccountId),
  name: Schema.String,
  playerName: Schema.NullOr(Schema.String),
  /** `3`. Absent until somebody says. */
  level: Schema.NullOr(Schema.Int),
  /** `"Half-orc"` — an open vocabulary, like a creature's `size`. */
  species: Schema.NullOr(Schema.String),
  /** `"Paladin"` — likewise open, and rendered as the DM capitalised it. */
  className: Schema.NullOr(Schema.String),
  /**
   * The `"Level 3 Half-orc Paladin"` half-line under the name — **derived, and
   * not writable.**
   *
   * It used to be a column the DM typed. Once `level`, `species` and
   * `className` became columns it had to become one or the other: a label
   * stored beside the three fields it summarises is a second answer, and the
   * two disagree the first time anyone edits one of them. So it is a Postgres
   * generated column (`0012_character_sheet.ts`), which is why it appears here
   * and in neither payload below — sending one is refused by this schema before
   * it reaches the network, which is the honest signal.
   */
  descriptor: Schema.NullOr(Schema.String),
  ac: Schema.NullOr(Schema.Int),
  hpMax: Schema.NullOr(Schema.Int),
  /**
   * What they are on, right now — **the live half, and the authoritative copy
   * of a hit point.**
   *
   * A character used to be prep data that went stale the moment a fight
   * started: `hpMax` and nothing else, with `combatant.hpCurrent` the only
   * current number in the product. It is live state now, in the same territory
   * as `EncounterRun` and `Combatant`, because the point of the feature is that
   * a player watches their character change during play.
   *
   * **The character owns this number and the combatant holds the fight's copy
   * of it; one transaction writes both.** Neither is derived from the other and
   * neither may be read through the other — `apps/server/src/repo/vitals.ts` is
   * the one place both are written, and it is written in SQL so the clamp is
   * atomic with the read.
   *
   * Null means *nobody has said*, which is not the same as full and not the
   * same as zero. A character nobody has damaged has never needed a current
   * number, and inventing one would be claiming the party walked in unhurt.
   * Every reader treats null as `hpMax` — that is what starting a fight seeds
   * from, and what a delta counts down from.
   */
  hpCurrent: Schema.NullOr(Schema.Int),
  /**
   * Temporary hit points, which sit on top and are not part of `hpCurrent`.
   *
   * Zero rather than null, because "no temporary hit points" is the ordinary
   * state of every character and an absent value would read as unknown. There
   * is deliberately **no** copy of this on `Combatant`: a fight's copy exists
   * for the two numbers the initiative row draws, and a second column that
   * nothing renders is a second answer waiting to disagree with this one.
   */
  tempHp: Schema.Int,
  /**
   * `"Poisoned"`, `"Concentrating"` — the same open vocabulary a combatant's
   * conditions are, and the same `text[]`.
   *
   * The words are the DM's; nothing branches on them. This is the second value
   * a live fight and a character both hold, so it travels through the same
   * write-through `hpCurrent` does.
   */
  conditions: Schema.Array(Schema.String),
  /**
   * Where the real sheet lives, for the table that keeps theirs somewhere else.
   *
   * One column, and it works for the player whose character is on graph paper
   * as well as for the one with a D&D Beyond tab open. `http`/`https` only —
   * this is rendered as a link, and a `javascript:` URL in an `href` is the one
   * way a text column becomes an exploit.
   */
  sheetUrl: Schema.NullOr(Schema.String),
  sheet: CharacterSheet,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const ac = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));
const hp = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));
/** Bounded the way the column is: generously, to refuse a typo rather than epic play. */
const level = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const shortLabel = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));
const sheetUrl = Schema.String.check(
  Schema.isLengthBetween(1, 2000),
  Schema.isPattern(/^https?:\/\//i),
);
/** The bestiary's own bound, so a condition badge is one word and not an essay. */
const Condition = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));
const conditions = Schema.Array(Condition).check(Schema.isLengthBetween(0, 24));

export const CharacterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  playerName: Schema.optional(Schema.String),
  level: Schema.optional(level),
  species: Schema.optional(shortLabel),
  className: Schema.optional(shortLabel),
  ac: Schema.optional(ac),
  hpMax: Schema.optional(hp),
  /**
   * Where they are already, for the character typed up mid-campaign.
   *
   * This is the **only** payload in the product that sets a current hit point
   * absolutely, and it is safe here for a reason that does not survive the
   * insert: a row that does not exist yet is in no fight, so there is no second
   * copy for it to disagree with. Afterwards the number moves by delta only —
   * `CharacterDamage` below, or the fight — which is what makes "both copies
   * always agree" a property of two statements rather than of every caller.
   */
  hpCurrent: Schema.optional(hp),
  tempHp: Schema.optional(hp),
  conditions: Schema.optional(conditions),
  sheetUrl: Schema.optional(sheetUrl),
  /** Omit and the column default — an empty document — decides. */
  sheet: Schema.optional(CharacterSheet),
  visibility: Schema.optional(Visibility),
});
export type CharacterCreate = typeof CharacterCreate.Type;

export const CharacterUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  level: Schema.optional(Schema.NullOr(level)),
  species: Schema.optional(Schema.NullOr(shortLabel)),
  className: Schema.optional(Schema.NullOr(shortLabel)),
  ac: Schema.optional(Schema.NullOr(ac)),
  hpMax: Schema.optional(Schema.NullOr(hp)),
  /**
   * `tempHp` and `conditions` are here and **`hpCurrent` deliberately is not.**
   *
   * A hit point is the one live value two rows both hold, so it gets exactly
   * one spelling of a write: a signed delta, `CharacterDamage`. That is not
   * only bookkeeping — it is what `CombatantDamage` already argues for the
   * fight's copy. "The ogre hits for 12" is true regardless of what anyone's
   * screen last showed, whereas an absolute write from a screen that has not
   * caught up silently undoes whatever happened in between; and with two rows
   * to keep in step, the screen that has not caught up is now the common case.
   *
   * The other two are absolutes because there is no arithmetic in them: temp
   * hit points are granted whole and conditions are a set the DM edits.
   */
  tempHp: Schema.optional(hp),
  conditions: Schema.optional(conditions),
  sheetUrl: Schema.optional(Schema.NullOr(sheetUrl)),
  /** Whole-document, like `CreatureUpdate.statBlock`: send what it should become. */
  sheet: Schema.optional(CharacterSheet),
  visibility: Schema.optional(Visibility),
});
export type CharacterUpdate = typeof CharacterUpdate.Type;

/**
 * Apply damage or healing to a character, outside a fight or inside one.
 *
 * `CombatantDamage`'s shape exactly, and for its reasons — a delta rather than
 * an absolute, and its own endpoint rather than a `PATCH { hpCurrent }`,
 * because it is the mutation that repeats and therefore the one that has to be
 * safe to repeat. What is different is only where the number lands: this is the
 * trap in the corridor, the poison between rounds, the long rest, and the DM
 * reaching for the party list because the fight is over and someone is still
 * bleeding.
 *
 * When the character is in a fight that is still on the table, the delta is
 * applied to that fight's combatant and copied back — one clamp, one
 * transaction, two rows that cannot part company. See
 * `apps/server/src/repo/vitals.ts`.
 *
 * `requestId` is honoured against the session's log, which is where a repeat is
 * recorded. With no session open there is nothing to record it against and a
 * repeat applies again; that is the same boundary the doorbell has, and it is
 * stated here rather than implied.
 */
/**
 * Whose character this is — the DM saying which of the people at their table
 * plays it.
 *
 * **Its own endpoint rather than a field on `CharacterUpdate`, and that is the
 * whole shape of it.** The PATCH is where a player will one day edit their own
 * sheet, and a character's owner is precisely the field that must not travel on
 * a payload a player can send: a write that could re-point `accountId` would
 * let somebody hand their own character to somebody else, or take one. Kept
 * separate, the DM-only act stays DM-only by *which endpoint exists* rather
 * than by a field check somebody has to remember to write.
 *
 * `accountId` is not "any account". The server refuses one that does not hold a
 * live membership of this campaign, so the set of accounts a DM can name is the
 * set of people already at their table — which is also the only set they can
 * see.
 *
 * `null` unassigns, which is what a player leaving the table looks like from
 * the character's side. The character stays; it stops being anybody's.
 */
export const CharacterAssign = Schema.Struct({
  accountId: Schema.NullOr(AccountId),
});
export type CharacterAssign = typeof CharacterAssign.Type;

export const CharacterDamage = Schema.Struct({
  /** Positive damages, negative heals. Zero is legal and does nothing. */
  amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 })),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 128))),
});
export type CharacterDamage = typeof CharacterDamage.Type;
