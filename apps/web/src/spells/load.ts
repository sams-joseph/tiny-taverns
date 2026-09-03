import type { PageCursor, Spell, SpellSort } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
import type { FilterInputFacet, FilterInputOption } from "@taverns/ui";
import type { FilterQuery } from "../library/query";

export type SpellLevelKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export interface SpellQuery {
  readonly q: string;
  readonly sort: SpellSort;
  readonly levels: ReadonlyArray<SpellLevelKey>;
  readonly schools: ReadonlyArray<string>;
  readonly classes: ReadonlyArray<string>;
  readonly ritual: boolean | undefined;
  readonly concentration: boolean | undefined;
}

export const NO_SPELL_QUERY: SpellQuery = {
  q: "",
  sort: "level",
  levels: [],
  schools: [],
  classes: [],
  ritual: undefined,
  concentration: undefined,
};

export const SPELL_PAGE_SIZE = 48;

export const spellQueryParams = (query: SpellQuery, cursor: PageCursor<SpellSort> | undefined) => ({
  q: query.q.trim(),
  sort: query.sort,
  levels: query.levels,
  schools: query.schools,
  classes: query.classes,
  ritual: query.ritual,
  concentration: query.concentration,
  limit: SPELL_PAGE_SIZE,
  cursor,
});

export interface SpellLibraryView {
  readonly spells: ReadonlyArray<Spell>;
  readonly nextCursor: PageCursor<SpellSort> | null;
}

export const loadSpellLibrary = (query: SpellQuery) => (client: TavernsClient) =>
  Effect.map(
    client.library.spells({ query: spellQueryParams(query, undefined) }),
    (page) => ({ spells: page.items, nextCursor: page.nextCursor }) satisfies SpellLibraryView,
  );

export const loadMoreLibrarySpells =
  (query: SpellQuery, cursor: PageCursor<SpellSort>) => (client: TavernsClient) =>
    client.library.spells({ query: spellQueryParams(query, cursor) });

/** The wire query for what the unified filter box holds, plus the sort beside it. */
export const spellQueryOf = (filter: FilterQuery, sort: SpellSort): SpellQuery => ({
  q: filter.q,
  sort,
  levels: filter.valuesOf("level") as ReadonlyArray<SpellLevelKey>,
  schools: filter.valuesOf("school"),
  classes: filter.valuesOf("class"),
  ritual: filter.flagOf("ritual"),
  concentration: filter.flagOf("concentration"),
});

export const levelLabel = (level: number): string => (level === 0 ? "Cantrip" : `Level ${level}`);

const LEVELS: ReadonlyArray<FilterInputOption> = Array.from({ length: 10 }, (_, level) => ({
  value: String(level),
  label: levelLabel(level),
}));

export const SPELL_SCHOOLS: ReadonlyArray<FilterInputOption> = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
].map((school) => ({ value: school, label: school[0]!.toUpperCase() + school.slice(1) }));

/**
 * The 2014 base classes, by source key — what the bundled corpus's rows name.
 * The pinned ruleset's twelve are the whole bundled vocabulary; a homebrew
 * spell's class is still findable through search.
 */
const CLASSES: ReadonlyArray<FilterInputOption> = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
].map((key) => ({ value: key, label: key[0]!.toUpperCase() + key.slice(1) }));

/** The spells tab's facet schema — what its `FilterBox` suggests and parses. */
export const SPELL_FACETS: ReadonlyArray<FilterInputFacet> = [
  { kind: "enum", key: "level", label: "Level", options: LEVELS },
  { kind: "enum", key: "school", label: "School", options: SPELL_SCHOOLS },
  { kind: "enum", key: "class", label: "Class", options: CLASSES },
  { kind: "boolean", key: "ritual", label: "Ritual" },
  { kind: "boolean", key: "concentration", label: "Concentration" },
];
