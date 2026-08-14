import { Schema } from "effect";
import { AccountId, CampaignId, CreatureId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * A creature has a **document form and a row form**, and neither derives from
 * the other.
 *
 * The fixtures hold both for the same creature: `data.js:23-33` is the document
 * — `ac: "17 (chain shirt, shield)"`, `hp: "21 (6d6)"`, `cr: "1 (200 XP)"`,
 * prose traits — and `data.js:36` is the row — `ac: 17, hp: 21, cr: "1"`. The
 * document is what a DM reads off `StatBlock.jsx`; the row is what
 * `Bestiary.jsx:11-12` filters and sorts on. Normalising the document loses the
 * parenthetical and buys nothing, because nothing queries inside it except
 * full-text search; deriving the document from the row cannot invent
 * "(chain shirt, shield)".
 *
 * So: filterable values are columns, and the display half is one `jsonb`
 * document. This file is the wire shape of both halves.
 */

/**
 * One ability cell on a stat block (`StatBlock.jsx:3-11`).
 *
 * All three are display strings because the fixture stores them that way
 * (`data.js:26`) and because the modifier is what the DM's eye goes to. The
 * modifier is arithmetically derivable from the score, but only for creatures
 * that obey the arithmetic — and a stat block is a document, so it keeps what
 * was written rather than what can be recomputed.
 *
 * `save` and `proficient` arrived with the character sheet
 * (`ui_kits/dm-screen/PlayerParts.jsx`'s `AbilityBlock`, which draws a saving
 * throw under the modifier and a dot beside it). They are here rather than on a
 * `CharacterAbility` of their own for this file's own stated reason: **a stat
 * block's ability cell and a character sheet's are one question.** A monster has
 * saving throws too, and `apps/web/src/bestiary/StatBlock.tsx` already draws
 * this cell — two shapes meaning the same thing would be two renderers.
 *
 * Both are optional keys, so every stat block written before them still
 * decodes and a creature that has never had a saving throw typed in renders
 * exactly as it did.
 */
export const Ability = Schema.Struct({
  /** `"STR"` */
  label: Schema.NonEmptyString,
  /** `"10"` */
  score: Schema.NonEmptyString,
  /** `"+0"` */
  modifier: Schema.NonEmptyString,
  /**
   * `"+7"` — the saving throw, pre-signed like `modifier` and for the same
   * reason: the document keeps what was written.
   */
  save: Schema.optional(Schema.String),
  /**
   * Whether the saving throw is proficient — the filled dot beside it.
   *
   * A boolean rather than a string because it is the one thing here nothing
   * renders verbatim: it is drawn as a mark, not as text.
   */
  proficient: Schema.optional(Schema.Boolean),
});
export type Ability = typeof Ability.Type;

/**
 * A named trait, action or reaction (`data.js:27-32`) — and, since the
 * character sheet, a feature and an attack as well.
 *
 * `dice` is present only on the rollable ones — `StatBlock.jsx:47-51` renders a
 * roll button when it is there and nothing when it is not, so an absent key and
 * a present-but-empty one would render differently. It is an optional key for
 * that reason rather than a nullable string.
 *
 * `hit` and `note` are the two the sheet needed, and they are here rather than
 * in an `Attack` and a `Feature` shape because a named block of prose is a
 * monster's trait, a character's feature, a spell and a piece of equipment —
 * `Character.ts` says so and `CharacterSheet` composes this in three places.
 * The mapping onto what the kit draws is exact: `AttackRow` is a name, a second
 * line (`text`), a to-hit (`hit`) and a dice button (`dice`); the Features list
 * is a name, an accented short label (`note`) and a paragraph (`text`).
 */
export const Trait = Schema.Struct({
  name: Schema.NonEmptyString,
  text: Schema.String,
  /** `"1d6+2"` — omitted when the trait is not something you roll. */
  dice: Schema.optional(Schema.String),
  /** `"+7"`, or `"—"` for something that does not roll to hit. */
  hit: Schema.optional(Schema.String),
  /** `"1/short rest"`, `"10 ft."` — the short label beside the name. */
  note: Schema.optional(Schema.String),
});
export type Trait = typeof Trait.Type;

/**
 * The document half: everything on the stat block that has no column.
 *
 * `name` is deliberately not repeated here — it is a column, and a document
 * that could disagree with its own row about the creature's name is a bug
 * waiting for someone to edit one of them.
 *
 * The stat block's read-aloud (`data.js:33`) is **not** here either. Read-aloud
 * is a kind of `note` with an attachment, not a column on whatever it describes
 * — see `Note.NoteAttachment`. Putting it in this document would be that column
 * with extra steps, and would give it no visibility of its own.
 */
export const StatBlock = Schema.Struct({
  /** `"Small humanoid (goblinoid), neutral evil"` */
  meta: Schema.String,
  /** `"17 (chain shirt, shield)"` — the parenthetical is the whole point. */
  ac: Schema.String,
  /** `"21 (6d6)"` */
  hp: Schema.String,
  /** `"30 ft."` */
  speed: Schema.String,
  /** `"1 (200 XP)"` — the XP award, which the sortable `cr` column has no room for. */
  cr: Schema.String,
  abilities: Schema.Array(Ability),
  traits: Schema.Array(Trait),
});
export type StatBlock = typeof StatBlock.Type;

/**
 * What a creature created with no document gets. Stated in the migration as the
 * column default too — this constant is the same value, for tests and for
 * clients that want to render an empty stat block without a special case.
 */
export const emptyStatBlock: StatBlock = {
  meta: "",
  ac: "",
  hp: "",
  speed: "",
  cr: "",
  abilities: [],
  traits: [],
};

/**
 * A bestiary entry: the template, never an instance.
 *
 * `data.js:18-19` has two `Goblin Archer` rows with different hit points and
 * different ids. Those are combatants in a running encounter, and they are not
 * this. Nothing on this row changes when a goblin takes damage.
 *
 * ### Three provenances in one list
 *
 * `Site.jsx:86` — "Save your own creatures next to the official ones" — and
 * `Site.jsx:193` — "Import a monster". So `system`, `imported` and `authored`
 * rows coexist in the list `Bestiary.jsx` renders, and `origin` is what tells
 * them apart.
 *
 * ### Three owners, and `origin` is not one of them
 *
 * A creature belongs to **a campaign**, or to **an account** — a Library entity,
 * where monsters are authored — or to **nobody**, which is the bundled `system`
 * corpus. The two id columns say which, they are mutually exclusive
 * (`creature_one_owner`), and together they are the only thing any write
 * predicate looks at:
 *
 * | row              | `campaignId` | `accountId` | who may write it   |
 * | ---------------- | ------------ | ----------- | ------------------ |
 * | the bundle       | null         | null        | **nobody**         |
 * | a Library entity | null         | an account  | that account       |
 * | a campaign copy  | a campaign   | null        | that campaign's DM |
 *
 * The bundle is **immutable structurally**: every write predicate compares an
 * ownership column to a value the request carries, and a null matches neither.
 * `creature_system_is_unowned` is what makes a bundled row's `accountId` null as
 * a fact about the schema — `origin = 'system'` and *owned by nobody* are the
 * same statement — so there is no `origin` check anywhere in the server and none
 * is needed. Somebody who wants to change a bundled creature copies it, either
 * into their Library or into a campaign — see `derivedFrom`.
 */
export class Creature extends Schema.Class<Creature>("Creature")({
  id: CreatureId,
  /**
   * The campaign that owns this creature — the *copy*, in a campaign that took
   * one in — or `null` for a row that is in no campaign, which is either a
   * Library entity or the bundle. `accountId` tells those two apart.
   */
  campaignId: Schema.NullOr(CampaignId),
  /**
   * The account whose Library this creature is in, or `null` for a campaign copy
   * and for the bundle.
   *
   * On the wire because it is the ownership fact, and reading it is how a screen
   * knows whether a row is its reader's to edit. That question must not be
   * answered from `origin`: provenance says where content came from, never who
   * may write it, and an imported Library entity is `imported` and still yours.
   *
   * The only non-null value any credential ever sees here is its own account's,
   * because the only rows with one that it can read are the ones it owns.
   */
  accountId: Schema.NullOr(AccountId),
  /**
   * The creature this one was copied from, for a reskin.
   *
   * One nullable pointer is the entire "let the DM edit a system creature"
   * story. The alternative — letting a DM write to a shared row — either
   * corrupts the corpus for everyone or forces copy-on-write logic into every
   * write path in the product.
   *
   * Nothing is ever *read through* this pointer, so it is not an access path
   * and cannot leak: it names a row the actor could already see when the copy
   * was made, and it survives that row being deleted as `null`.
   */
  derivedFrom: Schema.NullOr(CreatureId),
  name: Schema.String,
  /**
   * `"Small"`, `"Medium"` — the first half of the fixtures' `sub: "Small
   * humanoid"` line (`data.js:16`). Stored as a part rather than as the
   * assembled string, because the same two parts are also the bestiary card's
   * type badge.
   */
  size: Schema.NullOr(Schema.String),
  /** `"Humanoid"`, `"Fey"`, `"Undead"`, `"Beast"` (`data.js:36-41`). */
  type: Schema.String,
  /**
   * The challenge rating as written: `"1/4"` exists (`data.js:38`), so this is
   * a string and not a number.
   */
  cr: Schema.String,
  /**
   * The same rating as something a database can order by — `"1/4"` sorts at
   * `0.25`. Derived from `cr` on write when the client does not say otherwise,
   * so the two cannot disagree by accident; overridable for a rating the parser
   * does not know.
   */
  crSort: Schema.Finite,
  ac: Schema.Int,
  hp: Schema.Int,
  /** `["Marsh", "Cave"]` — the filter chips on `Bestiary.jsx:32-35`. */
  environments: Schema.Array(Schema.String),
  legendary: Schema.Boolean,
  statBlock: StatBlock,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * `"Humanoid"` and `"Small"` are open vocabularies, unlike `Encounter.difficulty`.
 *
 * The difference is not taste: `CampaignHome.jsx:13` *branches* on the
 * difficulty strings, so an unrecognised one changes how the card renders and
 * closing the set is what keeps that total. Nothing branches on a creature's
 * type or size — `Bestiary.jsx:46` prints the type verbatim — and homebrew
 * types are a thing people really have.
 *
 * Capitalised for the same reason `difficulty` is: this is the DM's own
 * vocabulary, rendered as written, and lower-casing it here would mean a
 * display map existing only to undo the change.
 */
const shortLabel = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 40));

const ac = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));
const hp = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));
const crSort = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1000 }));

/**
 * An open vocabulary in a `text[]`, for the same reason `Encounter.tags` is —
 * the environment chips are a fixed four in the prototype (`Bestiary.jsx:4`)
 * and a DM's own list in reality.
 */
const environments = Schema.Array(shortLabel).check(Schema.isLengthBetween(0, 16));

/**
 * Everything a creature is, as a client may state it — and the whole of what a
 * **Library** entity has, because a Library entity is in no campaign and
 * `visibility` is a statement about players at a table.
 *
 * Named and spread rather than restated, exactly as `LibraryFilter` is spread
 * into `CreatureFilter`: a field added to a monster arrives on both paths, and
 * the one thing that differs between them is the one thing that means something
 * different. Neither carries `origin`, on any path, so a client cannot claim
 * `system` or `assistant` provenance — only `repo/Proposals.ts` can, out of a
 * turn the server itself stored, and only `bestiary/import.ts` writes `system`.
 */
const LibraryCreatureCreate = {
  name: Schema.NonEmptyString,
  size: Schema.optional(shortLabel),
  type: shortLabel,
  /** Required, because every bestiary card renders `CR {cr}`. `"—"` is a rating. */
  cr: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 20)),
  /** Omit and the server derives it from `cr`. */
  crSort: Schema.optional(crSort),
  ac,
  hp,
  environments: Schema.optional(environments),
  legendary: Schema.optional(Schema.Boolean),
  /** Omit and the column default — an empty document — decides. */
  statBlock: Schema.optional(StatBlock),
} as const;

/**
 * What a Library entity is created from.
 *
 * **No `visibility`, and its absence is the decision.** A row's visibility says
 * which of a campaign's players may read it, and a Library entity is in no
 * campaign — there are no players to narrow it against, and the copy `derive`
 * makes into a campaign deliberately takes the column default rather than
 * inheriting one, so a value set here would reach nothing and change nothing. A
 * control with no reader is the shape this contract refuses everywhere else.
 */
export const CreatureLibraryCreate = Schema.Struct(LibraryCreatureCreate);
export type CreatureLibraryCreate = typeof CreatureLibraryCreate.Type;

export const CreatureCreate = Schema.Struct({
  ...LibraryCreatureCreate,
  visibility: Schema.optional(Visibility),
});
export type CreatureCreate = typeof CreatureCreate.Type;

const LibraryCreatureUpdate = {
  name: Schema.optional(Schema.NonEmptyString),
  size: Schema.optional(Schema.NullOr(shortLabel)),
  type: Schema.optional(shortLabel),
  cr: Schema.optional(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 20))),
  crSort: Schema.optional(crSort),
  ac: Schema.optional(ac),
  hp: Schema.optional(hp),
  environments: Schema.optional(environments),
  legendary: Schema.optional(Schema.Boolean),
  statBlock: Schema.optional(StatBlock),
} as const;

/** The same fields again, all optional — a Library entity's PATCH. */
export const CreatureLibraryUpdate = Schema.Struct(LibraryCreatureUpdate);
export type CreatureLibraryUpdate = typeof CreatureLibraryUpdate.Type;

export const CreatureUpdate = Schema.Struct({
  ...LibraryCreatureUpdate,
  visibility: Schema.optional(Visibility),
});
export type CreatureUpdate = typeof CreatureUpdate.Type;

/**
 * How the bestiary list is ordered. `Bestiary.jsx:22-24` offers exactly these
 * three, labelled "Sort: CR" / "Sort: Name" / "Sort: Recent".
 *
 * Lower-case on the wire, unlike `difficulty` or `type`: the client writes the
 * label, so nothing here is rendered verbatim.
 */
export const CreatureSort = Schema.Literals(["cr", "name", "recent"]);
export type CreatureSort = typeof CreatureSort.Type;

/**
 * Which half of the corpus to list.
 *
 * `Site.jsx:86` — "Save your own creatures next to the official ones" — so
 * `all` is the default and the two halves are one list. The other two exist
 * because "my creatures" and "the official ones" are the questions a DM
 * actually asks, and because a filter that names the split is what makes the
 * global-versus-campaign boundary testable from the outside.
 */
export const CreatureScope = Schema.Literals(["all", "campaign", "system"]);
export type CreatureScope = typeof CreatureScope.Type;

/**
 * The controls that mean the same thing whether the list is a campaign's
 * bestiary or the shared Library — searching, narrowing by environment, and
 * ordering.
 *
 * `q` matches the way the prototype searches — `name.toLowerCase().includes(q)`
 * (`Bestiary.jsx:11-12`) — *and* the stat block's full text, so "nimble escape"
 * finds the Goblin Boss. Substring alone would miss the trait; full text alone
 * would miss "gob" halfway through typing "Goblin".
 *
 * Named and spread rather than restated, so a control added to one list arrives
 * in the other. The two lists are one screen's worth of behaviour read from two
 * places, and a search box that means something different at `/library` than it
 * does inside a campaign is the shape this avoids.
 */
export const LibraryFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  /** Any-of, like the toggle row: a creature matches if it lives in any of them. */
  environments: Schema.optional(environments),
  sort: Schema.optional(CreatureSort),
} as const;

/** The decoded Library filter, as a repository sees it. */
export type LibraryFilterValues = typeof LibraryFilterValues.Type;
const LibraryFilterValues = Schema.Struct(LibraryFilter);

/**
 * `Bestiary.jsx`'s three controls, as query parameters.
 *
 * `scope` is the one the Library has no use for. Every row that list can return
 * is `campaign_id is null` — the bundle and the reader's own entities — so
 * `scope: "campaign"` would name nothing and `scope: "system"` would be the only
 * narrowing left, which is `origin` read as a filter. The split a Library screen
 * actually wants is *mine* versus *the bundle*, and every row already carries
 * `accountId`, so it is a fact on the row rather than a parameter that could
 * disagree with one.
 */
export const CreatureFilter = {
  ...LibraryFilter,
  scope: Schema.optional(CreatureScope),
} as const;

/**
 * The decoded filter, as a repository sees it. Derived from the same fields the
 * endpoint declares, so a filter added to one arrives in the other.
 */
export type CreatureFilterValues = typeof CreatureFilterValues.Type;
const CreatureFilterValues = Schema.Struct(CreatureFilter);
