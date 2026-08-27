import type {
  CampaignMembership,
  CharacterOption,
  CharacterOwnCreate,
  CharacterSeed,
  CharacterSheet,
  SheetIdentity,
} from "@taverns/api";
import {
  emptyCharacterSheet,
  increasesLine,
  optionNamed,
  seedFor,
  STARTING_LEVEL,
} from "@taverns/api";
import { abilitiesFrom, abilityDrafts, badScores, type AbilityDraft } from "./abilities";

/**
 * The two decisions the create form makes that are not rendering — **which
 * tables a character of your own may go into, and what the payload says.**
 *
 * Both are here rather than in the screen for the reason `chronicle/fight.ts`
 * and `characters/live.ts` are separate files: each has a branch that renders
 * perfectly plausible output when it is wrong. A picker offering the wrong
 * table looks like a picker; a payload sending `""` where it means *absent*
 * looks like a save. Neither fails loudly, so both are pinned by
 * `create.test.ts`.
 */

/** All three match `Character.ts`'s own checks, so the sentence beats the schema to it. */
export const MAX_AC = 40;
export const MAX_HP = 10_000;
export const MAX_LEVEL = 100;

/**
 * The tables a player may write a character of their own into.
 *
 * **`role === "player"` and nothing else**, which is the mode rather than the
 * endpoint talking. `ensureCampaignReadable` would let a DM through at their own
 * table — `isDm` is a disjunct of `campaignReadable` — and the server documents
 * that as harmless. It is still not what this control is for: the pill is a
 * *mode*, so a table you run has no player screen to be on, and offering one
 * here would put a character of your own at a table where the way to write one
 * is `campaign/CharacterDialog.tsx`.
 *
 * An archived table is already absent, because `GET /me/campaigns` is the live
 * shelf and `repo/Memberships.ts` is the one place that clause is written.
 */
export const tablesForNewCharacter = (
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> =>
  memberships.filter((membership) => membership.role === "player");

/** `""` ⇄ absent. A blank number field is "I have not filled this in". */
const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

/** The same rule the schema applies, said in a sentence first. */
const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

/** What the form holds, before any of it is a payload. */
export interface CharacterDraft {
  readonly name: string;
  readonly playerName: string;
  readonly level: string;
  /**
   * The **name** of a class or a species this campaign offers, or `""` for *not
   * picked yet*.
   *
   * Strings rather than an id, and that is the design rather than a shortcut:
   * `character.class_name` is what a character stores, and the label is the
   * whole of the link between a row and the option it was made from. A stored
   * id beside it would be a second answer to a question the label already
   * answers, and `character.descriptor` — a generated column — could not read
   * through one anyway.
   *
   * What makes them structured is the **picker**, which offers this campaign's
   * vocabulary and nothing else. It used to offer `Ruleset`'s global ten and
   * twelve; a campaign can have its own now, so the list is a read.
   */
  readonly species: string;
  readonly className: string;
  /**
   * The **name** of a background this campaign offers, or `""` for *not picked
   * yet* — the third picker, and the only one of the three that moves an
   * ability score.
   *
   * It is a string like the other two and for the same reason, but it lands
   * somewhere else: a character's background is `sheet.identity.background`, a
   * document key, where the class and the species are columns. Nothing in the
   * product filters or sorts on it and it is not one of the three the generated
   * `descriptor` column is built from, so it earned no column — the same call
   * `Character.ts` makes about `subclass` in as many words.
   */
  readonly background: string;
  readonly ac: string;
  readonly hpMax: string;
  readonly sheetUrl: string;
  readonly notes: string;
  /**
   * The six cells, as the shared editor holds them —
   * `apps/web/src/characters/abilities.ts`'s own type, not a second one.
   *
   * They are on the *draft* rather than beside it because they are an input to
   * {@link seededDraft}: constitution reaches the hit points and dexterity the
   * armour class, so a set of scores that lived outside the draft would be a
   * second piece of state the seed had to be handed separately, which is one
   * caller away from being forgotten.
   *
   * **Blank on an empty form, and nothing fills them in.** See
   * {@link emptyDraft}.
   */
  readonly abilities: ReadonlyArray<AbilityDraft>;
}

export const emptyDraft: CharacterDraft = {
  name: "",
  playerName: "",
  /**
   * **Level 1, before anything is picked** — the captain's third decision, and
   * a constant rather than something {@link seededDraft} fills in.
   *
   * A level is chosen in 5e, not calculated, so it does not depend on the class
   * and there is no state in which a new character has no level. `STARTING_LEVEL`
   * is the same constant the accept path uses for a drafted one.
   */
  level: String(STARTING_LEVEL),
  species: "",
  className: "",
  background: "",
  ac: "",
  hpMax: "",
  sheetUrl: "",
  notes: "",
  /**
   * **Six blank cells, and the standard array is a press rather than a
   * default** — the one judgement call in this slice, so it is written down.
   *
   * The drawing opens on the standard array (`CharacterCreate.jsx:157`), and
   * there it is opening on a set Hob has *assigned to the description*. This
   * fork is the one the drawing itself calls *Fill it in myself*: there is no
   * description to fit, so a pre-filled array would land in the order the cells
   * are drawn — STR 15, DEX 14, CON 13 for everybody, including the wizard.
   *
   * That is worse than blank in both directions. It writes six choices nobody
   * made into a document, which is the one thing no control in this product
   * does; and it does not even close the gap it would be there to close, since
   * Hob ranks a barbarian's constitution first and a draw-order array does not
   * — a Dwarf Barbarian would seed 14 hit points against Hob's 15 and look
   * *nearly* right, which is the hardest kind of wrong to notice. Pressing
   * *Standard array* and putting the 15 where it belongs reproduces Hob's
   * numbers exactly, and skipping the whole thing still creates a character.
   */
  abilities: abilityDrafts([]),
};

/**
 * Which of the two seeded boxes the player has typed in for themselves.
 *
 * The seed has to be *re-applied* when the class or species changes — a player
 * who picks Druid, sees 8, then changes their mind to Barbarian must not be
 * left holding a druid's hit points — and it must equally never overwrite a
 * number they typed. Remembering which boxes they have touched is the only way
 * to have both, and it is a set rather than two booleans so a third seeded
 * field costs one word.
 */
export type SeededField = "ac" | "hpMax";

/**
 * What the player is told before anything is sent.
 *
 * The contract catches all of it on its own — the derived client encodes
 * through the same schema the handler decodes with, so a bad payload fails
 * locally and never reaches the network. But `Expected a value between 0 and 40
 * at ["ac"]` is a sentence for whoever wrote the schema, so these come first and
 * `SaveFailure` is the backstop. `CharacterDialog` states the same rule for the
 * DM's form; the numbers are shared with it through `Character.ts`'s checks
 * rather than through this file.
 */
export interface DraftProblems {
  readonly name?: string;
  readonly level?: string;
  readonly ac?: string;
  readonly hpMax?: string;
  readonly sheetUrl?: string;
  /**
   * A score outside 1–30, which the editor refuses to hand back — so this is a
   * backstop rather than the sentence a player normally reads.
   *
   * It is here anyway because the scores are the one part of this draft that
   * arrives through a control the form does not own: `AbilityScoresDialog`
   * checks them, and a second entry point that did not would otherwise send a
   * document the contract has no range check on (`Ability.score` is a
   * `NonEmptyString`, and `"400"` is one).
   */
  readonly abilities?: string;
}

export const problemsIn = (draft: CharacterDraft): DraftProblems => {
  const problems: {
    name?: string;
    level?: string;
    ac?: string;
    hpMax?: string;
    sheetUrl?: string;
    abilities?: string;
  } = {};
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);

  if (draft.name.trim() === "") problems.name = "Give them a name.";
  if (level === undefined) problems.level = "A level is a whole number.";
  else if (level !== null && (level < 1 || level > MAX_LEVEL)) {
    problems.level = `Between 1 and ${String(MAX_LEVEL)}.`;
  }
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${String(MAX_AC)}.`;
  if (hpMax === undefined) problems.hpMax = "Hit points are a whole number.";
  else if (hpMax !== null && (hpMax < 0 || hpMax > MAX_HP)) {
    problems.hpMax = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  }
  if (draft.sheetUrl.trim() !== "" && !isWebUrl(draft.sheetUrl.trim())) {
    // The schema refuses anything else, and this is why: the link is rendered as
    // an `href`, and a `javascript:` URL in one is how a text column becomes an
    // exploit.
    problems.sheetUrl = "A link starting http:// or https://.";
  }
  if (badScores(draft.abilities).length > 0) {
    problems.abilities = "An ability score is a whole number, 1 to 30.";
  }
  return problems;
};

export const refused = (problems: DraftProblems): boolean => Object.keys(problems).length > 0;

/**
 * The draft with its two seeded numbers filled in — **called when a pick
 * changes, and never again.**
 *
 * This is the client half of the captain's *seed at creation, never recompute*
 * decision, and the shape is what enforces it: it is a pure function of a draft
 * and it is wired to the two pickers alone. There is no effect watching the
 * form, nothing on the sheet calls it, and the row it eventually writes carries
 * plain integers with no rule attached — so a player who levels up, buys plate
 * or has their constitution drained keeps the numbers they are actually
 * playing, which is precisely what a locked derived value would take away.
 *
 * **The vocabulary is the campaign's**, which is the only thing about this that
 * homebrew changed. `seedFor` takes entries rather than labels now, so the
 * caller resolves the pick against the list its own picker was built from —
 * and a campaign's own class seeds exactly as a bundled one does, because
 * nothing in the arithmetic asks where an entry came from.
 *
 * **It reads the draft's own ability scores**, which is what closed the gap
 * between the two create paths. Hob assigns the standard array to the ranking it
 * chose and resolves the seed against it, so a drafted Dwarf Barbarian came back
 * on 15 hit points and armour class 13 while the same character filled in here
 * came back on 13 and 10 — both arithmetically right, and disagreeing, because
 * only one of them had scores to read. `seedFor` is unchanged; what changed is
 * that this caller now has something to hand it.
 *
 * A draft with no scores set still seeds from a bare 10 and the class hit die,
 * and that is deliberately still reachable: ability scores are not required, so
 * a player who wants to get in now and fix it later gets the same honest
 * level-1 answer the form has always given them, with the form saying so beside
 * the two boxes.
 *
 * **The re-seed is still only ever a pick or a score**, never a watcher. It runs
 * when the player changes one of the four things the seed reads and at no other
 * time, which is what keeps *seed at creation, never recompute* a property of
 * the wiring: once the row exists nothing calls this, and editing the same six
 * cells on the shipped sheet moves the modifier beside them and nothing else.
 *
 * **The background is the fourth, and it is the one that moves the scores.**
 * The 2024 ruleset put the ability score increases on it, so `seedFor` raises
 * the cells before it reads a modifier — which is why the two boxes move when a
 * background is picked, and why {@link payloadFrom} sends the *seed's* cells
 * rather than the draft's. What this function still does not do is write the
 * raised scores back into `draft.abilities`: doing so would mean un-applying
 * the previous background when the player changes their mind, which is exactly
 * the recompute this whole design refuses. The boxes hold what the player
 * typed; the seed holds what gets written down.
 */
export const backgroundIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterOption | undefined => optionNamed(options, "background", draft.background);

/**
 * What a picked background adds, in words — or `undefined` when there is
 * nothing to say.
 *
 * **This exists because the background is the one pick that changes a number
 * the player typed.** A class and a species fill in two boxes the form draws;
 * a background raises the ability scores themselves, so the sheet that is
 * created says `CON 15` where the editor said `CON 13`. That has to be on
 * screen before the save, not discovered on the sheet afterwards.
 *
 * `undefined` for the bundled sixteen, which grant nothing at all — see
 * `systemOptions.ts` — so the line appears only where something really moves.
 */
export const backgroundNote = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): string | undefined => {
  const picked = backgroundIn(draft, options);
  if (picked?.kind !== "background") return undefined;
  const line = increasesLine(picked.body.abilityIncreases);
  return line === ""
    ? undefined
    : `${picked.name} adds ${line}, on top of the scores above — that is what their sheet will say.`;
};

/**
 * The three picks resolved and the seed run — **one call, two readers.**
 *
 * {@link seededDraft} writes the two boxes from it and {@link payloadFrom}
 * writes the six cells from it, and they must agree: the armour class in the
 * box was computed from cells with the background applied, so a payload that
 * sent the cells *without* it would ship a sheet whose own numbers do not
 * account for the armour class printed beside them. One resolution, called at
 * both ends, is what makes that impossible rather than careful.
 *
 * It is a pure function of a draft and a vocabulary, so calling it twice is not
 * two answers — and neither call happens after the row exists, which is what
 * *seed at creation, never recompute* means.
 */
export const seedOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterSeed => {
  const classOption = optionNamed(options, "class", draft.className);
  const speciesOption = optionNamed(options, "species", draft.species);
  const backgroundOption = backgroundIn(draft, options);
  return seedFor({
    // The `kind` guard is what the union buys: a class row's document has a hit
    // die and a species row's does not, so there is no shape in which the wrong
    // one could be read as the right one.
    classEntry: classOption?.kind === "class" ? classOption.body : undefined,
    speciesEntry: speciesOption?.kind === "species" ? speciesOption.body : undefined,
    backgroundEntry: backgroundOption?.kind === "background" ? backgroundOption.body : undefined,
    // The cells as the player typed them, *before* the background — `seedFor`
    // applies it and hands the raised cells back on `seed.abilities`, which is
    // what the payload writes. A cell with no score is dropped here and cannot
    // mean one thing in the box and another on the wire.
    abilities: abilitiesFrom(draft.abilities),
  });
};

export const seededDraft = (
  draft: CharacterDraft,
  edited: ReadonlySet<SeededField>,
  /**
   * What this campaign offers — the list the three pickers were built from.
   *
   * Passed in rather than looked up in a module-level map, because there is no
   * global vocabulary any more: a class is a row, and *which* rows depends on
   * the table. `optionNamed` is the same case-insensitive, exact, no-fuzzy rule
   * `Ruleset.classFor` was, moved beside the type it reads — so a label this
   * campaign has no option for seeds nothing rather than seeding the nearest
   * thing, which is the refusal that matters most under homebrew.
   */
  options: ReadonlyArray<CharacterOption>,
): CharacterDraft => {
  const seed = seedOf(draft, options);
  return {
    ...draft,
    ...(edited.has("ac") ? {} : { ac: String(seed.ac) }),
    // Absent only when no class resolved, which the picker cannot produce — so
    // in this form it is absent only before one is picked, and then the box
    // stays as it was rather than being blanked.
    ...(edited.has("hpMax") || seed.hpMax === undefined ? {} : { hpMax: String(seed.hpMax) }),
  };
};

/**
 * The draft as `CharacterOwnCreate` — **omission, never a null and never a
 * blank string.**
 *
 * Every optional field on the create payload is optional-by-omission (there is
 * no `Schema.NullOr` on any of them, unlike the update), so a character with no
 * class named simply does not say so, exactly as an unrated encounter omits its
 * difficulty rather than sending one. Sending `""` would be worse than either:
 * `species` and `className` are `NonEmptyString`, so the contract refuses them
 * locally and the form fails on a field the player deliberately left blank.
 *
 * `sheet` goes the same way, and it is now **three** keys rather than one: the
 * backstory, the six ability cells, and the background — which lives in
 * `sheet.identity` rather than in a column, because nothing in the product
 * filters or sorts on it. A document is sent when any of them has something in
 * it and not otherwise, so a character who is only a name still
 * lands on the column default and has the same `body` shape as one the DM typed.
 * `abilitiesFrom` drops a cell with no score, which is what lets four of six be
 * set — and what makes *nobody typed any* the empty array rather than six cells
 * reading nothing.
 *
 * **There is nothing here for the live trio, `visibility` or `accountId`**, and
 * that is not a filter this function applies: `CharacterOwnCreate` has no field
 * for any of them, so a control for one would not compile. The row comes out
 * `dm` and unhurt because those are the columns' defaults.
 */
export const payloadFrom = (
  draft: CharacterDraft,
  /**
   * The same vocabulary the pickers were built from, because **the six cells
   * that get written are the seed's rather than the draft's**.
   *
   * A background raises the ability scores, so the document this sends is the
   * one `seedOf` produced and not the one the editor holds. Without the
   * vocabulary there is nothing to resolve the picked background against, and
   * the sheet would carry the scores the player typed while the armour class
   * beside them was worked out from higher ones.
   */
  options: ReadonlyArray<CharacterOption>,
): CharacterOwnCreate => {
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);
  const playerName = draft.playerName.trim();
  const species = draft.species.trim();
  const className = draft.className.trim();
  const background = draft.background.trim();
  const sheetUrl = draft.sheetUrl.trim();
  const notes = draft.notes.trim();
  // The seed's cells, not `abilitiesFrom(draft.abilities)`: these are the ones
  // the two numbers above were computed from, and they carry the background's
  // increases. One resolution, two readers — see `seedOf`.
  const abilities = seedOf(draft, options).abilities;
  // Omitted rather than written empty, `emptyCharacterSheet`'s own rule: a
  // sheet with an `identity` object holding nothing draws the section's header
  // over a blank.
  const identity: SheetIdentity = { background };
  const sheet: CharacterSheet = {
    ...emptyCharacterSheet,
    notes,
    abilities,
    ...(background === "" ? {} : { identity }),
  };

  return {
    name: draft.name.trim(),
    ...(playerName === "" ? {} : { playerName }),
    ...(level === null || level === undefined ? {} : { level }),
    ...(species === "" ? {} : { species }),
    ...(className === "" ? {} : { className }),
    ...(ac === null || ac === undefined ? {} : { ac }),
    ...(hpMax === null || hpMax === undefined ? {} : { hpMax }),
    ...(sheetUrl === "" ? {} : { sheetUrl }),
    ...(notes === "" && abilities.length === 0 && background === "" ? {} : { sheet }),
  };
};
