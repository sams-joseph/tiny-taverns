import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { Hob, useHobPanel } from "../hob";
import { LibraryNav } from "../library/LibraryNav";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import {
  loadEquipmentLibrary,
  loadMoreLibraryEquipment,
  NO_EQUIPMENT_QUERY,
  type EquipmentQuery,
} from "./load";
import { equipmentCount, useEquipmentPages } from "./pages";
import {
  EquipmentDialog,
  EquipmentFilters,
  EquipmentFormDialog,
  EquipmentGrid,
} from "./EquipmentParts";

const libraryEquipmentAtom = Atom.family((query: EquipmentQuery) =>
  apiAtom(loadEquipmentLibrary(query), [reads.libraryEquipment]),
);

export function EquipmentLibraryScreen() {
  const [query, setQuery] = useState<EquipmentQuery>(NO_EQUIPMENT_QUERY);
  const [resource, reload] = useApiAtom(libraryEquipmentAtom(query));
  const [opened, setOpened] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | "new" | undefined>();
  const hob = useHobPanel({ initialOpen: false });

  const pages = useEquipmentPages(resource, query, loadMoreLibraryEquipment);
  const shown = pages.shown;
  const opening = pages.equipment.find((item) => item.id === opened);
  const editingItem = pages.equipment.find((item) => item.id === editing);

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title="Library"
          subtitle={
            shown === undefined ? undefined : equipmentCount(pages.equipment.length, pages.hasMore)
          }
        >
          <LibraryNav />
          <EquipmentFilters query={query} onQuery={setQuery} />
          <Button size="sm" onClick={() => setEditing("new")}>
            <Icon name="package" size={13} />
            Write equipment
          </Button>
        </TopBar>
      }
    >
      {shown === undefined && resource.state === "loading" && (
        <Loading label="Reading the equipment…" />
      )}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {shown !== undefined && resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          {pages.equipment.length === 0 ? (
            <EmptyState icon="package" title="No equipment here">
              Clear a filter, write an item, or load the bundled 2014 SRD corpus with{" "}
              <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                pnpm -F server equipment:import
              </code>
              .
            </EmptyState>
          ) : (
            <>
              <EquipmentGrid
                equipment={pages.equipment}
                onOpen={(item) => setOpened(item.id)}
                onEdit={(item) => setEditing(item.id)}
              />
              {pages.hasMore && (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={pages.loadMore} disabled={pages.loadingMore}>
                    {pages.loadingMore ? "Reading…" : "Show more"}
                  </Button>
                </div>
              )}
              {pages.moreFailure !== undefined && (
                <FailureNotice failure={pages.moreFailure} onRetry={pages.loadMore} />
              )}
            </>
          )}
        </div>
      )}
      {opening !== undefined && (
        <EquipmentDialog
          equipment={opening}
          campaigns={shown?.campaigns ?? []}
          onClose={() => setOpened(undefined)}
        />
      )}
      {editing === "new" && <EquipmentFormDialog onClose={() => setEditing(undefined)} />}
      {editingItem !== undefined && (
        <EquipmentFormDialog equipment={editingItem} onClose={() => setEditing(undefined)} />
      )}
    </AppShell>
  );
}
