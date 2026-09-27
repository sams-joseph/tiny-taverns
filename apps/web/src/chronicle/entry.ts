import type {
  AssistantThreadId,
  AssistantTurnId,
  CampaignCharacterId,
  PartySeat,
  Session,
} from "@taverns/api";
import { seatName } from "./spotlight";

/**
 * The rules about a night's written entry — its summary, its title and whose
 * night it was — apart from the cards that draw them, so each is tested on its
 * own.
 */

/**
 * The night the composer writes up: **the newest night that has been played,
 * while it has no summary.** Live or ended; a night that was never started has
 * nothing to write about. Once the newest night has one, there is no composer
 * card: an older night is written up from inside its own card (*Write a
 * summary*), so the card above the list is always about the night just played,
 * never a queue of old ones.
 *
 * `sessions` is newest first, `sessions.list`'s own order.
 */
export const nightToWriteUp = (sessions: ReadonlyArray<Session>): Session | undefined => {
  const newest = sessions.find((session) => session.startedAt !== null);
  return newest !== undefined && newest.summary === null ? newest : undefined;
};

/**
 * Whose night it was, by name — or nothing.
 *
 * Nothing when no seat was picked, and nothing too when the seat is not in the
 * party this reader holds: the server already answers a player `null` for a
 * seat they cannot read, and a seat that has left the table has no name here
 * to give. A line that said *"Spotlight on someone"* would be a stub.
 */
export const spotlightName = (
  session: Session,
  party: ReadonlyArray<PartySeat>,
): string | undefined => {
  const seat = session.spotlightSeatId;
  if (seat === null) return undefined;
  const row = party.find((candidate) => candidate.seat.id === seat);
  return row === undefined ? undefined : seatName(row);
};

/** A Hob draft the composer is holding: what the accept names, and the words it offered. */
export interface HeldDraft {
  readonly threadId: AssistantThreadId;
  readonly turnId: AssistantTurnId;
  readonly text: string;
}

/**
 * The `PATCH` the composer sends, from what is in its fields.
 *
 * - **The title is only what the DM typed**, trimmed, and blank is `null`: an
 *   untitled night is "Session N" on every screen.
 * - **The spotlight is sent as picked**, `null` for nobody, so un-picking is
 *   the reverse of picking.
 * - **The summary is left out when it is Hob's draft, unedited**: the accept
 *   has already written those exact words, stamped `assistant` with the turn.
 *   Edited, it is sent, and the server keeps the summary's origin as it does
 *   an edited note's.
 */
export const entryPatch = (fields: {
  readonly title: string;
  readonly summary: string;
  readonly spotlightSeatId: CampaignCharacterId | null;
  readonly draft: HeldDraft | undefined;
}): {
  readonly title: string | null;
  readonly spotlightSeatId: CampaignCharacterId | null;
  readonly summary?: string;
} => {
  const title = fields.title.trim();
  const summary = fields.summary.trim();
  const base = { title: title === "" ? null : title, spotlightSeatId: fields.spotlightSeatId };
  return fields.draft !== undefined && fields.draft.text.trim() === summary
    ? base
    : { ...base, summary };
};
