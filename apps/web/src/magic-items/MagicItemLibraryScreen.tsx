import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { Hob, useHobPanel } from "../hob";
import { ShowMore } from "../library/filters";
import { listCount, useFilterQuery } from "../library/query";
import { LibraryNav } from "../library/LibraryNav";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import {
  loadMagicItemLibrary,
  loadMoreLibraryMagicItems,
  MAGIC_ITEM_FACETS,
  magicItemQueryOf,
  type MagicItemQuery,
} from "./load";
import { useMagicItemPages } from "./pages";
import {
  MagicItemDialog,
  MagicItemFilters,
  MagicItemFormDialog,
  MagicItemGrid,
} from "./MagicItemParts";

const libraryMagicItemsAtom = Atom.family((query: MagicItemQuery) =>
  apiAtom(loadMagicItemLibrary(query), [reads.libraryMagicItems]),
);

const countOf = (n: number, narrowed: boolean, more: boolean): string =>
  listCount(
    n,
    { one: "magic item", many: "magic items" },
    { narrowed, hasMore: more, empty: "Nothing here yet", suffix: "yours, and the bundled corpus" },
  );

export function MagicItemLibraryScreen() {
  const list = useFilterQuery(MAGIC_ITEM_FACETS);
  const [sort, setSort] = useState<MagicItemQuery["sort"]>("name");
  const query = magicItemQueryOf(list, sort);
  const [resource, reload] = useApiAtom(libraryMagicItemsAtom(query));
  const [opened, setOpened] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | "new" | undefined>();
  const hob = useHobPanel({ initialOpen: false });

  const pages = useMagicItemPages(resource, query, loadMoreLibraryMagicItems);
  const shown = pages.shown;
  const opening = pages.magicItems.find((item) => item.id === opened);
  const editingItem = pages.magicItems.find((item) => item.id === editing);
  const navigateToName = (name: string) => {
    list.onChange({ text: name, filters: [], match: "all" });
    setOpened(undefined);
  };

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
              : countOf(pages.magicItems.length, list.narrowed, pages.hasMore)
          }
          tabs={<LibraryNav />}
        />
      }
    >
      {shown === undefined && resource.state === "loading" && (
        <Loading label="Reading the hoard…" />
      )}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {shown !== undefined && resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          <MagicItemFilters
            list={list}
            sort={sort}
            onSort={setSort}
            busy={resource.state === "loading"}
            actions={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Icon name="gem" size={13} />
                Write magic item
              </Button>
            }
          />
          {pages.magicItems.length === 0 ? (
            <EmptyState icon="gem" title="No magic items here">
              {list.narrowed ? (
                "Loosen a filter, or clear the search — the bundled corpus is in this list too."
              ) : (
                <>
                  Write an item, or load the bundled 2014 SRD corpus with{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server magic-item:import
                  </code>
                  .
                </>
              )}
            </EmptyState>
          ) : (
            <MagicItemGrid
              magicItems={pages.magicItems}
              onOpen={(item) => setOpened(item.id)}
              onEdit={(item) => setEditing(item.id)}
            />
          )}
          <ShowMore
            hasMore={pages.hasMore}
            loadingMore={pages.loadingMore}
            onMore={pages.loadMore}
            count={pages.magicItems.length}
            failure={pages.moreFailure}
          />
        </div>
      )}
      {opening !== undefined && (
        <MagicItemDialog
          magicItem={opening}
          onClose={() => setOpened(undefined)}
          onNavigateToName={navigateToName}
        />
      )}
      {editing === "new" && <MagicItemFormDialog onClose={() => setEditing(undefined)} />}
      {editingItem !== undefined && (
        <MagicItemFormDialog magicItem={editingItem} onClose={() => setEditing(undefined)} />
      )}
    </AppShell>
  );
}
