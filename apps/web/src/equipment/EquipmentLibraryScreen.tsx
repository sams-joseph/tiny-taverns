import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { Hob, useHobPanel } from "../hob";
import { ShowMore } from "../library/filters";
import { listCount, useListQuery } from "../library/query";
import { LibraryNav } from "../library/LibraryNav";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import {
  equipmentClear,
  equipmentNarrows,
  loadEquipmentLibrary,
  loadMoreLibraryEquipment,
  NO_EQUIPMENT_QUERY,
  type EquipmentQuery,
} from "./load";
import { useEquipmentPages } from "./pages";
import {
  EquipmentDialog,
  EquipmentFilters,
  EquipmentFormDialog,
  EquipmentGrid,
} from "./EquipmentParts";

const libraryEquipmentAtom = Atom.family((query: EquipmentQuery) =>
  apiAtom(loadEquipmentLibrary(query), [reads.libraryEquipment]),
);

const countOf = (n: number, narrowed: boolean, more: boolean): string =>
  listCount(
    n,
    { one: "item", many: "items" },
    { narrowed, hasMore: more, empty: "Nothing here yet", suffix: "yours, and the bundled corpus" },
  );

export function EquipmentLibraryScreen() {
  const list = useListQuery(NO_EQUIPMENT_QUERY, {
    narrows: equipmentNarrows,
    onClear: (query) => equipmentClear(query, NO_EQUIPMENT_QUERY),
  });
  const [resource, reload] = useApiAtom(libraryEquipmentAtom(list.query));
  const [opened, setOpened] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | "new" | undefined>();
  const hob = useHobPanel({ initialOpen: false });

  const pages = useEquipmentPages(resource, list.query, loadMoreLibraryEquipment);
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
            shown === undefined
              ? undefined
              : countOf(pages.equipment.length, list.narrowed, pages.hasMore)
          }
          tabs={<LibraryNav />}
        />
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
          <EquipmentFilters
            list={list}
            busy={resource.state === "loading"}
            actions={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Icon name="package" size={13} />
                Write equipment
              </Button>
            }
          />
          {pages.equipment.length === 0 ? (
            <EmptyState icon="package" title="No equipment here">
              {list.narrowed ? (
                "Loosen a filter, or clear the search — the bundled corpus is in this list too."
              ) : (
                <>
                  Write an item, or load the bundled 2014 SRD corpus with{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server equipment:import
                  </code>
                  .
                </>
              )}
            </EmptyState>
          ) : (
            <EquipmentGrid
              equipment={pages.equipment}
              onOpen={(item) => setOpened(item.id)}
              onEdit={(item) => setEditing(item.id)}
            />
          )}
          <ShowMore
            hasMore={pages.hasMore}
            loadingMore={pages.loadingMore}
            onMore={pages.loadMore}
            count={pages.equipment.length}
            failure={pages.moreFailure}
          />
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
