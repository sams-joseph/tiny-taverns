import type {
  Campaign,
  CampaignId,
  CreatedOrder,
  CampaignRelation,
  Encounter,
  EncounterRun,
  Note,
  PrepItem,
  PartySeat,
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
   * What this account is at *this* table — derived per pair, never global.
   * The route wrapper (`CampaignRoute.tsx`) is what chooses the projection;
   * this copy is the frame's own, read in the same round as everything else,
   * so the chrome and the body cannot disagree about whose screen this is.
   */
  readonly relation: CampaignRelation;
  /** The session the DM is preparing, or `undefined` when there is not one yet. */
  readonly session: Session | undefined;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly notes: ReadonlyArray<Note>;
  /**
   * The seats at this table, each holding the shared account-owned character
   * behind it — `party.list`. A seat whose character has been deleted keeps
   * standing with `character: null`, which is campaign history rather than an
   * error.
   */
  readonly party: ReadonlyArray<PartySeat>;
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
  apiAtom((client) => client.party.list({ params: { campaignId } }), [reads.party(campaignId)]),
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
 * The fight on the table: the unended run. `encounter_run_one_live_per_session`
 * is a partial unique index, so there is at most one.
 */
const liveRun = (runs: ReadonlyArray<EncounterRun>): EncounterRun | undefined =>
  runs.find((row) => row.endedAt === null);

/** Tonight, as the campaign row's badge and press need it. */
export interface CampaignNight {
  readonly campaign: Campaign;
  readonly session: Session | undefined;
  readonly run: EncounterRun | undefined;
}

/**
 * The campaign, its open night and the fight on it, without the rest of the
 * view.
 *
 * The campaign row reads this on every creator screen, including the runner and
 * the create form, which read nothing else of the campaign's; the whole view
 * there would be five reads to draw a badge. The parts are the view's own
 * atoms, so on a campaign destination it is answered from the registry.
 */
export const campaignNightAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable((get: Atom.AtomContext) =>
    combine(
      get,
      AsyncResult.flatMap(get(campaignAtom(campaignId)), (campaign, previous) => {
        const sessionId = campaign.currentSessionId;
        if (sessionId === null) {
          return AsyncResult.success<CampaignNight, unknown>(
            { campaign, session: undefined, run: undefined },
            { waiting: previous.waiting },
          );
        }
        const night: Night = { campaignId, sessionId };
        const tonight = AsyncResult.all({
          session: get(sessionAtom(night)),
          runs: get(runsAtom(night)),
        });
        return AsyncResult.map(tonight, (parts) => ({
          campaign,
          session: parts.session,
          run: liveRun(parts.runs),
        })) as AsyncResult.AsyncResult<CampaignNight, unknown>;
      }),
    ),
  ),
);

/** The creator-governed invitation list for one campaign. */
export const campaignInvitesAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.campaignInvites.list({ params: { campaignId } }),
    [reads.campaignInvites(campaignId)],
  ),
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
  reads.party(campaignId),
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
    const relation =
      round.memberships.find((row) => row.campaign.id === campaignId)?.relation ??
      ("creator" as CampaignRelation);
    const settled = {
      campaign: round.campaign,
      relation,
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
      run: liveRun(tonight.runs),
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
