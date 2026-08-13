import type { CampaignId, Character } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * Everything both character screens render, in one shape.
 *
 * **One `Effect` and one round of two calls**, which is the rule
 * `campaign/load.ts` set — and here the second call is not decoration. A
 * `Character` carries `campaignId` and never a campaign's *name*: the name is
 * `GET /me/campaigns`'s answer, and a second copy of it on the character row
 * would be a second answer to what a campaign is called. So the join is done
 * here, once, for the roster and for the sheet alike.
 *
 * Both reads are ones a player may make with no campaign in the path, and
 * neither can fail for an account that is a member of nothing: `[]` is the
 * honest answer to *"which tables am I at"* for somebody who has just signed up.
 * That is what lets the roster's empty state tell the two silences apart —
 * invited nowhere, or at a table with no character on it yet.
 */
export interface MyCharactersView {
  /**
   * Every character this account plays, across every table.
   *
   * `repo/visibility.ts`'s `ownRowReadable` is `ownedRowReadable` *conjoined*
   * with ownership, so this is a narrowing of what `characters.list` would
   * answer rather than a reach past it. The screen adds no filter of its own and
   * must not: a client-side "only mine" would be a second answer to a question
   * the predicate has already settled, and the one that could disagree.
   */
  readonly characters: ReadonlyArray<Character>;
  /** `campaignId` → the campaign's name, for the one line the row cannot carry. */
  readonly campaignNames: ReadonlyMap<CampaignId, string>;
  /** How many tables this account sits at at all — which is not how many it plays at. */
  readonly tableCount: number;
}

export const loadMyCharacters = (client: TavernsClient) =>
  Effect.gen(function* () {
    const [characters, memberships] = yield* Effect.all(
      [client.me.characters(), client.me.campaigns()],
      { concurrency: "unbounded" },
    );

    return {
      characters,
      campaignNames: new Map(
        memberships.map((membership) => [membership.campaign.id, membership.campaign.name]),
      ),
      tableCount: memberships.length,
    } satisfies MyCharactersView;
  });
