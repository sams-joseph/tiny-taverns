import type { Location, LocationId } from "@taverns/api";
import { useSearch } from "@tanstack/react-router";
import { Button, EmptyState, Icon, Loading } from "@taverns/ui";
import { useMemo, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { FilterBar, FilterBox } from "../library/filters";
import { LibraryNav } from "../library/LibraryNav";
import { useFilterQuery } from "../library/query";
import { TopBar } from "../shell/TopBar";
import { DeleteLocationDialog } from "./DeleteLocationDialog";
import { locationKindLabel } from "./kind";
import { LocationDialog } from "./LocationDialog";
import { libraryLocationsAtom } from "./load";
import { PlaceTree } from "./PlaceTree";
import { subtreeIds } from "./tree";

const matches = (needle: string, place: Location): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return [place.name, locationKindLabel(place.kind), place.description ?? ""]
    .join("\n")
    .toLowerCase()
    .includes(term);
};

type Editing =
  | { readonly what: "new"; readonly parentId?: LocationId }
  | { readonly what: "edit"; readonly place: Location };

/**
 * The Library's Locations shelf: the account's own places, as a tree. A place
 * is account-owned like a character, and a campaign has one by placing it
 * (the campaign's Locations), never by copying it, so this is the one place a
 * place is written. *Open it* on a place Hob made lands here with the place
 * named in `?location=`, marked on the tree.
 */
export function LocationLibraryScreen() {
  const filter = useFilterQuery([]);
  const { location: named } = useSearch({ from: "/_shell/library/locations" });
  const [resource, reload] = useApiAtom(libraryLocationsAtom);
  const [editing, setEditing] = useState<Editing | undefined>();
  const [deleting, setDeleting] = useState<Location | undefined>();

  const places = useMemo(() => (resource.state === "ready" ? resource.value : []), [resource]);
  const shown = useMemo(
    () => places.filter((place) => matches(filter.q, place)),
    [filter.q, places],
  );

  return (
    <>
      <TopBar
        centred
        title="Library"
        subtitle={
          resource.state === "ready"
            ? `${String(shown.length)} ${shown.length === 1 ? "place" : "places"}`
            : undefined
        }
        tabs={<LibraryNav />}
      />
      <div className="@container mx-auto flex w-full max-w-overview flex-col gap-6">
        {resource.state === "loading" && <Loading label="Reading your places…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}
        {resource.state === "ready" && (
          <div className="flex flex-col gap-6">
            <FilterBar
              narrowed={filter.narrowed}
              onClear={filter.clear}
              actions={
                <Button size="sm" onClick={() => setEditing({ what: "new" })}>
                  <Icon name="plus" size={13} />
                  New place
                </Button>
              }
            >
              <FilterBox label="Search places" list={filter} />
            </FilterBar>
            {shown.length === 0 ? (
              <EmptyState
                icon={filter.narrowed ? "search" : "map-pin"}
                title={filter.narrowed ? "No places match" : "No places yet"}
              >
                {filter.narrowed
                  ? "Loosen the search to see more places."
                  : "Write a realm, a city or a tavern here, or ask Hob for one, then put it into a campaign from the campaign’s Locations."}
              </EmptyState>
            ) : (
              <PlaceTree
                label="Your places"
                places={shown}
                highlight={named}
                actions={(place) => (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ what: "new", parentId: place.id })}
                    >
                      <Icon name="plus" size={13} />
                      Add inside
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit ${place.name}`}
                      onClick={() => setEditing({ what: "edit", place })}
                    >
                      <Icon name="pencil" size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Delete ${place.name}`}
                      onClick={() => setDeleting(place)}
                    >
                      <Icon name="x" size={14} />
                    </Button>
                  </>
                )}
              />
            )}
          </div>
        )}
      </div>
      {editing !== undefined && (
        <LocationDialog
          place={editing.what === "edit" ? editing.place : undefined}
          places={places}
          {...(editing.what === "new" && editing.parentId !== undefined
            ? { parentId: editing.parentId }
            : {})}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}
      {deleting !== undefined && (
        <DeleteLocationDialog
          place={deleting}
          inside={subtreeIds(places, deleting.id).size - 1}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => setDeleting(undefined)}
        />
      )}
    </>
  );
}
