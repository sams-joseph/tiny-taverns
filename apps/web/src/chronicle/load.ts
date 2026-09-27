import type {
  Campaign,
  CampaignId,
  ChronicleNight,
  PlayerChronicleNight,
  Session,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

/**
 * What the Chronicle reads: **the whole record, in one request.**
 *
 * `chronicle.read` answers every night of the campaign with its runs and its
 * beats (`ChronicleNight`), assembled on the server by the same function a
 * night's recap starts from. One read rather than one recap per card, because
 * the page draws every night at once: a closed card clamps the night's summary,
 * *Expand all* opens them all, and neither can wait for a request per card.
 * What the list does not draw — initiative lists, checks, carry-over, ticked
 * prep, read-alouds — stays behind `recap.read`, one night at a time, where
 * the Overview's *Last time* reads it.
 *
 * The screen sits on `CampaignChrome`, which already answers the campaign and
 * the night being prepared; this is the one thing the frame has no reason to
 * know, since it is about the whole record rather than about tonight.
 */

export interface ChronicleSpine {
  /**
   * Newest night first — the server's own order (`session.number desc`), kept
   * rather than re-sorted: it orders by the number the DM gives their nights,
   * and a second sort here could only disagree with it.
   */
  readonly nights: ReadonlyArray<ChronicleNight>;
}

export const loadChronicleSpine = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.map(
    client.chronicle.read({ params: { campaignId } }),
    (nights) => ({ nights }) satisfies ChronicleSpine,
  );

/**
 * What a player's Chronicle reads: the campaign, for its name, and the record
 * **through the narrow projection and through nothing else.**
 *
 * `chronicle.readAsPlayer` is `GET …/chronicle/player` and answers
 * `PlayerChronicleNight`: only the nights the DM shared, on them only the
 * shared beats, and a run named only when its encounter is Shared and Ready.
 * The DM's `chronicle.read` is behind the creator gate and would answer a
 * player a 404 — but the point of the narrow endpoint is that the screen never
 * has to depend on that. Nothing is filtered afterwards; a night the DM kept to
 * themselves is not in the answer at all.
 */
export const loadPlayerChronicle = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, nights] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.chronicle.readAsPlayer({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, nights } satisfies PlayerChronicleView;
  });

export interface PlayerChronicleView {
  readonly campaign: Campaign;
  /** Newest first, and only the nights the DM shared. */
  readonly nights: ReadonlyArray<PlayerChronicleNight>;
}

/** Either audience's night: the card and its body read nothing past these. */
export type AnyChronicleNight = ChronicleNight | PlayerChronicleNight;

/** The `session` rows of a list of nights, for the header and *Jump to*. */
export const sessionsOf = (nights: ReadonlyArray<AnyChronicleNight>): ReadonlyArray<Session> =>
  nights.map((night) => night.session);
