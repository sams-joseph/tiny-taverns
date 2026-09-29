import type { CampaignId, Encounter, EncounterId, EncounterPlacement } from "@taverns/api";
import { Result } from "effect";
import { useEffect, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { placed } from "./encounterList";

/**
 * One move the DM made on this visit, and the frame's order when it was made.
 */
export interface PendingMove {
  readonly encounterId: EncounterId;
  readonly placement: EncounterPlacement;
  /** The frame's ids, in order, at the press. */
  readonly framed: ReadonlyArray<EncounterId>;
  /** The server took it, and the frame's next read is its answer. */
  readonly sent?: true;
}

const sameOrder = (
  encounters: ReadonlyArray<Pick<Encounter, "id">>,
  ids: ReadonlyArray<EncounterId>,
): boolean =>
  encounters.length === ids.length && encounters.every((encounter, at) => encounter.id === ids[at]);

/**
 * The frame's list with the move laid over it, for as long as the frame still
 * holds the order the move was made on. Once it holds any other — its re-read
 * after the move, or somebody else's write — the frame's own order is the
 * answer and the move stops applying.
 */
export const orderOver = <E extends Pick<Encounter, "id">>(
  encounters: ReadonlyArray<E>,
  pending: PendingMove | undefined,
): ReadonlyArray<E> =>
  pending === undefined || !sameOrder(encounters, pending.framed)
    ? encounters
    : placed(encounters, pending.encounterId, pending.placement);

/**
 * The DM's move, laid over the frame's encounters until its read catches up:
 * the row lands in its new place on the press, not a round trip later. The
 * pins' overlay on the Notes page is the precedent (`usePins`).
 *
 * The move remembers the frame's order it was made on and applies only while
 * the frame still holds it (`orderOver`). A refused move drops it, so the row
 * goes back and the failure is said; a refused write re-reads nothing
 * (`useMutation`). One move at a time (`busy`), held until the frame has read
 * again after the move, so an answer never lands over a later move. The write
 * names `reads.encounters`, which the list, the prep and so the Overview and the
 * start dialog all answer.
 */
export const useEncounterOrder = (campaignId: CampaignId, encounters: ReadonlyArray<Encounter>) => {
  const { busy, failure, submit } = useMutation();
  const [pending, setPending] = useState<PendingMove | undefined>();

  // A frame that has moved on, or read again once the move was sent, has
  // answered the move: forget it, so a later return to the old order is not
  // mistaken for the moment it was made in.
  useEffect(() => {
    setPending((current) =>
      current === undefined || current.sent === true || !sameOrder(encounters, current.framed)
        ? undefined
        : current,
    );
  }, [encounters]);

  const move = async (encounterId: EncounterId, placement: EncounterPlacement) => {
    setPending({ encounterId, placement, framed: encounters.map((encounter) => encounter.id) });
    const params = { campaignId, encounterId };
    // One call per arm: the derived client spreads a union payload over its
    // overloads and accepts neither arm handed the union whole.
    const done = await submit(
      (client) =>
        "before" in placement
          ? client.encounters.move({ params, payload: { before: placement.before } })
          : client.encounters.move({ params, payload: { after: placement.after } }),
      [reads.encounters(campaignId)],
    );
    setPending((current) =>
      Result.isFailure(done) || current === undefined ? undefined : { ...current, sent: true },
    );
    return Result.isSuccess(done);
  };

  return {
    ordered: orderOver(encounters, pending),
    move,
    busy: busy || pending !== undefined,
    failure,
  };
};
