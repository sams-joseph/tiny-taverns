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
  PageCursor,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
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
 * One Effect for the whole screen, not one hook per endpoint.
 *
 * Six endpoints behind six `useState`s would give the screen sixty-four
 * combinations of loading and failed to render; composed here it has three.
 * The two rounds are a real data dependency — the checklist hangs off
 * `campaign.currentSessionId`, which the first call is what tells us — and
 * everything within a round is concurrent, so the shape of the load is the
 * shape of the model rather than a waterfall.
 */
export const loadCampaignView = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const campaign = yield* client.campaigns.findById({ params: { campaignId } });

    const [encounters, notes, party, memberships] = yield* Effect.all(
      [
        // Whole lists, followed to the end: this screen's search box filters
        // what the frame loaded, and a filter applied to one page is not a
        // filter on the list. See `api/page.ts`.
        collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
          client.encounters.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
        ),
        collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
          client.notes.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
        ),
        client.characters.list({ params: { campaignId } }),
        // In the round that was already running, so it costs no round trip. A
        // campaign this actor can read is a campaign they are a member of —
        // `campaignInScope` is membership — so the row is there; defaulting to
        // `dm` if it somehow is not keeps the screen it is on rather than
        // bouncing somebody out of their own table.
        client.me.campaigns(),
      ],
      { concurrency: "unbounded" },
    );

    const sessionId = campaign.currentSessionId;
    const live =
      sessionId === null
        ? undefined
        : yield* Effect.all(
            [
              client.sessions.findById({ params: { campaignId, sessionId } }),
              client.prep.list({ params: { campaignId, sessionId } }),
              client.runs.list({ params: { campaignId, sessionId } }),
            ],
            { concurrency: "unbounded" },
          );

    return {
      campaign,
      role: memberships.find((row) => row.campaign.id === campaignId)?.role ?? "dm",
      session: live?.[0],
      encounters,
      notes,
      party,
      prep: live?.[1] ?? [],
      run: live?.[2].find((row) => row.endedAt === null),
    } satisfies CampaignView;
  });

/** Case-insensitive substring match over the fields a DM would search by. */
export const matches = (needle: string, ...haystack: ReadonlyArray<string | null>): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return haystack.some((field) => field !== null && field.toLowerCase().includes(term));
};
