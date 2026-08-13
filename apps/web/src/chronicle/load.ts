import type { Campaign, CampaignId, PrepItem, Session, SessionId } from "@taverns/api";
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
 * six at once. A chronicle renders one **row per night**, and a night's recap
 * reaches five tables; a campaign twenty nights old would fire twenty of those
 * to draw a timeline of which nothing but the newest is expanded. So the Effect
 * here loads what the *timeline* is — the campaign and its sessions — and a
 * recap is loaded by the card that shows it (`RecapBody`), which is the only
 * component that needs it.
 *
 * The prototype opens the newest card and keeps exactly one open
 * (`Chronicle.jsx:146,164`), so in practice this is one recap in flight, loaded
 * on mount, and the shape a DM opening the screen sees is the shape the
 * designers drew.
 *
 * **The cost is stated rather than hidden: a collapsed card cannot show a
 * summary**, because a summary is a recap and this has not read one. The
 * prototype clamps two lines of `s.summary` there (`Chronicle.jsx:52-55`). We
 * have no such column — nothing stores a recap, by decision (`Recap.ts`) — so
 * the collapsed card carries what the `session` row itself answers, and no
 * stubbed line pretending to be prose.
 */

export interface ChronicleView {
  readonly campaign: Campaign;
  /**
   * Newest night first. That is `sessions.list`'s own order (`session.number
   * desc`), kept rather than re-sorted: the server orders by the number the DM
   * gives their nights, and a second sort here could only disagree with it.
   */
  readonly sessions: ReadonlyArray<Session>;
  /**
   * The night the DM is preparing, when there is one — `campaign.currentSessionId`
   * resolved against the list rather than re-read, since the list already holds
   * every session of the campaign.
   */
  readonly current: Session | undefined;
  /**
   * *"Threads still open"* (`Chronicle.jsx:177-190`), from the one shipped source
   * that answers it.
   *
   * The prototype's `threads` is authored prose per session, which nothing
   * writes here. The unticked half of the current night's checklist is the real
   * equivalent and `Recap.ts` says so in as many words: the ticked lines are
   * facts about the night that happened, and *"the unticked ones are what the
   * next night inherits"*. So this is questions the DM went in with and has not
   * answered — which is what the aside claims to be, and the aside names the
   * night it is reading so the claim stays checkable.
   *
   * Empty when there is no current session, which is also when the aside is not
   * drawn at all.
   */
  readonly openThreads: ReadonlyArray<PrepItem>;
}

export const loadChronicle = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    // Two rounds, and the dependency is real: which session's checklist to read
    // is on the campaign row. Same shape as `campaign/load.ts`.
    const [campaign, sessions] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.sessions.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    const currentId = campaign.currentSessionId;
    const prep =
      currentId === null
        ? []
        : yield* client.prep.list({ params: { campaignId, sessionId: currentId } });

    return {
      campaign,
      sessions,
      current: sessions.find((session) => session.id === currentId),
      openThreads: prep.filter((item) => !item.done),
    } satisfies ChronicleView;
  });

/** One night's recap, read when a card is opened. */
export const loadRecap =
  (campaignId: CampaignId, sessionId: SessionId) => (client: TavernsClient) =>
    client.recap.read({ params: { campaignId, sessionId } });

/**
 * What a player's Chronicle reads, which is the spine and nothing else.
 *
 * Two of the DM's three reads survive, and the third is dropped rather than
 * narrowed:
 *
 * - **`campaigns.findById` and `sessions.list`** are `rowReadable` and already
 *   answer a player exactly the nights their DM shared. There is no gate here to
 *   fall foul of and nothing to filter afterwards — a night a DM kept to
 *   themselves is not in the list at all.
 * - **The checklist is not read.** *"Threads still open"* is the unticked half of
 *   the DM's own prep, and its aside is drawn as the DM's loose ends —
 *   questions they went into the night with. Rendered to a player it would
 *   attribute the DM's planning to the table, which is the same lie as a stubbed
 *   field wearing somebody else's voice. The **ticked** lines are a different
 *   matter and are in the recap already: they are facts about the night that
 *   happened, and `PlayerRecapBody` renders them under a heading that names who
 *   settled them.
 *
 * So the player's load is one round of two calls, and there is no shape of
 * failure in it that the DM's screen does not also have.
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
