import type {
  CampaignId,
  CampaignMembership,
  Character,
  CharacterId,
  CharacterOption,
  PlayerLiveTable,
} from "@taverns/api";
import { Effect } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";
import { campaignOptionsAtom } from "../rules/load";

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

/**
 * What the create form reads: the roster's own value, plus **the vocabulary of
 * the one table this character is being made at.**
 *
 * Two atoms rather than a third call inside `loadMyCharacters`, and the split
 * is what each is keyed on: the roster names no campaign (`GET /me/characters`
 * is the one read on `character` that does not), and the vocabulary names
 * exactly one. Composed into `loadMyCharacters` they would share a key, and a
 * DM sharing a class at one table would re-read every character the account
 * plays, everywhere.
 *
 * **The picker is a player's window onto a DM's screen**, which is the thing to
 * hold on to: `campaignOptionsAtom` is the same atom the Rules screen writes
 * through, so a class shared on one becomes pickable on the other without
 * either knowing the other exists. That is what naming a resource buys and what
 * a screen's `reload` could not.
 *
 * ### The vocabulary is read **only at a table this account plays at**
 *
 * The screen already decides whether to draw the form at all from
 * `memberships` — `role === "player"` and nothing else, which is
 * `tablesForNewCharacter`'s rule — and this asks the same question one step
 * earlier so the second read is not made when the answer is no.
 *
 * It is not an optimisation. `options.list` composes `ensureCampaignReadable`,
 * so at a table this account is not a member of it is a **404** — and combined
 * unconditionally that failure would become the screen's, replacing *"Not your
 * table"* with a generic error card. Two refusals with two different sentences
 * is the whole point of the screen reading the memberships first; asking for a
 * vocabulary it has already decided not to draw would throw the better one
 * away.
 *
 * A DM's own table is the case that makes it a *decision* rather than plumbing:
 * `options.list` would succeed there — `isDm` is a disjunct of
 * `campaignReadable` — and the read is still not made, because the form is not
 * drawn either. The pill is a mode.
 *
 * `combine` rather than a bare `AsyncResult.all`, for `api/atoms.ts`'s reason:
 * the vocabulary is keyed on a campaign this screen has only just arrived at,
 * so on the first render it is an atom nobody has read — which `all` propagates
 * as `Initial` and a screen renders as a blank body over a form somebody is
 * typing into.
 */
export interface NewCharacterView extends MyCharactersView {
  /**
   * The classes, races and backgrounds this table offers, as a player sees them.
   *
   * `corpusRowReadable` ends in `isDm OR visibility = 'shared'`, so what
   * arrives here is already narrowed by the server — there is no client-side
   * "only the shared ones", and there must not be: a second answer to that
   * question is the one that could disagree.
   *
   * `[]` at a table this account does not play at, where the screen draws a
   * refusal rather than a form and nothing is asked for.
   */
  readonly options: ReadonlyArray<CharacterOption>;
}

export const newCharacterAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<NewCharacterView, unknown> => {
      /**
       * **Both are read on every evaluation, unconditionally**, and that is a
       * requirement of the registry rather than a style: an atom's
       * dependencies are the ones its read function actually touched, so a
       * `get` behind a branch that was false on the first pass is a
       * subscription that never gets made — and the value it eventually
       * resolves to never wakes this atom. Measured: skipping the second `get`
       * until the roster had arrived left the create screen loading for ever.
       */
      const roster = get(myCharactersAtom);
      const vocabulary = get(campaignOptionsAtom(campaignId));

      if (!AsyncResult.isSuccess(roster)) {
        // `map` over a non-success carries the loading and failure states
        // through unchanged — it is the widening the compiler needs, not a
        // branch that can run.
        return combine(
          get,
          AsyncResult.map(roster, (view) => ({ ...view, options: [] })),
        );
      }

      /**
       * At a table this account does not **play** at, the vocabulary's answer
       * is dropped rather than shown.
       *
       * `options.list` composes `ensureCampaignReadable`, so at a table this
       * account is not a member of it is a 404 — and propagated it would
       * replace the screen's *"Not your table"* with a generic error card,
       * throwing away the better of two sentences. The roster is what decides
       * which refusal this is, and it has already answered.
       *
       * **It is dropped only here**, which is the line worth holding: at a
       * table this account really does play at, a vocabulary that failed to
       * load is something the player has to be told, because the alternative
       * is a form whose class picker is silently empty. So the failure passes
       * straight through in the one case where the form is drawn.
       *
       * A DM's own table takes this branch too, and `options.list` would have
       * succeeded there — `isDm` is a disjunct of `campaignReadable`. The form
       * is still not drawn, because the pill is a mode.
       */
      const membership = roster.value.memberships.find((row) => row.campaign.id === campaignId);
      if (membership?.relation !== "player") {
        return AsyncResult.success({ ...roster.value, options: [] });
      }

      return combine(
        get,
        AsyncResult.map(vocabulary, (options) => ({ ...roster.value, options })),
      );
    },
    // Named by atom rather than by key: both are this screen's own and it knows
    // them by name. Without this the screen's *Try again* would re-run a
    // derived read and hand back the same cached failure.
    (refresh) => {
      refresh(myCharactersAtom);
      refresh(campaignOptionsAtom(campaignId));
    },
  ),
);
