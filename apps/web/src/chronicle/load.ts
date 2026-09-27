import type {
  Campaign,
  CampaignId,
  ChronicleNight,
  PartySeat,
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
  /**
   * A model answers behind Hob, so the composer offers *Ask Hob to draft*.
   * Read with the record rather than by the card: the composer sits above
   * every night, and a card that grew after the page drew would push down the
   * night a `?session=` link had just scrolled to. A failed status read is the
   * honest *no*: the DM writes by hand.
   */
  readonly hobAvailable: boolean;
}

export const loadChronicleSpine = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.map(
    Effect.all(
      [
        client.chronicle.read({ params: { campaignId } }),
        client.hob.status({ params: { campaignId } }).pipe(
          Effect.map((status) => status.available),
          Effect.orElseSucceed(() => false),
        ),
      ],
      { concurrency: "unbounded" },
    ),
    ([nights, hobAvailable]) => ({ nights, hobAvailable }) satisfies ChronicleSpine,
  );

/**
 * What a player's Chronicle reads: the campaign, for its name, the party that
 * names a shared night's spotlight, and the record **through the narrow
 * projection and through nothing else.**
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
    const [campaign, nights, party] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.chronicle.readAsPlayer({ params: { campaignId } }),
        client.party.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, nights, party } satisfies PlayerChronicleView;
  });

export interface PlayerChronicleView {
  readonly campaign: Campaign;
  /** Newest first, and only the nights the DM shared. */
  readonly nights: ReadonlyArray<PlayerChronicleNight>;
  /**
   * The seats this player may read (`party.list`, `rowReadable`), which is
   * what names a shared night's spotlight. A seat kept from them is not here,
   * and the server has already answered its pointer `null`.
   */
  readonly party: ReadonlyArray<PartySeat>;
}

/** Either audience's night: the card and its body read nothing past these. */
export type AnyChronicleNight = ChronicleNight | PlayerChronicleNight;

/** The `session` rows of a list of nights, for the header and *Jump to*. */
export const sessionsOf = (nights: ReadonlyArray<AnyChronicleNight>): ReadonlyArray<Session> =>
  nights.map((night) => night.session);
