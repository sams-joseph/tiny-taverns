import type { Campaign, CampaignId, Creature, CreatureSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the two creature lists ask the server for, and what they work out for
 * themselves.
 *
 * One Effect per screen, the same rule `campaign/load.ts` follows: everything a
 * screen draws loads together, concurrently, so it has three states rather than
 * nine.
 *
 * **Two lists over one table, asking different questions.** The campaign
 * bestiary is `GET /campaigns/:c/creatures` — that campaign's own rows plus the
 * bundle, with the path doing the gating; what it holds is **copies**. The
 * Library is `GET /library/creatures` — the **originals**: the bundle plus what
 * this account authored, with no campaign in the path at all. Neither list can
 * show the other's rows, and that is the captain's model rather than a filter
 * either screen applies.
 *
 * They take the same filter (`LibraryFilter` is spread into `CreatureFilter`)
 * and both come back as `Creature`, which is why everything below this line is
 * shared.
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
export interface CorpusQuery {
  readonly q: string;
  readonly sort: CreatureSort;
  /** Any-of. Empty means no narrowing at all, and reaches the wire as no key. */
  readonly environments: ReadonlyArray<string>;
}

export const NO_QUERY: CorpusQuery = { q: "", sort: "cr", environments: [] };

/**
 * How many rows a page of the grid holds.
 *
 * A multiple of three, which is the widest the grid ever is, so a page fills
 * whole rows at every breakpoint.
 */
export const PAGE_SIZE = 24;

/** The filter as the wire takes it — one place, so the two lists cannot drift. */
const asQuery = (query: CorpusQuery, cursor: PageCursor<CreatureSort> | undefined) => ({
  q: query.q.trim(),
  sort: query.sort,
  environments: query.environments,
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
}

export interface BestiaryView extends CorpusView {
  readonly campaign: Campaign;
}

export const loadBestiary =
  (campaignId: CampaignId, query: CorpusQuery) => (client: TavernsClient) =>
    Effect.gen(function* () {
      const [campaign, page, vocabulary] = yield* Effect.all(
        [
          client.campaigns.findById({ params: { campaignId } }),
          client.creatures.list({ params: { campaignId }, query: asQuery(query, undefined) }),
          client.creatures.environments({ params: { campaignId } }),
        ],
        { concurrency: "unbounded" },
      );

      return {
        campaign,
        creatures: page.items,
        nextCursor: page.nextCursor,
        vocabulary,
      } satisfies BestiaryView;
    });

/** The page after the one in hand. See `corpus.ts` for where the cursor lives. */
export const moreOfBestiary =
  (campaignId: CampaignId, query: CorpusQuery, cursor: PageCursor<CreatureSort>) =>
  (client: TavernsClient) =>
    client.creatures.list({ params: { campaignId }, query: asQuery(query, cursor) });

export interface LibraryView extends CorpusView {
  /**
   * The tables this account **runs**, for the one action on this screen that
   * needs a campaign: copying an entity into one.
   *
   * A `Campaign` and never a name-only map, because the copy control needs the
   * id to send and the name to show. Filtered to `dm` here rather than in the
   * control: `derive` writes through `rowWritable`, which requires `isDm`, so a
   * table this account only plays at is not a place a copy can land and offering
   * it would be a control that exists and then errors.
   */
  readonly campaigns: ReadonlyArray<Campaign>;
}

/**
 * The Library, and the one read on `creature` that names no campaign.
 *
 * Two calls in one round, neither of which can fail: there is no parent in the
 * path to be missing, so an account that has authored nothing gets the bundle
 * and an account at no table gets `[]` campaigns — both legitimate steady
 * states rather than errors. Same shape, and the same reasoning, as
 * `loadMyCharacters`.
 *
 * **The second call is for the copy action and nothing else.** It used to be
 * here to turn a row's `campaignId` into a table's name, back when this list
 * gathered campaign copies; under the model there is no campaign row in the
 * answer to name. Kept, repurposed, and worth stating so that nobody removes it
 * as a leftover.
 */
export const loadLibrary = (query: CorpusQuery) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [page, vocabulary, memberships] = yield* Effect.all(
      [
        client.library.list({ query: asQuery(query, undefined) }),
        client.library.environments(),
        client.me.campaigns(),
      ],
      { concurrency: "unbounded" },
    );

    return {
      creatures: page.items,
      nextCursor: page.nextCursor,
      vocabulary,
      // `role === "dm"` and nothing else: `derive` writes through `rowWritable`,
      // so a table you only sit at is not somewhere a copy can land. There is no
      // `archivedAt === null` filter beside it any more — `GET /me/campaigns` is
      // the live shelf by the URL it is, and `repo/Memberships.ts` holds that
      // clause once. The filter that used to be here answered a question the
      // server had already answered, which is how a second answer starts.
      campaigns: memberships
        .filter((membership) => membership.role === "dm")
        .map((membership) => membership.campaign),
    } satisfies LibraryView;
  });

/** The page after the one in hand, for the Library — see `moreOfBestiary`. */
export const moreOfLibrary =
  (query: CorpusQuery, cursor: PageCursor<CreatureSort>) => (client: TavernsClient) =>
    client.library.list({ query: asQuery(query, cursor) });
