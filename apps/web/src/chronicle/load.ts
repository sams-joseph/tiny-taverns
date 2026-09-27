import type { Campaign, CampaignId, Session, SessionId } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the Chronicle reads, and what it deliberately leaves until asked.
 *
 * ### The spine loads; the recaps do not
 *
 * This is the one place the screen departs from "one `Effect` per screen, and
 * six calls inside it" — and it is the rule holding rather than an exception to
 * it. `campaign/load.ts` composes six calls because a campaign view renders all
 * six at once. A chronicle renders one **card per night**, and a night's recap
 * reaches five tables; a campaign twenty nights old would fire twenty of those
 * to draw a list of which only the newest is open. So what loads with the
 * screen is the spine of nights, and a recap is loaded by the card that shows it
 * (`RecapBody`), which is the only component that needs it.
 *
 * **The cost is stated rather than hidden: a closed card cannot show a
 * summary**, because a summary would be a recap and this has not read one. We
 * have no stored summary either — nothing stores a recap, by decision
 * (`Recap.ts`) — so the closed card carries what the `session` row itself
 * answers, and no stubbed line pretending to be prose.
 *
 * ### The spine is all that is left here
 *
 * The screen sits on `CampaignChrome`, which already answers the campaign and
 * the night being prepared. What is left is `sessions.list`, the one thing the
 * frame has no reason to know: it is about the whole record rather than about
 * tonight.
 */

export interface ChronicleSpine {
  /**
   * Newest night first. That is `sessions.list`'s own order (`session.number
   * desc`), kept rather than re-sorted: the server orders by the number the DM
   * gives their nights, and a second sort here could only disagree with it.
   */
  readonly sessions: ReadonlyArray<Session>;
}

export const loadChronicleSpine = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.map(
    client.sessions.list({ params: { campaignId } }),
    (sessions) => ({ sessions }) satisfies ChronicleSpine,
  );

/** One night's recap, read when a card is opened. */
export const loadRecap =
  (campaignId: CampaignId, sessionId: SessionId) => (client: TavernsClient) =>
    client.recap.read({ params: { campaignId, sessionId } });

/**
 * What a player's Chronicle reads, which is the spine and nothing else.
 *
 * `campaigns.findById` and `sessions.list` are `rowReadable` and already
 * answer a player exactly the nights their DM shared. There is no gate here to
 * fall foul of and nothing to filter afterwards — a night a DM kept to
 * themselves is not in the list at all. So the player's load is one round of
 * two calls, and there is no shape of failure in it that the DM's screen does
 * not also have.
 */
export const loadPlayerChronicle = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, sessions] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.sessions.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, sessions } satisfies PlayerChronicleView;
  });

export interface PlayerChronicleView {
  readonly campaign: Campaign;
  /** Newest first, and only the nights the DM shared. */
  readonly sessions: ReadonlyArray<Session>;
}

/**
 * One night's recap, **through the narrow projection and through nothing else.**
 *
 * `recap.readAsPlayer` is `GET …/recap/player` and answers `PlayerSessionRecap`,
 * in which a monster carries an `hpBand` and there is no field for an armour
 * class or an exact total. The DM's `recap.read` is behind the `DmActor` gate
 * and would answer a player a 404 — but the point of the narrow endpoint is that
 * the screen never has to depend on that. See `PlayerRecap.ts`.
 */
export const loadPlayerRecap =
  (campaignId: CampaignId, sessionId: SessionId) => (client: TavernsClient) =>
    client.recap.readAsPlayer({ params: { campaignId, sessionId } });
