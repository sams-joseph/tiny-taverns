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
   * Whose character it is, once they have an account.
   *
   * Null today for every row: nothing mints a player credential yet, and this
   * is the hook the invite will use. **Nothing is read *through* it** — no
   * predicate mentions it — so it is provenance and a filter, the same rule as
   * `Combatant.characterId` and `Creature.derivedFrom`.
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

export const CharacterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  playerName: Schema.optional(Schema.String),
  level: Schema.optional(level),
  species: Schema.optional(shortLabel),
  className: Schema.optional(shortLabel),
  ac: Schema.optional(ac),
  hpMax: Schema.optional(hp),
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
  sheetUrl: Schema.optional(Schema.NullOr(sheetUrl)),
  /** Whole-document, like `CreatureUpdate.statBlock`: send what it should become. */
  sheet: Schema.optional(CharacterSheet),
  visibility: Schema.optional(Visibility),
});
export type CharacterUpdate = typeof CharacterUpdate.Type;
