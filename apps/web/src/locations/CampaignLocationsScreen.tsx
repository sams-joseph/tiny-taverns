import type { CampaignId, CampaignLocation, Location, SharedWorldId } from "@taverns/api";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Icon,
  Loading,
  Toggle,
} from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { SaveFailure } from "../ui/form";
import { libraryLocationsAtom, tableAtlasAtom } from "./load";
import { PlaceTree } from "./PlaceTree";
import { TableMap } from "./TableMap";
import { TravelLog } from "./TravelLog";

/**
 * A table's places, as its creator arranges them: every place in the
 * campaign's world — its Shared World, or its own hidden one — which every
 * campaign there shares, with this table's reveals.
 *
 * *Add from your Library* places one of the creator's own places, with
 * everything inside it; *Take out* is its reverse, for a place the creator put
 * there. *Shown to players* is this table's alone. Another creator's place in
 * the same world is read-only here: its owner edits it on their shelf.
 */
export function CampaignLocationsScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const { place: open } = useSearch({ from: "/_shell/campaigns/$campaignId/locations" });
  const [adding, setAdding] = useState(false);
  const { busy, failure, submit } = useMutation();

  const reveal = (place: CampaignLocation, shown: boolean) =>
    void submit(
      (client) =>
        shown
          ? client.locations.reveal({ params: { campaignId, locationId: place.id } })
          : client.locations.unreveal({ params: { campaignId, locationId: place.id } }),
      [reads.locations(campaignId)],
    );
  const moveParty = (place: CampaignLocation) =>
    void submit(
      (client) =>
        client.partyTravel.move({ params: { campaignId }, payload: { locationId: place.id } }),
      // The move reveals the place too.
      [reads.partyTravel(campaignId), reads.locations(campaignId)],
    );
  const takeOut = (place: CampaignLocation, worldId: SharedWorldId) =>
    void submit(
      (client) => client.locations.unplace({ params: { campaignId, locationId: place.id } }),
      // Every table in the world loses it, and the reveals it carried.
      [reads.locations(campaignId), reads.worldLocations(worldId)],
    );

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Locations"
      centred
      extra={tableAtlasAtom(campaignId)}
      subtitle={({ extra: { places, moves } }) => {
        const shown = places.filter((place) => place.revealed).length;
        const at = moves[0];
        return [
          `${String(places.length)} ${places.length === 1 ? "place" : "places"}`,
          `${String(shown)} shown to players`,
          ...(at === undefined ? [] : [`the party is at ${at.locationName}`]),
        ].join(" · ");
      }}
      actions={() => (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} />
          Add from your Library
        </Button>
      )}
    >
      {({ view, extra: { places: extra, moves } }) => (
        <>
          {failure !== undefined && (
            <div className="mb-4">
              <SaveFailure failure={failure} />
            </div>
          )}
          {open !== undefined && (
            <div className="mb-6">
              <TableMap
                campaignId={campaignId}
                places={extra}
                placeId={open}
                partyAt={moves[0]?.locationId ?? undefined}
              />
            </div>
          )}
          {extra.length === 0 ? (
            <EmptyState icon="map-pin" title="No places at this table yet">
              Put a place from your Library here with{" "}
              <span className="text-heading">Add from your Library</span>, or ask Hob for one. In a
              Shared World, the places other creators add are here too.
            </EmptyState>
          ) : (
            <PlaceTree
              label="Places at this table"
              places={extra}
              highlight={open}
              name={(place) => (
                <Link
                  to="/campaigns/$campaignId/locations"
                  params={{ campaignId }}
                  search={{ place: place.id }}
                  className="hover:underline"
                >
                  {place.name}
                </Link>
              )}
              aside={(place) =>
                place.mine ? undefined : (
                  <p className="text-caption leading-body text-faint">From {place.ownerName}</p>
                )
              }
              actions={(place) => (
                <>
                  <Toggle
                    size="sm"
                    className="rounded-pill"
                    pressed={place.revealed}
                    disabled={busy}
                    onPressedChange={(pressed) => reveal(place, pressed)}
                  >
                    <Icon name={place.revealed ? "eye" : "eye-off"} size={13} />
                    {place.revealed ? "Shown to players" : "Hidden"}
                  </Toggle>
                  {moves[0]?.locationId !== place.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => moveParty(place)}
                    >
                      <Icon name="users" size={13} />
                      Move the party here
                    </Button>
                  )}
                  {place.mine && place.placed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => takeOut(place, view.campaign.contextId)}
                    >
                      Take out
                    </Button>
                  )}
                </>
              )}
            />
          )}
          <div className="mt-6">
            <TravelLog campaignId={campaignId} moves={moves} canTakeBack />
          </div>
          {adding && (
            <AddFromLibraryDialog
              campaignId={campaignId}
              worldId={view.campaign.contextId}
              here={extra}
              onClose={() => setAdding(false)}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}

/**
 * Putting one of the creator's own places at this table, which puts it in the
 * campaign's world: every place on their shelf that is not here already.
 */
function AddFromLibraryDialog({
  campaignId,
  worldId,
  here,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly worldId: SharedWorldId;
  readonly here: ReadonlyArray<CampaignLocation>;
  readonly onClose: () => void;
}) {
  const [shelf, retry] = useApiAtom(libraryLocationsAtom);
  const { busy, failure, submit } = useMutation();
  const present = new Set(here.map((place) => place.id));
  const choices: ReadonlyArray<Location> =
    shelf.state === "ready" ? shelf.value.filter((place) => !present.has(place.id)) : [];

  const place = async (chosen: Location) => {
    await submit(
      (client) => client.locations.place({ params: { campaignId, locationId: chosen.id } }),
      // Every table in the world has it now.
      [reads.locations(campaignId), reads.worldLocations(worldId)],
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Add a place from your Library" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from your Library</DialogTitle>
          <DialogDescription>
            A place comes with every place inside it. In a Shared World, every campaign there has it
            too; your notes stay yours, and nothing is shown to players until you reveal it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
          {shelf.state === "loading" && <Loading label="Reading your places…" />}
          {shelf.state === "failed" && <ApiFailureNotice failure={shelf.failure} onRetry={retry} />}
          {shelf.state === "ready" &&
            (choices.length === 0 ? (
              <p className="text-body-s leading-body text-muted-foreground">
                Every place on your shelf is here already.{" "}
                <Link to="/library/locations" className="text-accent underline">
                  Write a new one in your Library.
                </Link>
              </p>
            ) : (
              <PlaceTree
                label="Your places"
                places={choices}
                actions={(chosen) => (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void place(chosen)}
                  >
                    Add here
                  </Button>
                )}
              />
            ))}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
