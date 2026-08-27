import { Schema } from "effect";
import { AccountId, CampaignId, CharacterOptionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { AbilityIncrease, AbilityKey } from "./Ruleset.js";

/**
 * A piece a character is **built from** — a class, a species or a background —
 * as a row a campaign can hold and an account can author.
 *
 * ### One table with a `kind`, not one table per piece
 *
 * The precedent is this project's own and is on the nose: *"one `note` table
 * with a `kind` and an optional attachment, not a `read_aloud` column on three
 * tables each with its own visibility rule to get wrong"*. **It has now been
 * cashed once**: the background arrived as a new `kind` value, one widened
 * check constraint (`0018`) and a third member of the unions below — no
 * migration of any table's columns, no repository, no API group and no screen.
 * A subclass, much later, is the same shape again — though it needs a parent
 * pointer and a containment rule this table does not have, which is why it is
 * held.
 *
 * ### The ownership model is the Library's, unchanged and unextended
 *
 * A `character_option` row is the campaign's, or an account's, or nobody's,
 * exactly as a `creature` is:
 *
 * | row              | `campaignId` | `accountId` | who may write it   |
 * | ---------------- | ------------ | ----------- | ------------------ |
 * | the bundle       | null         | null        | **nobody**         |
 * | a Library entity | null         | an account  | that account       |
 * | a campaign copy  | a campaign   | null        | that campaign's DM |
 *
 * That is not a coincidence and it was not assumed: the four predicates that
 * carry it (`libraryRowReadable`, `libraryRowWritable`, `corpusRowReadable`,
 * `copyableIntoCampaign`) are already generic over a table name, and were
 * called **unmodified** against a second table with this shape before any of
 * this was built. No new predicate, no new base case, no change to
 * `repo/visibility.ts` at all.
 *
 * ### But a class is not a monster, and one difference decides the design
 *
 * A monster is used *in a campaign*; a class is used *by a character*, and a
 * character may be a **player's**. `libraryRowReadable` compares `account_id`
 * to the *reader's* account, so a player can never read their DM's Library.
 * **A homebrew class must therefore be copied into the campaign before a player
 * can pick it** — the copy is not a convenience, it is the only thing that
 * makes the feature work at all.
 *
 * ### Propagation stops at every hop, deliberately
 *
 * ```
 * Library original ──derive──▶ campaign copy ──seed at creation──▶ character row
 *      edits stop here            edits stop here                   edits stop here
 * ```
 *
 * Hop 1 is the creature rule verbatim: a copy is a **snapshot**, nothing is
 * ever read through `derivedFrom`, and editing the original afterwards does not
 * reach the copy. Hop 2 is the captain's shipped *seed at creation, never
 * recompute* (`Ruleset.ts`) — a character keeps the label and the numbers it
 * was made with.
 *
 * A DM who wants an edit to reach the table edits the **campaign copy**, so
 * every character made after that gets it, and tells their players. There is no
 * recompute-all-sheets and there must not be one: it would overwrite `ac` and
 * `hpMax` values players typed by hand, and would have no way to tell an
 * intentional number from a stale seed.
 *
 * ### What is a column and what is the document
 *
 * The rule `character` and `creature` both follow — *a field earns a column
 * when something in the product reads it*: a screen filters or sorts on it, a
 * predicate uses it, the seed copies it. Nothing filters classes by hit die;
 * `seedFor` reads it after fetching one row. So `kind` and `name` are columns
 * (the vocabulary is looked up by both) and everything that differs between a
 * class, a species and a background is one `jsonb` document. That rule is what
 * made the third kind cost no column: a background's ability score increases
 * are read once, by the seed, out of a row already in hand.
 */

/**
 * Which piece of a character this row is.
 *
 * Closed, and lower-case on the wire, because the product **branches** on it:
 * the two pickers on the create form ask for one kind each and the seed reads a
 * different field out of each document. That is `Encounter.difficulty`'s test
 * for a closed vocabulary, met — unlike a creature's `type`, which nothing
 * branches on and which is therefore open.
 *
 * `background` is the third and arrived on its own, for the reason it was held
 * back from the first: it is the entity that changes a 2024 character's numbers
 * most, because that ruleset moved the ability score increases off the species
 * and onto it. So it changes the **seed** — `seedFor` applies it before it
 * reads a modifier — where a class and a species only add to what the seed
 * reads.
 *
 * `subclass` and `feat` are still not here. A subclass is a *child* of a class
 * and needs a containment rule this table has none of; a feat is read by
 * nothing in the product, which is the table-with-no-reader this codebase
 * refuses everywhere.
 */
export const OptionKind = Schema.Literals(["class", "species", "background"]);
export type OptionKind = typeof OptionKind.Type;

/**
 * A one-line summary, on any of the three documents.
 *
 * The **only** prose any body carries, and it is here because a homebrew
 * class with no way to say what it is would be a name and two numbers. Feature
 * text — Rage, Sneak Attack, a species' traits — is deliberately absent from
 * *the bundle*, by the decision in `AGENTS.md` § "The bundle carries no
 * third-party prose": this project writes what it ships, and nobody has written
 * that prose. A DM writing feature text into their own homebrew is unaffected —
 * that is their content in their campaign.
 */
const summary = Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 500)));

/**
 * A hit die as its number of faces: `10` for a d10.
 *
 * Bounded rather than closed to the six real dice, which was the call to make
 * either way. A closed set would be the create form's pickers' argument applied
 * one level down — but the six dice are the *frame* of 5e rather than its
 * content, and a table that plays a d7 class is refusing nothing anybody needs
 * by being allowed to. The bound is a sanity rail, not a vocabulary.
 */
const hitDie = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));

/**
 * Which ability modifiers are added to 10 when nothing is worn.
 *
 * A list rather than a boolean, and this is `Ruleset.ts`'s reason unchanged:
 * **Barbarian** is `10 + DEX + CON` and **Monk** is `10 + DEX + WIS`. A formula
 * that assumed `10 + DEX` would be quietly wrong for exactly the two players
 * most likely to notice — and a homebrew class is more likely to have an
 * unusual one, not less.
 *
 * Empty is legal and means `10` flat. Duplicates are not refused by the schema
 * and would double a modifier; the editor offers each ability once, which is
 * where that is prevented.
 */
const unarmouredAc = Schema.Array(AbilityKey).check(Schema.isLengthBetween(0, 6));

/**
 * The class document — **only the parts that reach one of the three seeded
 * values**, plus the one sentence that says what the class is.
 *
 * There is no spell list here, no proficiency list, no subclass level and no
 * saving throws, for `Ruleset.ts`'s own reason: *holding a character does not
 * make this a character builder — that is a different product, and the first
 * thing it owes anyone is errata.*
 */
export const ClassBody = Schema.Struct({
  /** `8` for a d8. Level-1 hit points are this at its maximum, plus CON. */
  hitDie,
  unarmouredAc,
  summary,
});
export type ClassBody = typeof ClassBody.Type;

/**
 * The species document.
 *
 * One number, and for nine of the ten bundled species that number is zero. That
 * is the 2024 ruleset showing through rather than a thin model: species there
 * carry no ability score increases and no subraces, so exactly one of them —
 * **Dwarf**, through Dwarven Toughness — touches hit points, armour class or
 * level. Homebrew species are the reason it is a field at all rather than a
 * special case.
 */
export const SpeciesBody = Schema.Struct({
  /**
   * Extra hit points **per level**, so `1` for a dwarf and `0` for everyone
   * else. Per level rather than flat because that is what Dwarven Toughness
   * says, and because a seed at level 1 that quietly meant *flat* would be
   * wrong the first time somebody seeded a level this does not yet seed.
   */
  hpPerLevel: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
  summary,
});
export type SpeciesBody = typeof SpeciesBody.Type;

/**
 * The background document.
 *
 * ### It is the only one of the three that moves an ability score
 *
 * The 2024 ruleset took the ability score increases off the species and put
 * them here, which is what made this a slice of its own rather than a row type
 * added beside the other two: a class contributes a hit die and a species hit
 * points per level, and both are read straight into a number, where a
 * background moves the six cells and lets the armour class and the hit points
 * follow. `seedFor` applies it first and hands the moved cells back.
 *
 * ### `abilityIncreases` is required, and `[]` is the ordinary answer
 *
 * Required rather than optional, and that is structural rather than stylistic:
 * `OptionUpdate.body` is a `Schema.Union` of the three documents and
 * `Schema.Union` takes the **first member that matches**, so a body with no
 * required key at all would swallow a class document whole (measured: reordered
 * in front, `{hitDie: 8, unarmouredAc: ["DEX"]}` decodes to `{}`). With one
 * required key each the three are mutually exclusive by shape, `repo/Options.ts`'s
 * `bodyKind` can tell them apart, and the union's order stops mattering.
 *
 * The cost is that `[]` is a value rather than an absence, and it is the value
 * every bundled background carries — see `systemOptions.ts`, which explains
 * why. Both screens render it as *"no ability score increases written down"*,
 * which is what it means: nobody has said, and a DM saying so is one edit away.
 */
export const BackgroundBody = Schema.Struct({
  /**
   * What this background adds to a new character's scores — `+2 CON, +1 WIS`.
   *
   * Empty for all sixteen bundled rows: this project ships names and numbers it
   * has written, and a background's mechanical grants are named out by the
   * bundle-licensing decision (`AGENTS.md` § "The bundle carries no third-party
   * prose"). A table that plays them writes its own background, where the
   * numbers are the DM's.
   */
  abilityIncreases: Schema.Array(AbilityIncrease).check(Schema.isLengthBetween(0, 6)),
  summary,
});
export type BackgroundBody = typeof BackgroundBody.Type;

/**
 * Everything an option carries whatever kind it is — the ownership pair, the
 * provenance tail, and the name the vocabulary is looked up by.
 */
const optionFields = {
  id: CharacterOptionId,
  /**
   * The campaign that holds this **copy**, or `null` for a row in no campaign —
   * which is either a Library original or the bundle. `accountId` tells those
   * two apart.
   */
  campaignId: Schema.NullOr(CampaignId),
  /**
   * The account whose Library this original is in, or `null` for a campaign
   * copy and for the bundle.
   *
   * On the wire because it is the ownership fact, and reading it is how a
   * screen knows whether a row is its reader's to edit. That question must not
   * be answered from `origin`, which says where content came from and never who
   * may write it.
   */
  accountId: Schema.NullOr(AccountId),
  /**
   * The option this one was copied from.
   *
   * Provenance and never an access path: nothing is read through it, it names a
   * row the actor could already see when the copy was made, and it survives
   * that row's deletion as `null`. That last part is what a snapshot means —
   * deleting a Library original leaves every campaign's copy standing.
   */
  derivedFrom: Schema.NullOr(CharacterOptionId),
  /**
   * What the DM calls it, and what a `character` row stores.
   *
   * **The label is the whole of the link between a character and an option**,
   * and deliberately the only one: `character.class_name` stays free text and
   * gains no `class_id`, because nothing reads a class after a character
   * exists. A stored key beside the label would be a second answer to a
   * question the label already answers, and the two would disagree the first
   * time somebody edited one.
   */
  name: Schema.String,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
} as const;

export const ClassOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("class"),
  body: ClassBody,
});
export type ClassOption = typeof ClassOption.Type;

export const SpeciesOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("species"),
  body: SpeciesBody,
});
export type SpeciesOption = typeof SpeciesOption.Type;

export const BackgroundOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("background"),
  body: BackgroundBody,
});
export type BackgroundOption = typeof BackgroundOption.Type;

/**
 * A class, a species or a background — **a union discriminated on `kind`, not
 * one record with a nullable `hitDie`, a nullable `hpPerLevel` and a nullable
 * list of increases.**
 *
 * The same call `SearchHit` and `PlayerCombatant` make, for the same reason:
 * `hitDie` exists only on a class and `hpPerLevel` only on a species, and a
 * record carrying all three would let a species row claim a hit die that
 * nothing would ever read. Tying the document to the `kind` in the type is what
 * makes the seed's `switch` total — and what made adding the background a
 * compile error everywhere it had to be handled rather than a silent absence.
 */
export const CharacterOption = Schema.Union([ClassOption, SpeciesOption, BackgroundOption]);
export type CharacterOption = typeof CharacterOption.Type;

/** A class row, narrowed — the shape `seedFor` reads a hit die out of. */
export const isClassOption = (option: CharacterOption): option is ClassOption =>
  option.kind === "class";

/** A species row, narrowed. */
export const isSpeciesOption = (option: CharacterOption): option is SpeciesOption =>
  option.kind === "species";

/** A background row, narrowed — the shape the seed moves the six cells from. */
export const isBackgroundOption = (option: CharacterOption): option is BackgroundOption =>
  option.kind === "background";

/**
 * A stored label, read back as the option it names — **case-insensitively, on
 * the label alone, and with no fuzzy matching.**
 *
 * This is `Ruleset.ts`'s `classFor` rule, moved rather than restated: it used
 * to match against a module-level map of twelve, and the vocabulary is a
 * campaign's now. What has not changed is the refusal at the bottom of it — a
 * prefix or a contains rule would read `"Circle of the Moon Druid"` as a druid
 * and `"Half-orc"` as an orc, *which is a guess written into a number somebody
 * reads out at the table*. That holds harder under homebrew, because a campaign
 * may genuinely have a "Moon Druid" that is a different class.
 *
 * So an existing free-text label simply resolves to nothing, keeps its text,
 * renders exactly as it did, and is one ordinary edit away from a label that
 * does resolve.
 */
export const optionNamed = (
  options: ReadonlyArray<CharacterOption>,
  kind: OptionKind,
  label: string | null | undefined,
): CharacterOption | undefined => {
  const wanted = (label ?? "").trim().toLowerCase();
  if (wanted === "") return undefined;
  return options.find(
    (option) => option.kind === kind && option.name.trim().toLowerCase() === wanted,
  );
};

/**
 * How long a name may be.
 *
 * Shorter than a creature's, because this one is rendered inside a `Select`
 * trigger beside a level box on the create form — and because a class is a word
 * or two. `NonEmptyString` at the bottom, so `""` is refused rather than
 * becoming a row nobody can pick.
 */
const optionName = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 60));

/**
 * What an option is authored from — **in the Library, which is the only place
 * one is authored.**
 *
 * There is deliberately no `POST /campaigns/:c/options`. The captain's second
 * statement is that *authoring happens in the Library*; a campaign row created
 * directly would be "copied state" with no original behind it, which is the one
 * thing about the creature endpoints that already contradicts the model
 * (`AGENTS.md` names it as the open question). Starting a second table with the
 * contradiction already in it would be a choice, not an inheritance.
 *
 * **No `visibility`**, and its absence is the decision — `CreatureLibraryCreate`
 * says the same at length: a row's visibility says which of a *campaign's*
 * players may read it, and a Library original is in no campaign.
 *
 * The body is a union on `kind`, so a class create cannot carry `hpPerLevel`
 * and a species create cannot carry a hit die.
 */
export const OptionLibraryCreate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("class"), name: optionName, body: ClassBody }),
  Schema.Struct({ kind: Schema.Literal("species"), name: optionName, body: SpeciesBody }),
  Schema.Struct({ kind: Schema.Literal("background"), name: optionName, body: BackgroundBody }),
]);
export type OptionLibraryCreate = typeof OptionLibraryCreate.Type;

/**
 * A PATCH of a Library original, or of a campaign's copy.
 *
 * **`kind` is not on it**, and cannot be: a class that became a species would
 * carry a document its own column contradicts, and every character already made
 * from it would name a row that is no longer the thing they picked. The kind is
 * chosen once, when the row is authored, and is what the row *is*.
 *
 * The body is whole rather than a patch of its own, exactly as
 * `CreatureUpdate.statBlock` is: a document with two fields has nothing to gain
 * from a per-key grain, and a partial body would need a merge rule that could
 * disagree with the schema.
 */
const optionUpdateFields = {
  name: Schema.optional(optionName),
  /**
   * The whole document, and it must match the row's own `kind` — which the
   * repository checks, because a union here cannot see the row it is patching.
   *
   * The three members are mutually exclusive by shape: each has exactly one
   * required key the other two lack (`hitDie`, `hpPerLevel`, `abilityIncreases`),
   * which is why `BackgroundBody.abilityIncreases` is required and why the order
   * of this list carries no meaning. `repo/Options.ts`'s `bodyKind` is the one
   * reader of that property.
   */
  body: Schema.optional(Schema.Union([ClassBody, SpeciesBody, BackgroundBody])),
} as const;

export const OptionLibraryUpdate = Schema.Struct(optionUpdateFields);
export type OptionLibraryUpdate = typeof OptionLibraryUpdate.Type;

/**
 * The same again, plus the one thing a campaign row has that an original does
 * not: whether the players at that table can see it.
 *
 * **This is the field the whole feature turns on.** `corpusRowReadable` ends in
 * `isDm OR visibility = 'shared'`, so a class the DM has not shared is a class
 * no player can pick. For a monster that is exactly right and is the point; for
 * a class it is friction, and the answer is a **visible screen-level choice**
 * rather than a changed column default — see `OptionDialog`, which sends
 * `shared` out loud the way `CharacterDialog` sends `dm` out loud.
 */
export const OptionUpdate = Schema.Struct({
  ...optionUpdateFields,
  visibility: Schema.optional(Visibility),
});
export type OptionUpdate = typeof OptionUpdate.Type;

/**
 * What `derive` may change on the way in — the same fields, all optional.
 *
 * Deriving with an empty payload is *use it as it is*, which is what the copy
 * control sends. Everything absent is taken from the source, except
 * `visibility`, which is **not copied**: a copy is a new row and a new row fails
 * closed, so it takes the column default unless the payload names one.
 */
export const OptionDerive = OptionUpdate;
export type OptionDerive = typeof OptionDerive.Type;

/**
 * Which kinds a list answers.
 *
 * A **query filter rather than a path segment**, which is a departure from the
 * design sketch's `/options/:kind` and is a routing fact rather than a
 * preference: `/options/class` and `/options/:optionId` are the same shape, so
 * one of them would have to win. Omitted means every kind, which is what both
 * readers actually want — the create form needs classes, species *and*
 * backgrounds, and the Rules screen draws all three — so the common case is one
 * request rather than three.
 */
export const OptionFilter = {
  kind: Schema.optional(OptionKind),
} as const;

/** The decoded filter, as a repository sees it. */
export type OptionFilterValues = typeof OptionFilterValues.Type;
const OptionFilterValues = Schema.Struct(OptionFilter);

/**
 * How many options one list may return.
 *
 * **A vocabulary, not a corpus, so the lists are not paged** — the same call the
 * pagination work made about a campaign's members and a night's checklist: they
 * are bounded by what they hang off. A picker with a *Show more* under it is a
 * picker that cannot be read in one glance, and a cursor is a position in a
 * corpus somebody is browsing.
 *
 * The cap is a sanity bound. A campaign with more than this many classes has a
 * different problem, and it is the same shape as the bestiary's environment
 * vocabulary limit.
 */
export const OPTION_LIMIT = 200;
