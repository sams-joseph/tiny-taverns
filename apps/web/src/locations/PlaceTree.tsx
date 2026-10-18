import type { LocationId, LocationKind } from "@taverns/api";
import { Badge, Icon } from "@taverns/ui";
import type { ReactNode } from "react";
import { locationKindLabel } from "./kind";
import { type PlaceNode, placeTree } from "./tree";

/** What every read of a place carries, which is all a row needs to draw itself. */
interface Place {
  readonly id: LocationId;
  readonly parentId: LocationId | null;
  readonly kind: LocationKind;
  readonly name: string;
  readonly description: string | null;
}

/**
 * Places as a nested list: each one's name and kind, what a visitor finds, and
 * the places inside it indented under it. The shelf, a table and a player all
 * draw this; what differs is the controls each row carries (`actions`) and any
 * line under the name (`aside`).
 */
export function PlaceTree<A extends Place>({
  places,
  label,
  actions,
  aside,
  name,
  highlight,
}: {
  readonly places: ReadonlyArray<A>;
  readonly label: string;
  /** The place's name as the row draws it, when it is a link somewhere. */
  readonly name?: (place: A) => ReactNode;
  readonly actions?: (place: A) => ReactNode;
  readonly aside?: (place: A) => ReactNode;
  /** A place to mark, the one a link named. */
  readonly highlight?: LocationId | undefined;
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {placeTree(places).map((node) => (
        <PlaceBranch
          key={node.place.id}
          node={node}
          actions={actions}
          aside={aside}
          name={name}
          highlight={highlight}
        />
      ))}
    </ul>
  );
}

function PlaceBranch<A extends Place>({
  node,
  actions,
  aside,
  name,
  highlight,
}: {
  readonly node: PlaceNode<A>;
  readonly actions: ((place: A) => ReactNode) | undefined;
  readonly aside: ((place: A) => ReactNode) | undefined;
  readonly name: ((place: A) => ReactNode) | undefined;
  readonly highlight: LocationId | undefined;
}) {
  const { place, children } = node;
  return (
    <li className="flex flex-col gap-2">
      <div
        data-slot="place-row"
        data-highlighted={place.id === highlight ? "" : undefined}
        className="flex min-w-0 items-start gap-3 rounded-card border border-hairline bg-surface-raised px-4 py-3 data-highlighted:border-accent"
      >
        <Icon name="map-pin" size={16} className="mt-0.5 shrink-0 text-faint" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-body leading-snug font-semibold text-heading">
              {name === undefined ? place.name : name(place)}
            </span>
            <Badge variant="outline">{locationKindLabel(place.kind)}</Badge>
          </div>
          {place.description !== null && (
            <p className="line-clamp-2 text-caption leading-body text-muted-foreground">
              {place.description}
            </p>
          )}
          {aside?.(place)}
        </div>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {actions(place)}
          </div>
        )}
      </div>
      {children.length > 0 && (
        <ul className="ml-5 flex flex-col gap-2 border-l border-hairline pl-4">
          {children.map((child) => (
            <PlaceBranch
              key={child.place.id}
              node={child}
              actions={actions}
              aside={aside}
              name={name}
              highlight={highlight}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
