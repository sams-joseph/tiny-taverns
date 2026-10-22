import type { Location, LocationId, LocationPin } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Button, EmptyState, Icon, Loading, SectionHeading } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useMemo, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { LibraryNav } from "../library/LibraryNav";
import { usePictureActions } from "../pictures/usePictureActions";
import { TopBar } from "../shell/TopBar";
import { SaveFailure } from "../ui/form";
import { locationKindLabel } from "./kind";
import { LocationDialog } from "./LocationDialog";
import { libraryLocationsAtom } from "./load";
import { PlaceMap } from "./PlaceMap";

/** The place's parents, outermost first, from the shelf's flat list. */
const ancestorsOf = (places: ReadonlyArray<Location>, place: Location): ReadonlyArray<Location> => {
  const byId = new Map(places.map((candidate) => [candidate.id, candidate] as const));
  const chain: Array<Location> = [];
  let parentId = place.parentId;
  while (parentId !== null && !chain.some((seen) => seen.id === parentId)) {
    const parent = byId.get(parentId);
    if (parent === undefined) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
};

/**
 * One of the owner's places, as its map: the picture, the places inside it
 * pinned on it, and the way in and out. Here the owner drags a pin to move it,
 * puts an unpinned place on the map, takes one off, replaces or removes the
 * picture, and draws one for a place that has never had one.
 */
export function LocationMapScreen() {
  const { locationId } = useParams({ from: "/_shell/library/locations/$locationId" });
  const navigate = useNavigate();
  const [resource, reload] = useApiAtom(libraryLocationsAtom);
  const [placing, setPlacing] = useState<LocationId>();
  const [editing, setEditing] = useState(false);
  const { busy, failure, submit } = useMutation();
  const invalidate = useInvalidate();

  const places = useMemo(() => (resource.state === "ready" ? resource.value : []), [resource]);
  const place = places.find((candidate) => candidate.id === locationId);
  const inside = useMemo(
    () => places.filter((candidate) => candidate.parentId === locationId),
    [places, locationId],
  );
  const ancestors = useMemo(
    () => (place === undefined ? [] : ancestorsOf(places, place)),
    [places, place],
  );
  const parent = ancestors.at(-1);

  useHobDrawingPolling(
    place?.imagePending === true,
    useCallback(() => invalidate([reads.libraryLocations]), [invalidate]),
  );
  const picture = usePictureActions({
    subject: "location",
    subjectId: locationId,
    hasPicture: place?.image !== null && place?.image !== undefined,
    noun: "picture",
    invalidates: [reads.libraryLocations],
  });

  const open = (id: LocationId) =>
    void navigate({ to: "/library/locations/$locationId", params: { locationId: id } });
  const pin = (child: { readonly id: LocationId }, at: LocationPin | null) =>
    void submit(
      (client) =>
        client.libraryLocations.update({ params: { locationId: child.id }, payload: { pin: at } }),
      // Every table and world reading the place answers this key too.
      [reads.libraryLocations],
    );
  const draw = async () => {
    const drawn = await submit(
      (client) => client.libraryLocations.draw({ params: { locationId } }),
      [reads.libraryLocations],
    );
    if (Result.isSuccess(drawn)) reload();
  };

  const unpinned = inside.filter((child) => child.pin === null);
  const pinned = inside.filter((child) => child.pin !== null);

  return (
    <>
      <TopBar
        centred
        title={place?.name ?? "Library"}
        subtitle={place === undefined ? undefined : locationKindLabel(place.kind)}
        tabs={<LibraryNav />}
      >
        {place !== undefined && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={14} />
              Edit
            </Button>
            {!place.pictured && !place.imagePending && (
              <Button size="sm" disabled={busy} onClick={() => void draw()}>
                <Icon name="wand-sparkles" size={14} />
                Draw it
              </Button>
            )}
            {picture.buttons}
          </>
        )}
      </TopBar>
      <div className="@container mx-auto flex w-full max-w-overview flex-col gap-6">
        {resource.state === "loading" && <Loading label="Reading your places…" />}
        {resource.state === "failed" && (
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        )}
        {resource.state === "ready" && place === undefined && (
          <EmptyState icon="map-pin" title="That place is not on your shelf">
            <Link to="/library/locations" className="text-accent underline">
              Back to your places
            </Link>
          </EmptyState>
        )}
        {place !== undefined && (
          <>
            <nav
              aria-label="Where it is"
              className="flex flex-wrap items-center gap-1.5 text-caption"
            >
              <Link to="/library/locations" className="text-muted-foreground hover:text-heading">
                Your places
              </Link>
              {ancestors.map((ancestor) => (
                <span key={ancestor.id} className="flex items-center gap-1.5">
                  <Icon name="chevron-right" size={12} className="text-faint" />
                  <Link
                    to="/library/locations/$locationId"
                    params={{ locationId: ancestor.id }}
                    className="text-muted-foreground hover:text-heading"
                  >
                    {ancestor.name}
                  </Link>
                </span>
              ))}
              <Icon name="chevron-right" size={12} className="text-faint" />
              <span aria-current="page" className="text-heading">
                {place.name}
              </span>
            </nav>
            {failure !== undefined && <SaveFailure failure={failure} />}
            <PlaceMap
              place={place}
              inside={inside}
              onEnter={(child) => open(child.id)}
              {...(parent === undefined
                ? {}
                : { onUp: () => open(parent.id), upLabel: parent.name })}
              // The pins are what Hob is drawing around, so they hold still until it is done.
              {...(place.imagePending
                ? {}
                : {
                    editing: {
                      onPin: (child, at) => pin(child, at),
                      placing: inside.find((child) => child.id === placing),
                      onPlaced: () => setPlacing(undefined),
                    },
                  })}
            />
            {inside.length > 0 && (
              <section aria-label="Places inside it" className="flex flex-col gap-3">
                <SectionHeading>Places inside it</SectionHeading>
                <ul className="flex flex-col gap-2">
                  {[...unpinned, ...pinned].map((child) => (
                    <li
                      key={child.id}
                      className="flex flex-wrap items-center gap-2 rounded-card border border-hairline bg-surface-raised px-4 py-2"
                    >
                      <Link
                        to="/library/locations/$locationId"
                        params={{ locationId: child.id }}
                        className="min-w-0 flex-1 truncate text-body-s font-semibold text-heading hover:underline"
                      >
                        {child.name}
                      </Link>
                      <span className="text-caption text-muted-foreground">
                        {locationKindLabel(child.kind)}
                      </span>
                      {child.pin === null ? (
                        <Button
                          variant={placing === child.id ? "secondary" : "outline"}
                          size="sm"
                          disabled={place.imagePending || busy}
                          onClick={() => setPlacing(placing === child.id ? undefined : child.id)}
                        >
                          <Icon name="map-pin" size={13} />
                          {placing === child.id ? "Press the map…" : "Put on the map"}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => pin(child, null)}
                        >
                          Take off the map
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
      {picture.dialogs}
      {editing && place !== undefined && (
        <LocationDialog
          place={place}
          places={places}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  );
}
