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
 * The half-line under a character's name that no column derives, plus the
 * numbers the sheet's identity card draws around it.
 *
 * `descriptor` on the row already answers *"Level 5 Half-orc Paladin"* from
 * three columns. What the kit draws beside it — *"Oath of the Open Road"*, a
 * background, an alignment, a speed, an initiative, a proficiency bonus, hit
 * dice and an experience bar — is filtered by nothing, sorted by nothing,
 * seeded by nothing and predicated on nothing, so by the rule at the top of
 * this file it is document.
 *
 * **`subclass` is the one identity field with no home and no derivation**, and
 * it is here rather than as a fifth column of the generated `descriptor`
 * expression: adding one would be a migration for a string only the header
 * draws.
 *
 * Strings where the sheet renders the value verbatim, numbers where it counts
 * with it. `xp`/`xpNext` fill a progress bar, so they are integers; `speed`,
 * `initiative` and `proficiency` are drawn as written, so they are strings and
 * `"30 ft."` and `"+3"` are both expressible. That is `Ability`'s rule, applied
 * one level out.
 */
export const SheetIdentity = Schema.Struct({
  /** `"Oath of the Open Road"` — part of the drawn tagline, derivable from nothing. */
  subclass: Schema.optional(Schema.String),
  /** `"Temple foundling"` */
  background: Schema.optional(Schema.String),
  /** `"Lawful neutral"` */
  alignment: Schema.optional(Schema.String),
  /** `"30 ft."` */
  speed: Schema.optional(Schema.String),
  /** `"+1"` — pre-signed, like `Ability.modifier`. */
  initiative: Schema.optional(Schema.String),
  /** `"+3"` */
  proficiency: Schema.optional(Schema.String),
  /** `"3/5 d10"` */
  hitDice: Schema.optional(Schema.String),
  /** Counted: the bar is `xp / xpNext`. */
  xp: Schema.optional(Schema.Int),
  xpNext: Schema.optional(Schema.Int),
});
export type SheetIdentity = typeof SheetIdentity.Type;

/** One row of the skill list — a name, the ability it keys off, and the bonus. */
export const Skill = Schema.Struct({
  /** `"Athletics"` */
  name: Schema.NonEmptyString,
  /** `"STR"` — the same label an `Ability` carries, so the two can be matched up. */
  ability: Schema.optional(Schema.String),
  /** `"+7"`, pre-signed. */
  bonus: Schema.optional(Schema.String),
  /** Drawn as a mark rather than as text, so a boolean. */
  proficient: Schema.optional(Schema.Boolean),
});
export type Skill = typeof Skill.Type;

/**
 * A row of spell slot pips — **counted, so integers.**
 *
 * `used` is a live value that moves during play, and it is deliberately in the
 * document rather than in a column. The rule a live value has to clear is
 * `0014`'s: *a value two rows both hold gets a column, and one transaction
 * writes both.* Nothing else holds this one — the DM's runner draws no spell
 * slots — so there is no second copy to keep in step and a column would have no
 * reader but the row that owns it.
 *
 * **The cost is real and is stated rather than hidden**: `CharacterUpdate.sheet`
 * is whole-document, so spending a slot is a read-modify-write of the entire
 * sheet and races a DM editing the same row. Accepted for now; the fix, when two
 * people editing one sheet becomes common, is a patch grain or an `updatedAt`
 * precondition, not a column.
 */
export const SpellSlot = Schema.Struct({
  level: Schema.Int,
  used: Schema.Int,
  total: Schema.Int,
});
export type SpellSlot = typeof SpellSlot.Type;

/** One spell on the known list. */
export const SpellKnown = Schema.Struct({
  name: Schema.NonEmptyString,
  level: Schema.optional(Schema.Int),
  /** `"Concentration · 1 min"` */
  note: Schema.optional(Schema.String),
  prepared: Schema.optional(Schema.Boolean),
});
export type SpellKnown = typeof SpellKnown.Type;

export const Spellcasting = Schema.Struct({
  /** `"CHA"` */
  ability: Schema.optional(Schema.String),
  /** `"14"` — the save DC, as written. */
  save: Schema.optional(Schema.String),
  /** `"+6"` */
  attack: Schema.optional(Schema.String),
  slots: Schema.optional(Schema.Array(SpellSlot)),
  known: Schema.optional(Schema.Array(SpellKnown)),
});
export type Spellcasting = typeof Spellcasting.Type;

/** One line of the Gear tab. */
export const InventoryItem = Schema.Struct({
  name: Schema.NonEmptyString,
  /** Counted — the sheet draws `×2`. */
  quantity: Schema.optional(Schema.Int),
  /** `"6 lb"`, `"—"`. As written, so half a pound is expressible. */
  weight: Schema.optional(Schema.String),
  /** `"From session 11"` — the badge beside the name. */
  note: Schema.optional(Schema.String),
  equipped: Schema.optional(Schema.Boolean),
});
export type InventoryItem = typeof InventoryItem.Type;

/**
 * Coin, as five counted piles.
 *
 * A fixed struct rather than an open record: the sheet draws all five in this
 * order whether or not they are held, and an open vocabulary would be a
 * currency nothing renders.
 */
export const Currency = Schema.Struct({
  pp: Schema.optional(Schema.Int),
  gp: Schema.optional(Schema.Int),
  ep: Schema.optional(Schema.Int),
  sp: Schema.optional(Schema.Int),
  cp: Schema.optional(Schema.Int),
});
export type Currency = typeof Currency.Type;

/**
 * Three up, three down — **live, and in the document by decision.**
 *
 * `CharacterSheet.jsx:126` claims a DM-side reader for this (*"Marks here show
 * on your DM's initiative row straight away"*) and there is not one: no delivery
 * of `EncounterRunner.jsx` draws a death save, and `data.js`'s `initiative` rows
 * carry none. A column whose only reader is the row that owns it is exactly what
 * the column rule excludes, so this stays document until a delivery draws it on
 * the DM's row — at which point it is two `smallint`s and a `vitals.ts`
 * write-through, which is a small and well-precedented change.
 */
export const DeathSaves = Schema.Struct({
  successes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  failures: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
});
export type DeathSaves = typeof DeathSaves.Type;

/** One entry in the Log tab. `session` is the number, not a `SessionId`. */
export const LevelUp = Schema.Struct({
  level: Schema.Int,
  session: Schema.optional(Schema.Int),
  note: Schema.optional(Schema.String),
});
export type LevelUp = typeof LevelUp.Type;

/**
 * A line the player wrote about a night, filed by session **number**.
 *
 * Not a `SessionId`: this is prose the player typed on their own sheet, and a
 * real foreign key would make a journal entry something the campaign's cascade
 * can reach. The number is what the badge draws.
 */
export const JournalEntry = Schema.Struct({
  session: Schema.optional(Schema.Int),
  text: Schema.String,
});
export type JournalEntry = typeof JournalEntry.Type;

/**
 * The four lines the Story tab draws beside the backstory.
 *
 * The backstory itself is `notes`, which has held it since `0012` — a second
 * key for the same prose would be two places to look for one paragraph.
 */
export const SheetStory = Schema.Struct({
  personality: Schema.optional(Schema.String),
  ideal: Schema.optional(Schema.String),
  bond: Schema.optional(Schema.String),
  flaw: Schema.optional(Schema.String),
});
export type SheetStory = typeof SheetStory.Type;

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
 * ### The sheet arrived, and it changed no SQL
 *
 * `ui_kits/dm-screen/CharacterSheet.jsx` draws about thirty fields against the
 * nine columns `0012` gave `character`, and **not one of them earned a tenth**.
 * The rule is the file's own and its inputs did not change: *a field earns a
 * column when something in the product reads it* — a screen filters or sorts on
 * it, the seed copies it, a predicate uses it, search indexes it. Nothing on
 * Stats, Gear or Story is any of those. They are drawn, all at once, on one
 * screen, for one row fetched by id.
 *
 * So every key below is a new **optional** key on a `jsonb` document:
 * `emptyCharacterSheet` still decodes, every row written before them still
 * reads, and there is no backfill and no migration. The two values that are
 * genuinely *live* — death saves and spell slots — cleared a different rule and
 * are argued at `DeathSaves` and `SpellSlot`; the short version is that the DM's
 * runner draws neither, so neither has a second holder.
 *
 * **Growing the document grows what campaign search indexes.** `0012` puts
 * `jsonb_to_tsvector(body)` at weight C in `character.search` and `repo/Search.ts`
 * is the fourth arm, so a player's backstory and journal become findable in
 * their DM's campaign search the moment they are typed, with no code change.
 * That is mostly the point — *"the ferryman's token"* is exactly what a DM wants
 * to find — but it also means a player's journal is not private from their DM,
 * and nothing here pretends otherwise.
 */
export const CharacterSheet = Schema.Struct({
  /**
   * Free prose about them — background, appearance, what they are afraid of,
   * and the Story tab's backstory.
   *
   * This is also where a descriptor written before `species` and `class_name`
   * were columns landed: `0012_character_sheet.ts` moved it here verbatim
   * rather than guessing at its parts.
   */
  notes: Schema.String,
  /** `STR 10 (+0)` — the same cell a stat block has. */
  abilities: Schema.Array(Ability),
  /** Named blocks: features, spells known, equipment. The sheet's Features list. */
  traits: Schema.Array(Trait),
  /** The tagline's unowned half, and the identity card's numbers. */
  identity: Schema.optional(SheetIdentity),
  skills: Schema.optional(Schema.Array(Skill)),
  /** `"All armour"`, `"Orcish"` — badges, an open vocabulary. */
  proficiencies: Schema.optional(Schema.Array(Schema.String)),
  /**
   * The Actions tab. `Trait`s, not an `Attack` shape — see `Trait`, which grew
   * `hit` and `note` for exactly this and for the Features list beside it.
   *
   * Its own key rather than more `traits` because the sheet draws the two in
   * different tabs with different affordances, and a reader cannot tell an
   * attack from a feature by inspecting the fields.
   */
  attacks: Schema.optional(Schema.Array(Trait)),
  spellcasting: Schema.optional(Spellcasting),
  inventory: Schema.optional(Schema.Array(InventoryItem)),
  currency: Schema.optional(Currency),
  deathSaves: Schema.optional(DeathSaves),
  levelUps: Schema.optional(Schema.Array(LevelUp)),
  journal: Schema.optional(Schema.Array(JournalEntry)),
  story: Schema.optional(SheetStory),
});
export type CharacterSheet = typeof CharacterSheet.Type;

/**
 * What a character created with no sheet gets — the same value the migration
 * states as the column default, so a client can render an empty sheet without a
 * special case.
 *
 * It names the three required keys and none of the optional ones, which is what
 * makes the document's growth additive rather than a new default: a row written
 * before the sheet existed decodes to exactly this.
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
 * What a **player** may change about their own character — the first player
 * write in the product's history, and deliberately the smaller schema.
 *
 * The captain's decision (`player-edits-own-character`) grants the **durable
 * half only**: their name, the three fields the descriptor derives from, the
 * numbers that move when they level up, where their real sheet lives, and the
 * document. *Never hit points, never anything inside a live fight.*
 *
 * ### Why it is a second schema rather than a flag on `CharacterUpdate`
 *
 * The same rule `PlayerSessionRecap` follows, met on the write side: **distinct
 * schemas on distinct paths, never a field filter over the wider type.** A
 * payload that *can* carry `hpCurrent` is one that eventually will, and the
 * thing standing between it and the column would be an `if` somebody has to
 * remember. Here the three live columns have no field at all, so a player
 * writing one is not a check that failed — it is not expressible, and it is
 * refused by the client's own encoder before a request leaves the browser.
 *
 * It is the same argument `CharacterAssign` already makes from the other side:
 * the DM-only act of saying whose character this is stays DM-only by *which
 * endpoint exists*.
 *
 * ### What is left out, and why each one
 *
 * - **`hpCurrent`, `tempHp`, `conditions`** — `0014`'s live trio, the values a
 *   fight and a character both hold. `hpCurrent` moves by delta through
 *   `CharacterDamage` and `conditions` writes through to every live combatant;
 *   both are the DM's, by the live-hit-points decision this one sits under.
 * - **`visibility`** — the row's own half of the disclosure seam. Who else at
 *   the table may read this sheet is the DM's answer, and it is not named by the
 *   decision. A new row still fails closed at `dm`, and it stays that way until
 *   a DM says otherwise.
 * - **`accountId`** — not on `CharacterUpdate` either, for the reason
 *   `CharacterAssign` gives at length: the owner of a row is precisely the field
 *   a player must not be able to send.
 * - **`descriptor`** — derived, and writable by nobody.
 *
 * `ac` and `hpMax` are *in*, and are the durable half rather than the live one:
 * they are `0012`'s prep columns, they are what changes when somebody levels or
 * finds better armour, and neither is a hit point. A combatant snapshots both at
 * seed time, so writing them reaches no fight already on the table.
 */
export const CharacterOwnUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  level: Schema.optional(Schema.NullOr(level)),
  species: Schema.optional(Schema.NullOr(shortLabel)),
  className: Schema.optional(Schema.NullOr(shortLabel)),
  ac: Schema.optional(Schema.NullOr(ac)),
  hpMax: Schema.optional(Schema.NullOr(hp)),
  sheetUrl: Schema.optional(Schema.NullOr(sheetUrl)),
  /** Whole-document, like `CharacterUpdate.sheet` — and it races the same way. */
  sheet: Schema.optional(CharacterSheet),
});
export type CharacterOwnUpdate = typeof CharacterOwnUpdate.Type;

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
