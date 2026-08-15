import type { Campaign, CampaignId, Creature, CreatureSort } from "@taverns/api";
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
 * The two controls that are worth a round trip. The same pair on both lists,
 * because the server's `LibraryFilter` is literally the same declaration.
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
 */
export interface CorpusQuery {
  readonly q: string;
  readonly sort: CreatureSort;
}

export const NO_QUERY: CorpusQuery = { q: "", sort: "cr" };

export interface BestiaryView {
  readonly campaign: Campaign;
  /**
   * The campaign's own creatures *and* the global `system` corpus, in one list
   * — see `Api.ts`. There is no client-side union: the path is what reaches the
   * global rows, so this is the whole set this credential can see through this
   * campaign and nothing more.
   */
  readonly creatures: ReadonlyArray<Creature>;
}

export const loadBestiary =
  (campaignId: CampaignId, query: CorpusQuery) => (client: TavernsClient) =>
    Effect.gen(function* () {
      const [campaign, creatures] = yield* Effect.all(
        [
          client.campaigns.findById({ params: { campaignId } }),
          client.creatures.list({
            params: { campaignId },
            query: { q: query.q.trim(), sort: query.sort },
          }),
        ],
        { concurrency: "unbounded" },
      );

      return { campaign, creatures } satisfies BestiaryView;
    });

export interface LibraryView {
  /**
   * **Originals only** — the bundle, plus what this account has authored. Never
   * a campaign's copy of anything, which is statement 4 of the captain's model.
   *
   * `repo/visibility.ts`'s `libraryRowReadable` is
   * `campaign_id is null and (account_id is null or account_id = <me>)`, and it
   * composes no campaign gate at all: a Library entity is in no campaign, so
   * there is no membership to check and nothing for a credential's scope to
   * narrow. The owner is the entire question, and it is compared to the actor's
   * own account and to nothing a caller supplied — so the only non-null
   * `accountId` any reader ever sees here is its own.
   */
  readonly creatures: ReadonlyArray<Creature>;
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
    const [creatures, memberships] = yield* Effect.all(
      [
        client.library.list({ query: { q: query.q.trim(), sort: query.sort } }),
        client.me.campaigns(),
      ],
      { concurrency: "unbounded" },
    );

    return {
      creatures,
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

/**
 * The environment chips, applied here rather than sent.
 *
 * `CreatureFilter.environments` exists and the repository implements it as a
 * Postgres `&&` overlap — but **a one-element array does not survive the wire at
 * `effect@4.0.0-beta.102`**. The derived client encodes `["Cave"]` as a single
 * `?environments=Cave`, and the server's query decoder reads one occurrence of a
 * key as a scalar string, which `Schema.Array` then refuses: `Expected array |
 * undefined, got "Cave"`, a 400. Two chips work; one does not. Measured against
 * a running server — `?environments=Cave` is 400 and
 * `?environments=Cave&environments=River` is 200 — so this is the wire, not the
 * screen. See `AGENTS.md`.
 *
 * Doing it here costs nothing and loses nothing, which is why it is a fix and
 * not a workaround: every row already carries its own `environments` on the
 * wire, the test is the same any-of, and the two filters are conjunctive — the
 * server narrows by `q`, this narrows what came back, and the result is the set
 * the server would have returned had it been asked for both. The order is the
 * server's, untouched. That is *not* true of the search, which is why the search
 * is still a round trip.
 *
 * It also means pressing a chip costs no request, and the chip row cannot narrow
 * itself out of existence.
 *
 * **One function for both lists**, so the Library and the bestiary cannot come
 * to mean different things by a pressed chip — the client-side half of the same
 * guarantee `LibraryFilter` gives the server-side half of.
 */
export const inEnvironments = (creature: Creature, environments: ReadonlyArray<string>): boolean =>
  environments.length === 0 ||
  creature.environments.some((environment) => environments.includes(environment));
