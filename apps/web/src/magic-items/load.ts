import type { MagicItem, MagicItemSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
import type { FilterInputFacet, FilterInputOption } from "@taverns/ui";
import type { FilterQuery } from "../library/query";

export interface MagicItemQuery {
  readonly q: string;
  readonly sort: MagicItemSort;
  readonly categories: ReadonlyArray<string>;
  readonly rarities: ReadonlyArray<string>;
  readonly attunement: ReadonlyArray<"required" | "none">;
  readonly variantStates: ReadonlyArray<"base" | "variant" | "standalone">;
}

export const NO_MAGIC_ITEM_QUERY: MagicItemQuery = {
  q: "",
  sort: "name",
  categories: [],
  rarities: [],
  attunement: [],
  variantStates: [],
};

export const MAGIC_ITEM_PAGE_SIZE = 48;

export const magicItemQueryParams = (
  query: MagicItemQuery,
  cursor: PageCursor<MagicItemSort> | undefined,
) => ({
  q: query.q.trim(),
  sort: query.sort,
  categories: query.categories,
  rarities: query.rarities,
  attunement: query.attunement,
  variantStates: query.variantStates,
  limit: MAGIC_ITEM_PAGE_SIZE,
  cursor,
});

export interface MagicItemLibraryView {
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly nextCursor: PageCursor<MagicItemSort> | null;
}

export const loadMagicItemLibrary = (query: MagicItemQuery) => (client: TavernsClient) =>
  Effect.map(
    client.library.magicItems({ query: magicItemQueryParams(query, undefined) }),
    (page) =>
      ({ magicItems: page.items, nextCursor: page.nextCursor }) satisfies MagicItemLibraryView,
  );

export const loadMoreLibraryMagicItems =
  (query: MagicItemQuery, cursor: PageCursor<MagicItemSort>) => (client: TavernsClient) =>
    client.library.magicItems({ query: magicItemQueryParams(query, cursor) });

/** The wire query for what the unified filter box holds, plus the sort beside it. */
export const magicItemQueryOf = (filter: FilterQuery, sort: MagicItemSort): MagicItemQuery => ({
  q: filter.q,
  sort,
  categories: filter.valuesOf("category"),
  rarities: filter.valuesOf("rarity"),
  attunement: filter.valuesOf("attunement") as ReadonlyArray<"required" | "none">,
  variantStates: filter.valuesOf("variant") as ReadonlyArray<"base" | "variant" | "standalone">,
});

const CATEGORIES: ReadonlyArray<FilterInputOption> = [
  { value: "wondrous-items", label: "Wondrous Items" },
  { value: "potion", label: "Potion" },
  { value: "ring", label: "Ring" },
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "wand", label: "Wand" },
  { value: "staff", label: "Staff" },
  { value: "scroll", label: "Scroll" },
  { value: "rod", label: "Rod" },
  { value: "ammunition", label: "Ammunition" },
];

const RARITIES: ReadonlyArray<FilterInputOption> = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "very-rare", label: "Very Rare" },
  { value: "legendary", label: "Legendary" },
  { value: "artifact", label: "Artifact" },
  { value: "varies", label: "Varies" },
];

// The old dropdowns carried an "Any …" escape row; a token input does not —
// removing the chip is what "any" is spelled as.
const ATTUNEMENT: ReadonlyArray<FilterInputOption> = [
  { value: "required", label: "Required" },
  { value: "none", label: "None" },
];

const VARIANTS: ReadonlyArray<FilterInputOption> = [
  { value: "base", label: "Has variants" },
  { value: "variant", label: "Variant" },
  { value: "standalone", label: "Standalone" },
];

/** The magic-items tab's facet schema — what its `FilterBox` suggests and parses. */
export const MAGIC_ITEM_FACETS: ReadonlyArray<FilterInputFacet> = [
  { kind: "enum", key: "category", label: "Category", options: CATEGORIES },
  { kind: "enum", key: "rarity", label: "Rarity", options: RARITIES },
  // One value each: "requires attunement" and "attunement: none" cannot both
  // be meant, and a variant state is one of three — the single-select the row
  // of dropdowns already made them.
  { kind: "enum", key: "attunement", label: "Attunement", multiple: false, options: ATTUNEMENT },
  { kind: "enum", key: "variant", label: "Variant", multiple: false, options: VARIANTS },
];
