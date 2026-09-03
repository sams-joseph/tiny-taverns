import type { Creature, CreatureFacets, CreatureSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the Library's creature shelf asks the server for, and what it works out
 * for itself.
 *
 * One Effect per screen, the same rule `campaign/load.ts` follows: everything a
 * screen draws loads together, concurrently, so it has three states rather than
 * nine.
 *
 * **The Library is the only creature list a screen draws now.** The campaign
 * bestiary screen went with the instancing decision of 2026-09-02 — a campaign
 * holds no managed creature collection, and what it *uses* of the corpus shows
 * up inside encounters and fights. `GET /campaigns/:c/creatures` still exists
 * as the encounter picker's read (`campaign/CreaturePicker.tsx`), answering
 * what that campaign can build from; it shares the wire filter with this shelf,
 * which is why the query helpers below are exported.
 */

/**
 * Everything a creature list asks the server. **All three controls are the
 * server's**, and that is what the paged read forced.
 *
 * **The search goes to the server**, for the reason `CreaturePicker` records:
 * the server matches the name by `ILIKE` *and* the stat block by full text, so
 * "nimble escape" finds the Goblin Boss by a trait that is in no column. Half of
 * that is unreachable from a substring match here — measured against a running
 * server, where it also finds the reskin derived from it.
 *
 * **The sort goes with it** because `cr` orders by `crSort`, the key derived
 * from `"1/4"` on write, and a client sorting on the displayed string would put
 * 1/4 after 1.
 *
 * **And so do the chips, now.** They were applied to the answer, deliberately
 * and with the reason written down: a one-element array did not survive the wire
 * at `effect@4.0.0-beta.102`, so `?environments=Cave` was a 400 while
 * `?environments=Cave&environments=River` was a 200. That is fixed —
 * `packages/api`'s `queryArray` — and the fix had to arrive with pagination
 * rather than before it, because a chip applied to *a page* is not a filter on
 * the list: it would narrow fifty rows and call the result the answer.
 */
export type FacetList =
  | "environments"
  | "sizes"
  | "types"
  | "subtypes"
  | "alignments"
  | "damageResistances"
  | "damageImmunities"
  | "conditionImmunities"
  | "movementModes";

export interface CorpusQuery {
  readonly q: string;
  readonly sort: CreatureSort;
  /** Any-of. Empty means no narrowing at all, and reaches the wire as no key. */
  readonly environments: ReadonlyArray<string>;
  readonly sizes: ReadonlyArray<string>;
  readonly types: ReadonlyArray<string>;
  readonly subtypes: ReadonlyArray<string>;
  readonly alignments: ReadonlyArray<string>;
  readonly damageResistances: ReadonlyArray<string>;
  readonly damageImmunities: ReadonlyArray<string>;
  readonly conditionImmunities: ReadonlyArray<string>;
  readonly movementModes: ReadonlyArray<string>;
  readonly crMin: string;
  readonly crMax: string;
  readonly legendary: boolean | undefined;
  readonly spellcaster: boolean | undefined;
}

export const NO_QUERY: CorpusQuery = {
  q: "",
  sort: "cr",
  environments: [],
  sizes: [],
  types: [],
  subtypes: [],
  alignments: [],
  damageResistances: [],
  damageImmunities: [],
  conditionImmunities: [],
  movementModes: [],
  crMin: "",
  crMax: "",
  legendary: undefined,
  spellcaster: undefined,
};

/**
 * How many rows a page of the grid holds.
 *
 * A multiple of three, which is the widest the grid ever is, so a page fills
 * whole rows at every breakpoint.
 */
export const PAGE_SIZE = 24;

const numberFilter = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const whenAny = (values: ReadonlyArray<string>): ReadonlyArray<string> | undefined =>
  values.length === 0 ? undefined : values;

/** The filter as the wire takes it — one place, so the two lists cannot drift. */
const asQuery = (query: CorpusQuery, cursor: PageCursor<CreatureSort> | undefined) => ({
  q: query.q.trim(),
  sort: query.sort,
  ...(whenAny(query.environments) === undefined ? {} : { environments: query.environments }),
  ...(numberFilter(query.crMin) === undefined ? {} : { crMin: numberFilter(query.crMin) }),
  ...(numberFilter(query.crMax) === undefined ? {} : { crMax: numberFilter(query.crMax) }),
  ...(whenAny(query.sizes) === undefined ? {} : { sizes: query.sizes }),
  ...(whenAny(query.types) === undefined ? {} : { types: query.types }),
  ...(whenAny(query.subtypes) === undefined ? {} : { subtypes: query.subtypes }),
  ...(whenAny(query.alignments) === undefined ? {} : { alignments: query.alignments }),
  ...(whenAny(query.damageResistances) === undefined
    ? {}
    : { damageResistances: query.damageResistances }),
  ...(whenAny(query.damageImmunities) === undefined
    ? {}
    : { damageImmunities: query.damageImmunities }),
  ...(whenAny(query.conditionImmunities) === undefined
    ? {}
    : { conditionImmunities: query.conditionImmunities }),
  ...(whenAny(query.movementModes) === undefined ? {} : { movementModes: query.movementModes }),
  ...(query.legendary === undefined ? {} : { legendary: query.legendary }),
  ...(query.spellcaster === undefined ? {} : { spellcaster: query.spellcaster }),
  limit: PAGE_SIZE,
  cursor,
});

/** What both creature screens read: one page, and the chip row's vocabulary. */
export interface CorpusView {
  /**
   * The first page. Later ones are appended by `corpus.ts`, which is also where
   * `nextCursor` is spent.
   */
  readonly creatures: ReadonlyArray<Creature>;
  readonly nextCursor: PageCursor<CreatureSort> | null;
  /**
   * Every environment this list's corpus mentions — **from the server**, over
   * the same predicate the list composes.
   *
   * It used to be accumulated from the answers, which worked only while an
   * unsearched answer was the whole corpus. A page is not, and the chips now
   * narrow the query, so a row built from what came back would offer only the
   * environments on page one and could never grow back the one you would press
   * to get out of a filter. See `Api.ts`'s `creatures.environments`.
   */
  readonly vocabulary: ReadonlyArray<string>;
  readonly facets: CreatureFacets;
}

export type LibraryView = CorpusView;

/**
 * The Library, and the one read on `creature` that names no campaign.
 *
 * Neither call can fail: there is no parent in the path to be missing, so an
 * account that has authored nothing gets the bundle — a legitimate steady
 * state rather than an error. Same shape, and the same reasoning, as
 * `loadMyCharacters`. There is no membership read here any more: it existed to
 * feed the copy-into-campaign control, and that control went with the
 * instancing decision — using a creature in a campaign happens where it is
 * used, in the encounter dialog.
 */
export const loadLibrary = (query: CorpusQuery) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [page, facets] = yield* Effect.all(
      [client.library.list({ query: asQuery(query, undefined) }), client.library.creatureFacets()],
      { concurrency: "unbounded" },
    );

    return {
      creatures: page.items,
      nextCursor: page.nextCursor,
      vocabulary: facets.environments,
      facets,
    } satisfies LibraryView;
  });

/** The page after the one in hand, for the Library — see `moreOfBestiary`. */
export const moreOfLibrary =
  (query: CorpusQuery, cursor: PageCursor<CreatureSort>) => (client: TavernsClient) =>
    client.library.list({ query: asQuery(query, cursor) });
