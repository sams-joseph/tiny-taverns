import { Schema } from "effect";
import { Ability, Trait } from "./Creature.js";
import {
  AccountId,
  CharacterId,
  EquipmentId,
  FeatId,
  FeatureId,
  RacialTraitId,
  SpellId,
} from "./Ids.js";
import { provenanceFields } from "./Provenance.js";

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
 * the durable identity columns. What the kit draws beside it — *"Oath of the Open Road"*, a
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
  /**
   * Expertise: the proficiency bonus counts twice. Read by the level recompute
   * (`withLevel`) to know which bonus a proficient row's number was written
   * from; nothing draws it yet.
   */
  expertise: Schema.optional(Schema.Boolean),
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
  /** Stable provenance for the picker and for derived spell action lines. */
  spellId: Schema.optional(Schema.NullOr(SpellId)),
  /** `"Concentration · 1 min"` */
  note: Schema.optional(Schema.String),
  prepared: Schema.optional(Schema.Boolean),
  /**
   * Learned at a level-up past the class list's reach: *Magical Secrets* (a
   * spell of any list) or *Mystic Arcanum* (a spell above the highest slot).
   * The level recompute and the spell picker narrow the known list to what
   * the class list reaches; a row with this mark is kept while the vocabulary
   * still has the spell, because the list was never what reached it.
   */
  learnedBy: Schema.optional(Schema.Literals(["magicalSecrets", "mysticArcanum"])),
});
export type SpellKnown = typeof SpellKnown.Type;

/**
 * The casting aside — ability, save DC, attack bonus — and the known list.
 *
 * Since the corpus started writing the sheet, `slots` here is the **legacy**
 * home for spell slots: a fresh sheet carries them as `resources` (`"slot:N"`)
 * and this key holds only the three numbers and the counts the class table
 * states. A row written before that still decodes and still draws, because the
 * reader falls back to `slots` when no slot resource is present.
 */
export const Spellcasting = Schema.Struct({
  /** `"CHA"` */
  ability: Schema.optional(Schema.String),
  /** `"14"` — the save DC, as written. */
  save: Schema.optional(Schema.String),
  /** `"+6"` */
  attack: Schema.optional(Schema.String),
  /** How many cantrips the class table says are known at this level. */
  cantripsKnown: Schema.optional(Schema.Int),
  /** How many spells a known-caster's table says are known at this level. */
  spellsKnown: Schema.optional(Schema.Int),
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
  /**
   * The `equipment` row this line came from, when the starting kit wrote it —
   * **provenance, never an access path**, the `derived_from` idiom. It is what
   * lets a weapon attack on `actions` say which line of the pack it is, and
   * what a later level-up would re-derive an attack from. Absent on a line the
   * player typed; `null` once the row it named is gone or out of reach, and the
   * line stands either way.
   */
  equipmentId: Schema.optional(Schema.NullOr(EquipmentId)),
});
export type InventoryItem = typeof InventoryItem.Type;

/**
 * The action economy, as a cost on each line — **and nothing tracked per turn.**
 *
 * The captain's decision D6 (2026-09-03): draw `1 action` / `bonus` / `reaction`
 * on the line and hold no "spent this turn" state anywhere. A turn's spending is
 * gone when the turn ends, nothing on `combatant` holds one, and a wrong tick
 * would be a lie read out at the table. `free` is the drawn word for a thing
 * that costs no action (Action Surge, an object interaction); absent means the
 * corpus does not say.
 */
export const ActionCost = Schema.Literals(["action", "bonus", "reaction", "free"]);
export type ActionCost = typeof ActionCost.Type;

/** What kind of row a line came out of — the badge's colour and the reader's grouping. */
export const ActionSource = Schema.Literals(["weapon", "spell", "feature", "racial", "other"]);
export type ActionSource = typeof ActionSource.Type;

/**
 * One thing the character can do, as the sheet and the table draw it: a name,
 * a cost, and the roll parts — `CharacterSheetB.jsx`'s `BAttack` row, which is
 * a name, a kind line, a to-hit and a dice button.
 *
 * ### Why a shape of its own, beside `Trait`
 *
 * `attacks` is `Trait`s, and `Trait` is the bestiary's: a named block of prose
 * that a monster, a feature and a spell all are. An action is not a block of
 * prose — it is *a line with a cost and a roll*, and the drawing draws it as
 * one. Growing `Trait` with a cost and a recharge would drag `StatBlock.tsx`
 * into every change here, and nothing on a `Trait` can say which row it came
 * from. That last part is the point of this shape.
 *
 * ### Document, by the column rule
 *
 * *A value two rows both hold gets a column, and one transaction writes both.*
 * The DM's runner holds no action, no attack and no cost — a combatant snapshots
 * a name, an armour class and hit points — so nothing here has a second holder,
 * and an actions column would have no reader but the row that owns it. It is
 * one optional key on the `jsonb` document: every row written before it still
 * decodes, and there is no migration.
 *
 * ### The link back, and `derived`
 *
 * `equipmentId` / `spellId` / `featureId` / `racialTraitId` name the row the
 * line was derived from. **Provenance, never read through** — the same rule as
 * `derived_from` on a campaign copy: a spell the DM later un-shares leaves the
 * line standing with its id set to `null`, and no reader follows the pointer
 * to answer anything. `derived: true` is the level-change contract: a
 * recompute (`withLevel` in `SheetGrants.ts`) rewrites every derived line from
 * the corpus for the new level and leaves every line without the flag — the
 * ones the player typed — alone. Nothing recomputes on a read.
 */
export const SheetAction = Schema.Struct({
  /** Stable within one sheet: `"atk:longsword"`, `"feat:second-wind"`. */
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  cost: Schema.optional(ActionCost),
  /** `"+5"` — pre-signed, like `Trait.hit`. */
  hit: Schema.optional(Schema.String),
  /** `"1d8+3"` — the bonus inside the notation, so a roll reads it whole. */
  dice: Schema.optional(Schema.String),
  /** `"Slashing"`, `"Radiant"` */
  damageType: Schema.optional(Schema.String),
  /** `"Reach 10 ft."`, `"80/320 ft."`, `"Thrown 20/60 ft."` */
  range: Schema.optional(Schema.String),
  /** The kind line under the name: `"Martial melee · Versatile (1d10)"`. */
  text: Schema.optional(Schema.String),
  source: ActionSource,
  /** Which counter it spends — a `SheetResource.id`, `"slot:1"` or `"res:second-wind"`. */
  resource: Schema.optional(Schema.String),
  equipmentId: Schema.optional(Schema.NullOr(EquipmentId)),
  spellId: Schema.optional(Schema.NullOr(SpellId)),
  featureId: Schema.optional(Schema.NullOr(FeatureId)),
  racialTraitId: Schema.optional(Schema.NullOr(RacialTraitId)),
  derived: Schema.optional(Schema.Boolean),
});
export type SheetAction = typeof SheetAction.Type;

/** When a counter comes back: a short rest, a long rest, the next dawn, or never. */
export const ResourceRecharge = Schema.Literals(["short", "long", "dawn", "never"]);
export type ResourceRecharge = typeof ResourceRecharge.Type;

/**
 * A counter with a ceiling and a recharge — spell slots per level, a feature's
 * uses, the hit dice, the Lay on Hands pool. Keyed by the same ids an action's
 * `resource` names, because a slot is spent by many actions (every first-level
 * spell, Divine Smite) and a feature's counter is one line; the drawing
 * separates them too (`BSlots` against the `note` on a feature row).
 *
 * **`used` is live and in the document by the same argument `SpellSlot` made**:
 * nothing else holds it — the DM's runner draws no slot and no use — so there
 * is no second copy to keep in step. Spend and rest move it through their own
 * owner-only endpoints, rather than through a whole-sheet PATCH.
 */
export const SheetResource = Schema.Struct({
  /** `"slot:1"` … `"slot:9"`, `"hit-dice"`, `"res:<feature index>"`. */
  id: Schema.NonEmptyString,
  /** `"1st-level slots"`, `"Hit dice"`, `"Lay on Hands"` */
  name: Schema.NonEmptyString,
  used: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 })),
  max: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 })),
  recharge: ResourceRecharge,
  /** `"hp"` for a pool measured in hit points, `"d10"` for the hit dice. */
  unit: Schema.optional(Schema.String),
  featureId: Schema.optional(Schema.NullOr(FeatureId)),
  racialTraitId: Schema.optional(Schema.NullOr(RacialTraitId)),
  derived: Schema.optional(Schema.Boolean),
});
export type SheetResource = typeof SheetResource.Type;

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
 * Three up, three down — **live, and two columns on each copy.**
 *
 * `death_save_successes` and `death_save_failures` on `character` (the owner)
 * and on `combatant` (the fight's copy), written in one transaction by
 * `apps/server/src/repo/vitals.ts`, as a hit point is. They left the sheet
 * document when the DM's runner came to draw them on the initiative row: a
 * value two screens read and two people write is live state, not prose.
 *
 * The rules are the server's, in `vitals.ts`: damage to a player character at
 * zero hit points adds a failure (two on a critical), any healing from zero
 * clears both, and a rolled save is `deathSaveRolled` below. Both counts stop
 * at three.
 */
export const DeathSaves = Schema.Struct({
  successes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  failures: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
});
export type DeathSaves = typeof DeathSaves.Type;

/**
 * One entry on the sheet's Features list: the bestiary's `Trait`, plus where
 * it came from.
 *
 * `Trait` itself stays the stat block's shape (`StatBlock.tsx` draws it and
 * nothing on a monster has a source row); only the sheet's list widens, and
 * every key added is optional, so every sheet written before decodes as it
 * was. The keys follow `SheetAction`'s: `featureId` / `racialTraitId` name the
 * row a line was granted from, as **provenance, never read through**, and
 * `derived: true` says the line is the corpus's to rewrite. A level change
 * (`withLevel` in `SheetGrants.ts`) replaces the derived class and subclass
 * features with the ones the new level grants, and never touches a line
 * without the flag, which is what the player typed.
 *
 * `pick` marks a player's choice inside a granted feature (*Fighting Style:
 * Archery* under *Fighting Style*, a feat taken in place of an *Ability Score
 * Improvement*): it is kept while the feature that offered it is still
 * granted, and dropped with it on a level down. `featId` names the feat a
 * line was taken as.
 */
export const SheetFeature = Schema.Struct({
  ...Trait.fields,
  featureId: Schema.optional(Schema.NullOr(FeatureId)),
  racialTraitId: Schema.optional(Schema.NullOr(RacialTraitId)),
  featId: Schema.optional(Schema.NullOr(FeatId)),
  derived: Schema.optional(Schema.Boolean),
  pick: Schema.optional(Schema.Struct({ offeredBy: FeatureId })),
});
export type SheetFeature = typeof SheetFeature.Type;

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
 * The bound on an appearance line — a character's `SheetStory.appearance` and
 * an NPC's `NpcIdentity.appearance` — shared by the forms, Hob's tool and the
 * schemas.
 */
export const APPEARANCE_MAX = 400;

/**
 * The lines the Story tab draws beside the backstory.
 *
 * The backstory itself is `notes`, which has held it since `0012` — a second
 * key for the same prose would be two places to look for one paragraph.
 */
export const SheetStory = Schema.Struct({
  personality: Schema.optional(Schema.String),
  ideal: Schema.optional(Schema.String),
  bond: Schema.optional(Schema.String),
  flaw: Schema.optional(Schema.String),
  /**
   * How they look, in a sentence or two — age, build, hair, clothing, a mark.
   *
   * Its own key rather than more `notes`, because `notes` is narrative and this
   * is the one line the portrait prompt reads verbatim (`Portrait.ts`), where a
   * backstory is deliberately never sent.
   */
  appearance: Schema.optional(Schema.String.check(Schema.isMaxLength(APPEARANCE_MAX))),
});
export type SheetStory = typeof SheetStory.Type;

/**
 * **The rules half of the sheet**: every key that answers what the creature on
 * it can do — the six cells, features, identity numbers, skills, actions,
 * counters, spellcasting and gear. `CharacterSheet` is this plus the player's
 * own half (notes, story, journal, the level-up log).
 *
 * It is its own schema because an NPC carries a character-style sheet too, and
 * the keys it leaves out would be wire fields with no reader. A
 * `CharacterSheet` *is* a `SheetBody`, so a renderer or a pure rule that needs
 * only the rules half takes this type and a character passes its own sheet
 * unchanged. Splitting it changed no wire and no row.
 */
export const SheetBody = Schema.Struct({
  /** `STR 10 (+0)` — the same cell a stat block has. */
  abilities: Schema.Array(Ability),
  /** Named blocks: features, spells known, equipment. The sheet's Features list. */
  traits: Schema.Array(SheetFeature),
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
  /**
   * What the character can do, derived from the corpus at creation — weapon
   * attacks from the starting kit, features with a cost — and typed by the
   * player after. **The Actions section reads this first and `attacks` as the
   * fallback**, so a row that already holds `attacks` draws exactly as it did.
   */
  actions: Schema.optional(Schema.Array(SheetAction)),
  /**
   * The counters: slots per level, feature uses, hit dice, a pool. Read-only on
   * this slice — see `SheetResource`. The Spellcasting section reads its
   * `"slot:N"` rows first and `spellcasting.slots` as the fallback.
   */
  resources: Schema.optional(Schema.Array(SheetResource)),
  spellcasting: Schema.optional(Spellcasting),
  inventory: Schema.optional(Schema.Array(InventoryItem)),
  currency: Schema.optional(Currency),
});
export type SheetBody = typeof SheetBody.Type;

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
 * reads, and there is no backfill and no migration. Spell slots are live and
 * stay here, argued at `SpellSlot`: the DM's runner does not draw them, so they
 * have no second holder. Death saves were the other such value until the
 * runner drew them, and they are columns now (`DeathSaves`).
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
   * This is also where a descriptor written before `race` and `class_name`
   * were columns landed: `0012_character_sheet.ts` moved it here verbatim
   * rather than guessing at its parts.
   */
  notes: Schema.String,
  ...SheetBody.fields,
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

/**
 * Where a character's portrait loads from: three sizes of one WebP, each a
 * short-lived signed path on this API (`/portraits/:portraitId/:variant?e=…&s=…`).
 *
 * **A path, not an absolute URL.** The server does not know the origin a
 * browser reached it by; the client resolves each path against the API base
 * URL it already sends every request to.
 *
 * **Minted only inside a read that already passed a visibility predicate** —
 * the owner's `ownCharacter`, or a seat the reader may see — so the URL is that
 * SQL decision carried forward for a day or so, never a second access path. An
 * `<img>` cannot send the bearer header, which is why the signature is in the
 * query string rather than a credential. A bad or expired one is `NotFound`.
 */
export class CharacterPortraitImages extends Schema.Class<CharacterPortraitImages>(
  "CharacterPortraitImages",
)({
  /** 160 px square, for the 40 and 64 px plates at 2x. */
  thumbUrl: Schema.String,
  /** 640 px square, for the *My characters* card. */
  cardUrl: Schema.String,
  /** 1024 px square. */
  fullUrl: Schema.String,
}) {}

/**
 * Where a character's banner loads from: two sizes of one 2:1 WebP, signed as
 * `CharacterPortraitImages` is (`/portrait-banners/:imageId/:variant?e=…&s=…`)
 * and minted by the same reads, so whoever can see the portrait can see the
 * banner and nobody else gets a URL.
 *
 * The banner is its own draw, framed wide, for the places a card crops a
 * portrait into a band; the square stays the plate everywhere else.
 */
export class CharacterBannerImages extends Schema.Class<CharacterBannerImages>(
  "CharacterBannerImages",
)({
  /** 768 × 384, a card's portrait band at 2x. */
  cardUrl: Schema.String,
  /** 1536 × 768. */
  fullUrl: Schema.String,
}) {}

export class Character extends Schema.Class<Character>("Character")({
  id: CharacterId,
  /**
   * Whose character it is — **owned by an account, campaign-scoped nowhere.**
   *
   * The captain's continuity decision of 2026-09-01: a character is a
   * top-level identity whose playable state — level, hit points, conditions,
   * inventory, the sheet — carries across every campaign that seats it.
   * Campaign participation is a `CampaignCharacter` join to this same row,
   * never a fork of it, and history is preserved by snapshots (`Combatant`
   * copies display state at seed time) rather than by freezing the character.
   */
  accountId: AccountId,
  name: Schema.String,
  playerName: Schema.NullOr(Schema.String),
  /** `3`. Absent until somebody says. */
  level: Schema.NullOr(Schema.Int),
  /** `"Elf"` — an open 2014 race label, like a creature's `size`. */
  race: Schema.NullOr(Schema.String),
  /** `"High Elf"` — optional and rendered only when the player chose one. */
  subrace: Schema.NullOr(Schema.String),
  /** `"Paladin"` — likewise open, and rendered as the DM capitalised it. */
  className: Schema.NullOr(Schema.String),
  /**
   * The `"Level 3 Half-orc Paladin"` half-line under the name — **derived, and
   * not writable.**
   *
   * It used to be a column the DM typed. Once `level`, `race`, `subrace` and
   * `className` became columns it had to become one or the other: a label
   * stored beside the fields it summarises is a second answer, and the two
   * disagree the first time anyone edits one of them. So it is a Postgres
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
   * The DM has awarded inspiration and it has not been spent.
   *
   * Live state the table sets, like the two above: the creator writes it
   * through the seat (`PartySeatUpdate.inspiration`), and the owner reads it
   * but has no field for it in `CharacterOwnUpdate`. There is no combatant
   * copy, because nothing in a fight draws it.
   */
  inspiration: Schema.Boolean,
  /**
   * Death saves — the third value a live fight and a character both hold, so
   * it travels through the write-through `hpCurrent` does. The DM marks and
   * rolls them on the fight's copy; the owner marks them on their sheet
   * (`CharacterDeathSavesSet`). Nought and nought is the ordinary state.
   */
  deathSaves: DeathSaves,
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
  /**
   * The optimistic-concurrency counter — the continuity decision's explicit
   * answer to two campaigns (or two tabs) editing one shared sheet. Bumped by
   * every write; a caller may send it back as `expectedVersion` on the PATCH
   * and be refused with a `Conflict` when somebody got there first, instead
   * of silently overwriting them. The live trio needs none of this: a hit
   * point moves by an atomic in-SQL delta, never by read-modify-write.
   *
   * There is no `visibility` here any more: who at a *table* may see the
   * character is the seat's question (`CampaignCharacter.visibility`), and a
   * top-level character has no table.
   */
  version: Schema.Int,
  /**
   * The portrait Hob drew once, after the character was made — or `null`:
   * none was drawn (portraits are off, there was nothing to draw from, the
   * daily cap was reached, or the provider refused or failed), it is still
   * being drawn, or this server cannot sign image URLs. Every `null` renders
   * the same lettered plate; the reason is the server's record, not the wire's.
   */
  portrait: Schema.NullOr(CharacterPortraitImages),
  /**
   * The wide banner Hob drew beside the portrait, for a card's portrait band —
   * or `null` for every reason `portrait` can be, and also when the character
   * was drawn before banners existed. A band shows `portrait` then.
   */
  banner: Schema.NullOr(CharacterBannerImages),
  /**
   * The portrait or its banner is being drawn right now. A screen shows a
   * quiet drawing state and re-reads the character until this is `false`; it
   * never becomes `true` again for the same character, because each is drawn
   * once.
   */
  portraitPending: Schema.Boolean,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * The sheet's identity numbers and labels as a write states them, bounded the
 * way the columns are — a character's here, and an NPC sheet's (`NpcSheetPut`,
 * `0076_npc_sheets.ts`), which carries the same columns under the same checks.
 */
export const SheetArmorClass = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));
export const SheetHitPoints = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));
/** The highest level a sheet holds; the level-up offer has no level past it. */
export const SHEET_LEVEL_MAX = 100;
/** Bounded the way the column is: generously, to refuse a typo rather than epic play. */
export const SheetLevel = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: SHEET_LEVEL_MAX }),
);
/** A race, subrace or class name. */
export const SheetLabel = Schema.NonEmptyString.check(Schema.isBetweenLength(1, 40));
const sheetUrl = Schema.String.check(
  Schema.isBetweenLength(1, 2000),
  Schema.isPattern(/^https?:\/\//i),
);

/**
 * What an **owner** may change about their own character — the durable half of
 * the one shared sheet: their name, the fields the descriptor derives from,
 * the numbers that move when they level up, where their real sheet lives, and
 * the document.
 *
 * ### Why it is its own schema
 *
 * The rule `PlayerSessionRecap` set, met on the write side: **distinct schemas
 * on distinct paths, never a field filter over a wider type.** The live trio —
 * `hpCurrent`, `tempHp`, `conditions` — has no field here at all, and nor has
 * `inspiration`: a hit point moves by delta through `CharacterDamage` (the
 * campaign creator's act, through the seat), and inspiration is the DM's award,
 * so an owner writing one is not a check that failed — it is not expressible,
 * and the client's own encoder refuses it before a request leaves the browser.
 *
 * `accountId` is not here either: the owner of a row is precisely the field
 * its owner must not be able to send. And there is no `visibility` — who at a
 * table may see the character is the seat's question, the creator's to answer
 * per campaign.
 */
export const CharacterOwnUpdate = Schema.Struct({
  /**
   * Optimistic concurrency, opted into by sending the version the sheet was
   * read at: the write is refused with a `Conflict` when the row has moved on
   * — which, with one character shared across campaigns, is how two tables
   * editing one sheet notice each other instead of silently overwriting.
   * Omitted, the write is last-writer-wins, exactly as before.
   */
  expectedVersion: Schema.optional(Schema.Int),
  name: Schema.optional(Schema.NonEmptyString),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  level: Schema.optional(Schema.NullOr(SheetLevel)),
  race: Schema.optional(Schema.NullOr(SheetLabel)),
  subrace: Schema.optional(Schema.NullOr(SheetLabel)),
  className: Schema.optional(Schema.NullOr(SheetLabel)),
  ac: Schema.optional(Schema.NullOr(SheetArmorClass)),
  hpMax: Schema.optional(Schema.NullOr(SheetHitPoints)),
  sheetUrl: Schema.optional(Schema.NullOr(sheetUrl)),
  /** Whole-document, like `CharacterUpdate.sheet` — and it races the same way. */
  sheet: Schema.optional(CharacterSheet),
});
export type CharacterOwnUpdate = typeof CharacterOwnUpdate.Type;

/**
 * Writing down a character of your own — `POST /me/campaigns/:c/characters`,
 * which creates the top-level account-owned character only. The campaign in
 * the path is rules/Hob vocabulary context and the boundary for validating a
 * race/subrace pair; seating is the explicit `party.join` act.
 *
 * `accountId` is not here and there is nowhere it could go: the owner is
 * `CurrentActor`'s, taken server-side. The live trio and `visibility` are
 * absent for `CharacterOwnUpdate`'s reasons — a new character starts with
 * `hp_current` null (*nobody has said yet*) and no campaign disclosure at all
 * until its owner chooses a table to add it to.
 */
export const CharacterOwnCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  playerName: Schema.optional(Schema.String),
  level: Schema.optional(SheetLevel),
  race: Schema.optional(SheetLabel),
  subrace: Schema.optional(SheetLabel),
  className: Schema.optional(SheetLabel),
  ac: Schema.optional(SheetArmorClass),
  hpMax: Schema.optional(SheetHitPoints),
  sheetUrl: Schema.optional(sheetUrl),
  /** Omit and the column default — an empty document — decides. */
  sheet: Schema.optional(CharacterSheet),
});
export type CharacterOwnCreate = typeof CharacterOwnCreate.Type;

/**
 * Apply damage or healing to a character, through their seat at one campaign —
 * the creator's delta, `POST /campaigns/:c/party/:seatId/damage`.
 *
 * A delta rather than an absolute, and its own endpoint rather than a
 * `PATCH { hpCurrent }`, because it is the mutation that repeats and therefore
 * the one that has to be safe to repeat. When the character is in a fight that
 * is still on this campaign's table, the delta is applied to that fight's
 * combatant and copied back — one clamp, one transaction, two rows that cannot
 * part company. See `apps/server/src/repo/vitals.ts`.
 *
 * **The number lands on the shared character**, which is the continuity
 * decision working: damage taken at one table is what every other table sees,
 * because there is one character. A second campaign's *live fight* keeps its
 * own combatant copy until that fight writes — the same already-documented
 * divergence a carried fight has always had, one table wider.
 */
export const CharacterDamage = Schema.Struct({
  /** Positive damages, negative heals. Zero is legal and does nothing. */
  amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 })),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type CharacterDamage = typeof CharacterDamage.Type;

/**
 * The owner marking their own death saves, from their sheet —
 * `POST /me/characters/:characterId/death-saves`. Absolute, as the pips are:
 * pressing the second success sets two.
 *
 * Its own grain rather than a key on `CharacterOwnUpdate`, because death saves
 * are live: they are columns the DM's runner reads and writes too, and the
 * whole-document PATCH is the durable half. The character is the owner's
 * (`ownCharacter`); the fight's copy follows only through a seat the owner
 * holds at that fight's campaign.
 */
export const CharacterDeathSavesSet = Schema.Struct({
  ...DeathSaves.fields,
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type CharacterDeathSavesSet = typeof CharacterDeathSavesSet.Type;

/**
 * A rolled death save, as the rules read it: a natural 20 is back up with one
 * hit point and both counts cleared (`revived`), a natural 1 is two failures,
 * 10 or more is a success, anything else a failure. Both counts stop at three.
 *
 * The one statement of the rule. The server applies it to a combatant the
 * DM rolled for; the browser only rolls the face.
 */
export const deathSaveRolled = (
  saves: DeathSaves,
  face: number,
): { readonly saves: DeathSaves; readonly revived: boolean } => {
  if (face >= 20) return { saves: { successes: 0, failures: 0 }, revived: true };
  if (face <= 1) {
    return { saves: { ...saves, failures: Math.min(3, saves.failures + 2) }, revived: false };
  }
  return face >= 10
    ? { saves: { ...saves, successes: Math.min(3, saves.successes + 1) }, revived: false }
    : { saves: { ...saves, failures: Math.min(3, saves.failures + 1) }, revived: false };
};

/**
 * Spend or recover one counted sheet resource — spell slots, feature uses,
 * pools and hit dice — through an owner-only patch grain.
 *
 * Positive amounts mark uses spent; negative amounts recover them. The server
 * applies the delta to exactly one `sheet.resources[*].used` field and clamps
 * it within `[0,max]`, so a double press cannot push a counter past either
 * edge. `requestId` is the same retry guard the hit-point delta carries: a
 * repeated request is answered from the row without applying the delta again.
 */
export const CharacterResourceSpend = Schema.Struct({
  resourceId: Schema.NonEmptyString.check(Schema.isBetweenLength(1, 120)),
  amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000, maximum: 10_000 })),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type CharacterResourceSpend = typeof CharacterResourceSpend.Type;

export const RestKind = Schema.Literals(["short", "long"]);
export type RestKind = typeof RestKind.Type;

/**
 * A rules-bounded rest for this owned character. A short rest may spend hit
 * dice; the owner names only how many dice, never an arbitrary hit-point total.
 * Long rests reset recoverable counters, restore hit dice by the 2014 rule,
 * fully heal, clear concentration and zero temporary hit points.
 */
export const CharacterRest = Schema.Struct({
  kind: RestKind,
  /** Number of hit dice to spend during a short rest. Ignored for a long rest. */
  hitDice: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type CharacterRest = typeof CharacterRest.Type;
