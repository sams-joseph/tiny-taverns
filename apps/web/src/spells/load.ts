import type { Campaign, CampaignId, PageCursor, Spell, SpellSort } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

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
  readonly campaigns: ReadonlyArray<Campaign>;
}

export const loadSpellLibrary = (query: SpellQuery) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [page, memberships] = yield* Effect.all(
      [client.library.spells({ query: spellQueryParams(query, undefined) }), client.me.campaigns()],
      { concurrency: "unbounded" },
    );
    return {
      spells: page.items,
      nextCursor: page.nextCursor,
      campaigns: memberships
        .filter((membership) => membership.relation === "creator")
        .map((membership) => membership.campaign),
    } satisfies SpellLibraryView;
  });

export interface CampaignSpellsView {
  readonly spells: ReadonlyArray<Spell>;
  readonly nextCursor: PageCursor<SpellSort> | null;
}

export const loadCampaignSpells =
  (campaignId: CampaignId, query: SpellQuery) => (client: TavernsClient) =>
    Effect.map(
      client.spells.list({
        params: { campaignId },
        query: spellQueryParams(query, undefined),
      }),
      (page) =>
        ({
          spells: page.items,
          nextCursor: page.nextCursor,
        }) satisfies CampaignSpellsView,
    );

export const loadMoreLibrarySpells =
  (query: SpellQuery, cursor: PageCursor<SpellSort>) => (client: TavernsClient) =>
    client.library.spells({ query: spellQueryParams(query, cursor) });

export const loadMoreCampaignSpells =
  (campaignId: CampaignId, query: SpellQuery, cursor: PageCursor<SpellSort>) =>
  (client: TavernsClient) =>
    client.spells.list({ params: { campaignId }, query: spellQueryParams(query, cursor) });
