import type { Campaign, CampaignId, Creature, CreatureSort } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the bestiary asks the server for, and what it works out for itself.
 *
 * One Effect for the screen, the same rule `campaign/load.ts` follows: the
 * campaign row and the creature list load together, concurrently, so the screen
 * has three states rather than nine.
 */

/**
 * The two controls that are worth a round trip.
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
export interface BestiaryQuery {
  readonly q: string;
  readonly sort: CreatureSort;
}

export const NO_QUERY: BestiaryQuery = { q: "", sort: "cr" };

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
  (campaignId: CampaignId, query: BestiaryQuery) => (client: TavernsClient) =>
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
 */
export const inEnvironments = (creature: Creature, environments: ReadonlyArray<string>): boolean =>
  environments.length === 0 ||
  creature.environments.some((environment) => environments.includes(environment));
