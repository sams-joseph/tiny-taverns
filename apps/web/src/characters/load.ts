import type {
  CampaignId,
  CampaignMembership,
  Character,
  CharacterId,
  PlayerLiveTable,
} from "@taverns/api";
import { Effect } from "effect";
import { apiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";

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
  /**
   * Every table this account sits at, and what it is at each — the answer
   * `GET /me/campaigns` gives, carried whole.
   *
   * Three screens fold it three ways and none of them wants the same shape: the
   * roster asks *how many tables at all* to tell its two silences apart, the
   * sheet asks *what is this one called*, and the create form asks *which of
   * these am I a player at*, because that is the set a character of your own can
   * go into. Carrying the list is one read; three folds of it in the screens
   * that want them is no reads at all.
   *
   * `role` is why it has to be the memberships rather than the campaigns: it is
   * a fact about the pair and has nowhere on a `Campaign` to live.
   */
  readonly memberships: ReadonlyArray<CampaignMembership>;
  /**
   * `campaignId` → the campaign's name, for the one line the row cannot carry.
   *
   * An **index** over the field above rather than a second answer to it: both
   * screens that use it are looking a name up by id inside a render, and
   * rebuilding the map per row is the thing a shared shape exists to avoid.
   * Anything that wants the list itself, or the role, reads `memberships`.
   */
  readonly campaignNames: ReadonlyMap<CampaignId, string>;
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
      memberships,
      campaignNames: new Map(
        memberships.map((membership) => [membership.campaign.id, membership.campaign.name]),
      ),
      accountName: me.name,
    } satisfies MyCharactersView;
  });

/**
 * Every character this account plays, as an atom.
 *
 * **No key**, because the read names no campaign — `GET /me/characters` is the
 * one read on `character` that does not — so there is one of it, shared by
 * whatever asks. Three screens do: the roster, the sheet, and the create form,
 * which wants the memberships this already carries and so costs nothing on
 * arrival from either of the other two.
 *
 * It lives here rather than beside a screen for the reason `campaign/load.ts`'s
 * atoms do: an atom is its own identity, so a second screen naming a second
 * atom over the same read would make two requests where the registry can make
 * one.
 */
export const myCharactersAtom = apiAtom(loadMyCharacters, [reads.myCharacters]);

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
