import type {
  Campaign,
  CampaignId,
  Character,
  CreatedOrder,
  Encounter,
  EncounterRun,
  MemberRole,
  Note,
  PrepItem,
  Session,
  SessionId,
  PageCursor,
} from "@taverns/api";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads, type Invalidation } from "../api/keys";
import { collectPages, WHOLE_LIST } from "../api/page";

/** Everything the campaign view renders, in one shape. */
export interface CampaignView {
  readonly campaign: Campaign;
  /**
   * What this account is at *this* table — the one thing the campaign row
   * cannot carry, because a role is a fact about a pair.
   *
   * **It is here to close the last way a player reaches a DM screen.** The
   * campaign list and the invitation page both route by role now, so nothing
   * in the product links here for a player; a bookmark or a link a DM pasted
   * still can. Landing there does not even fail loudly — every read this screen
   * makes in its first round succeeds for a player, narrowed — so it draws a
   * DM's chrome over a player's data and only breaks when something is pressed.
   * Knowing the role is what lets the screen hand them the one that works.
   */
  readonly role: MemberRole;
  /** The session the DM is preparing, or `undefined` when there is not one yet. */
  readonly session: Session | undefined;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly notes: ReadonlyArray<Note>;
  readonly party: ReadonlyArray<Character>;
  /** The "Before you sit down" checklist. Empty when there is no session. */
  readonly prep: ReadonlyArray<PrepItem>;
  /**
   * The fight on the table right now — the fixtures' `active: true`
   * (`data.js:10`, `CampaignHome.jsx:21-25`) — or `undefined`.
   *
   * Found by listing this session's runs and taking the unended one rather than
   * by following `session.activeEncounterRunId`, which would need a third round
   * of requests to resolve. `encounter_run_one_live_per_session` is a partial
   * unique index, so "the unended one" is at most one row and the two routes
   * cannot disagree.
   */
  readonly run: EncounterRun | undefined;
}

/**
 * The campaign view, as eight atoms rather than one Effect — and why.
 *
 * **This file is the worked example of the narrowing, and it reverses a
 * decision that was argued at length in `CampaignChrome.tsx`.** It used to be
 * one `loadCampaignView` composing six-to-eight endpoints, on the rule that one
 * Effect per screen is three states rather than sixty-four. The rule was right
 * about rendering and expensive about writing: every structural write ended in
 * `reload()`, so adding one line to the checklist cost **one write and eight
 * reads** — measured, twice, in a real browser.
 *
 * What splits it without giving the screen sixty-four states is that the parts
 * are combined *in an atom*, once, here. `assemble` is the same two rounds the
 * Effect had — the checklist genuinely hangs off `campaign.currentSessionId`,
 * which the first round is what tells us — expressed as a dependency between
 * atoms instead of a `yield*`. A destination still reads one value and renders
 * three states; what changed is that a write can now refresh one eighth of it.
 *
 * Each part names the resource it answers (`api/keys.ts`), and every write on
 * these screens names the same resource. Adding a checklist line is one write
 * and **one** read.
 *
 * ### Two things about this shape that are not obvious
 *
 *  - **`combine` is what stops it blanking when a night opens.** The night's
 *    three atoms are keyed on a session id, so opening a session makes them
 *    atoms that have never been read — `Initial`, which `AsyncResult.all`
 *    propagates and a screen renders as a blank body. `api/atoms.ts` says the
 *    rest.
 *  - **Refreshing the view atom does nothing, and must not be relied on.** It
 *    is derived: re-running its read hands back the same cached parts. Re-read
 *    it by invalidating the keys instead — `campaignViewKeys` is that list, and
 *    it is what the failure notice's *Try again* fires.
 */

/** The pair a night's three reads are keyed on. */
interface Night {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
}

export const campaignAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.campaigns.findById({ params: { campaignId } }),
    [reads.campaign(campaignId)],
  ),
);

/**
 * Which tables this account sits at, and as what.
 *
 * **One atom for the whole app**, not one per screen: the campaign list, the
 * campaign frame's role check and the Library's *copy into…* select all ask the
 * same question, and two of them are commonly mounted at once.
 */
export const membershipsAtom = apiAtom((client) => client.me.campaigns(), [reads.myCampaigns]);

export const encountersAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) =>
      // Whole lists, followed to the end: this screen's search box filters what
      // the frame loaded, and a filter applied to one page is not a filter on
      // the list. See `api/page.ts`.
      collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
        client.encounters.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
      ),
    [reads.encounters(campaignId)],
  ),
);

export const notesAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) =>
      collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
        client.notes.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
      ),
    [reads.notes(campaignId)],
  ),
);

export const partyAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.characters.list({ params: { campaignId } }),
    [reads.characters(campaignId)],
  ),
);

const sessionAtom = Atom.family((night: Night) =>
  apiAtom(
    (client) => client.sessions.findById({ params: night }),
    [reads.sessions(night.campaignId)],
  ),
);

const prepAtom = Atom.family((night: Night) =>
  apiAtom((client) => client.prep.list({ params: night }), [reads.prep(night.sessionId)]),
);

const runsAtom = Atom.family((night: Night) =>
  apiAtom((client) => client.runs.list({ params: night }), [reads.runs(night.sessionId)]),
);

/**
 * Two campaign reads that are not part of the view, and live here for the same
 * reason the eight above do: **one resource, one atom.**
 *
 * The invitations are read by the DM's invitation dialog *and* by the party
 * roster, which are commonly on screen together — the dialog opens over the
 * roster. Two atoms for one list would be two requests and, worse, two things a
 * mint would have to remember to refresh.
 */
export const invitesAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom((client) => client.invites.list({ params: { campaignId } }), [reads.invites(campaignId)]),
);

export const membersAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom((client) => client.members.list({ params: { campaignId } }), [reads.members(campaignId)]),
);

/**
 * Everything the eight parts answer, as one list.
 *
 * The one caller is the frame's *Try again*, and it is spelled in the same
 * vocabulary a write is because it is the same act: a derived atom cannot be
 * refreshed, so "read the whole campaign again" is "invalidate everything the
 * campaign is made of". The night is optional because a campaign between
 * sessions has none, and because a read that failed may not have got far enough
 * to say which one it is.
 */
export const campaignViewKeys = (
  campaignId: CampaignId,
  sessionId: SessionId | undefined,
): Invalidation => [
  reads.campaign(campaignId),
  reads.myCampaigns,
  reads.encounters(campaignId),
  reads.notes(campaignId),
  reads.characters(campaignId),
  reads.sessions(campaignId),
  ...(sessionId === undefined ? [] : [reads.prep(sessionId), reads.runs(sessionId)]),
];

const assemble = (
  get: Atom.AtomContext,
  campaignId: CampaignId,
): AsyncResult.AsyncResult<CampaignView, unknown> => {
  const base = AsyncResult.all({
    campaign: get(campaignAtom(campaignId)),
    memberships: get(membershipsAtom),
    encounters: get(encountersAtom(campaignId)),
    notes: get(notesAtom(campaignId)),
    party: get(partyAtom(campaignId)),
  });

  return AsyncResult.flatMap(base, (round, previous) => {
    // A campaign this actor can read is a campaign they are a member of —
    // `campaignInScope` is membership — so the row is there; defaulting to `dm`
    // if it somehow is not keeps the screen it is on rather than bouncing
    // somebody out of their own table.
    const role =
      round.memberships.find((row) => row.campaign.id === campaignId)?.role ?? ("dm" as MemberRole);
    const settled = {
      campaign: round.campaign,
      role,
      encounters: round.encounters,
      notes: round.notes,
      party: round.party,
    };

    const sessionId = round.campaign.currentSessionId;
    if (sessionId === null) {
      return AsyncResult.success<CampaignView, unknown>(
        { ...settled, session: undefined, prep: [], run: undefined },
        { waiting: previous.waiting },
      );
    }

    const night: Night = { campaignId, sessionId };
    const live = AsyncResult.all({
      session: get(sessionAtom(night)),
      prep: get(prepAtom(night)),
      runs: get(runsAtom(night)),
    });
    return AsyncResult.map(live, (tonight) => ({
      ...settled,
      session: tonight.session,
      prep: tonight.prep,
      run: tonight.runs.find((row) => row.endedAt === null),
    })) as AsyncResult.AsyncResult<CampaignView, unknown>;
  });
};

export const campaignViewAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable((get: Atom.AtomContext) => combine(get, assemble(get, campaignId))),
);

/** Case-insensitive substring match over the fields a DM would search by. */
export const matches = (needle: string, ...haystack: ReadonlyArray<string | null>): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return haystack.some((field) => field !== null && field.toLowerCase().includes(term));
};
