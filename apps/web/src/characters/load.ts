import type { CampaignId, Character, CharacterId, PlayerLiveTable } from "@taverns/api";
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
  /**
   * What the signed-in account is called — `GET /me`, the one read here that is
   * about the reader rather than about what they have.
   *
   * It is the third call in the round and it is the reason the subtitle can
   * name somebody: until this endpoint existed the screen could only count, and
   * `rosterSummary` says so at length. See `AccountIdentity`.
   */
  readonly accountName: string;
}

export const loadMyCharacters = (client: TavernsClient) =>
  Effect.gen(function* () {
    const [characters, memberships, me] = yield* Effect.all(
      [client.me.characters(), client.me.campaigns(), client.me.identity()],
      { concurrency: "unbounded" },
    );

    return {
      characters,
      campaignNames: new Map(
        memberships.map((membership) => [membership.campaign.id, membership.campaign.name]),
      ),
      tableCount: memberships.length,
      accountName: me.name,
    } satisfies MyCharactersView;
  });

/**
 * The sheet's own view: the roster's, plus what is live at that character's
 * table.
 *
 * **Two rounds, and the second one cannot be folded into the first.** The live
 * read hangs off `/campaigns/:campaignId`, and which campaign that is is a fact
 * about the character — which arrives in the first round. `campaign/load.ts`
 * already pays the same cost for the same reason (its checklist hangs off
 * `campaign.currentSessionId`), and paying it here keeps the screen at one
 * `Effect` and three states rather than two resources and four combinations of
 * loading and failed.
 *
 * **A character this account does not have costs no second request.** The
 * roster is the narrowing — `ownRowReadable` — so *"not in the answer"* and
 * *"not yours"* are the same fact, and there is nothing to ask about.
 *
 * **A `NotFound` from the live read fails the screen rather than being
 * swallowed into `null`, and that is deliberate.** The first round already
 * answered a character in that campaign, which means the campaign was readable
 * a moment ago; the only way the second round refuses it is a membership
 * revoked between the two. That is a real disagreement about whether this table
 * is still yours, and the sheet under it is no longer trustworthy — so it is
 * shown, in `FailureNotice`'s own words, rather than hidden behind a banner
 * that quietly stops appearing.
 */
export interface CharacterSheetView extends MyCharactersView {
  /** What is on that character's table right now — `null` when nothing is. */
  readonly live: PlayerLiveTable | null;
}

export const loadCharacterSheet = (characterId: CharacterId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const view = yield* loadMyCharacters(client);
    const character = view.characters.find((row) => row.id === characterId);
    const live =
      character === undefined
        ? null
        : yield* client.table.read({ params: { campaignId: character.campaignId } });

    return { ...view, live } satisfies CharacterSheetView;
  });
