import type {
  Campaign,
  CampaignId,
  Character,
  Encounter,
  EncounterRun,
  Note,
  PrepItem,
  Session,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/** Everything the campaign view renders, in one shape. */
export interface CampaignView {
  readonly campaign: Campaign;
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

    const [encounters, notes, party] = yield* Effect.all(
      [
        client.encounters.list({ params: { campaignId } }),
        client.notes.list({ params: { campaignId } }),
        client.characters.list({ params: { campaignId } }),
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
