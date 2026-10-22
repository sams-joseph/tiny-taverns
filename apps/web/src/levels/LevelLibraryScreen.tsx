import type { LevelSummary } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cardLinkClassName,
  EmptyState,
  Icon,
  Loading,
} from "@taverns/ui";
import { useMemo, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { FilterBar, FilterBox } from "../library/filters";
import { LibraryNav } from "../library/LibraryNav";
import { useFilterQuery } from "../library/query";
import { TopBar } from "../shell/TopBar";
import { DeleteLevelDialog } from "./DeleteLevelDialog";
import { libraryLevelsAtom } from "./load";
import { NewLevelDialog } from "./NewLevelDialog";
import { partsLine, sizeLine } from "./size";

const matches = (needle: string, level: LevelSummary): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return [level.name, level.description ?? ""].join("\n").toLowerCase().includes(term);
};

/**
 * One level on the shelf. **The card opens its page** from anywhere on its
 * face (`/library/levels/$levelId`); *Delete* stays the card's own and does
 * not navigate.
 */
function LevelCard({
  level,
  onDelete,
}: {
  readonly level: LevelSummary;
  readonly onDelete: () => void;
}) {
  return (
    <Card linked className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <CardTitle>
              <Link
                to="/library/levels/$levelId"
                params={{ levelId: level.id }}
                data-card-link
                className={cardLinkClassName}
              >
                {level.name}
              </Link>
            </CardTitle>
            <p className="text-caption leading-body text-muted-foreground">{sizeLine(level)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-7 shrink-0"
            aria-label={`Delete ${level.name}`}
            onClick={onDelete}
          >
            <Icon name="trash-2" size={14} />
          </Button>
        </div>
        {level.description !== null && (
          <CardDescription className="line-clamp-3">{level.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto">
        <p data-slot="level-parts" className="mb-0 text-caption leading-body text-muted-foreground">
          {partsLine({
            walls: level.wallCount,
            props: level.propCount,
            lights: level.lightCount,
            regions: level.regionCount,
          })}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The Library's Levels shelf: the account's own battle maps. A level is
 * account-owned like a place, so this is the one place one is made or
 * deleted. A new level opens on its page.
 */
export function LevelLibraryScreen() {
  const filter = useFilterQuery([]);
  const navigate = useNavigate();
  const [resource, reload] = useApiAtom(libraryLevelsAtom);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LevelSummary | undefined>();

  const shown = useMemo(
    () =>
      resource.state === "ready" ? resource.value.filter((level) => matches(filter.q, level)) : [],
    [filter.q, resource],
  );

  return (
    <>
      <TopBar
        centred
        title="Library"
        subtitle={
          resource.state === "ready"
            ? `${String(shown.length)} ${shown.length === 1 ? "level" : "levels"}`
            : undefined
        }
        tabs={<LibraryNav />}
      />
      <div className="@container mx-auto flex w-full max-w-overview flex-col gap-6">
        {resource.state === "loading" && <Loading label="Reading your levels…" />}
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
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Icon name="plus" size={13} />
                  New level
                </Button>
              }
            >
              <FilterBox label="Search levels" list={filter} />
            </FilterBar>
            {shown.length === 0 ? (
              <EmptyState
                icon={filter.narrowed ? "search" : "grid-3x3"}
                title={filter.narrowed ? "No levels match" : "No levels yet"}
              >
                {filter.narrowed
                  ? "Loosen the search to see more levels."
                  : "Start a level here: a battle map of floors, walls, doors and lights."}
              </EmptyState>
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
                {shown.map((level) => (
                  <LevelCard key={level.id} level={level} onDelete={() => setDeleting(level)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {creating && (
        <NewLevelDialog
          onClose={() => setCreating(false)}
          onCreated={(level) => {
            setCreating(false);
            void navigate({ to: "/library/levels/$levelId", params: { levelId: level.id } });
          }}
        />
      )}
      {deleting !== undefined && (
        <DeleteLevelDialog
          level={deleting}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => setDeleting(undefined)}
        />
      )}
    </>
  );
}
