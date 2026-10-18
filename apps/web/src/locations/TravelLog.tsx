import type { CampaignId, LocationId, PartyMoveId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/** What both the creator's and a player's log carry of a move. */
interface Move {
  readonly id: PartyMoveId;
  readonly locationId: LocationId | null;
  readonly locationName: string;
}

/**
 * Where the party has been, newest first: the newest move is where it is now.
 * A place the reader may still see links to its map; one deleted since, or
 * hidden from a player since, keeps its name. The creator may take a move
 * back (`canTakeBack`), after asking, which is how the party is put back
 * where it was.
 */
export function TravelLog({
  campaignId,
  moves,
  canTakeBack,
}: {
  readonly campaignId: CampaignId;
  readonly moves: ReadonlyArray<Move>;
  readonly canTakeBack: boolean;
}) {
  const [takingBack, setTakingBack] = useState<Move>();
  if (moves.length === 0) return null;
  return (
    <section aria-label="Where the party has been" className="flex flex-col gap-3">
      <SectionHeading>Where the party has been</SectionHeading>
      <ol className="flex flex-col gap-1.5">
        {moves.map((move, index) => (
          <li
            key={move.id}
            className="flex min-w-0 items-center gap-2 rounded-card border border-hairline bg-surface-raised px-4 py-2"
          >
            <Icon name="footprints" size={14} className="shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-body-s text-heading">
              {move.locationId === null ? (
                move.locationName
              ) : (
                <Link
                  to="/campaigns/$campaignId/locations"
                  params={{ campaignId }}
                  search={{ place: move.locationId }}
                  className="hover:underline"
                >
                  {move.locationName}
                </Link>
              )}
            </span>
            {index === 0 && <Badge variant="secondary">Here now</Badge>}
            {canTakeBack && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Take back the move to ${move.locationName}`}
                onClick={() => setTakingBack(move)}
              >
                <Icon name="x" size={14} />
              </Button>
            )}
          </li>
        ))}
      </ol>
      {takingBack !== undefined && (
        <TakeBackDialog
          campaignId={campaignId}
          move={takingBack}
          newest={takingBack.id === moves[0]?.id}
          onClose={() => setTakingBack(undefined)}
        />
      )}
    </section>
  );
}

function TakeBackDialog({
  campaignId,
  move,
  newest,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly move: Move;
  readonly newest: boolean;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const takeBack = async () => {
    const done = await submit(
      (client) => client.partyTravel.remove({ params: { campaignId, moveId: move.id } }),
      [reads.partyTravel(campaignId)],
    );
    if (Result.isSuccess(done)) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Take back the move to ${move.locationName}`}>
        <DialogHeader>
          <DialogTitle>Take back the move to {move.locationName}?</DialogTitle>
          <DialogDescription>
            {newest
              ? "The party goes back to where it was before. The place stays shown to the players."
              : "It comes off the record of where the party has been."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void takeBack()}>
            {busy ? "Taking it back…" : "Take it back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
