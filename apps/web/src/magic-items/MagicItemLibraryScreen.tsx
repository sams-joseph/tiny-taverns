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
  loadMagicItemLibrary,
  loadMoreLibraryMagicItems,
  NO_MAGIC_ITEM_QUERY,
  type MagicItemQuery,
} from "./load";
import { magicItemCount, useMagicItemPages } from "./pages";
import {
  MagicItemDialog,
  MagicItemFilters,
  MagicItemFormDialog,
  MagicItemGrid,
} from "./MagicItemParts";

const libraryMagicItemsAtom = Atom.family((query: MagicItemQuery) =>
  apiAtom(loadMagicItemLibrary(query), [reads.libraryMagicItems]),
);

export function MagicItemLibraryScreen() {
  const [query, setQuery] = useState<MagicItemQuery>(NO_MAGIC_ITEM_QUERY);
  const [resource, reload] = useApiAtom(libraryMagicItemsAtom(query));
  const [opened, setOpened] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | "new" | undefined>();
  const hob = useHobPanel({ initialOpen: false });

  const pages = useMagicItemPages(resource, query, loadMoreLibraryMagicItems);
  const shown = pages.shown;
  const opening = pages.magicItems.find((item) => item.id === opened);
  const editingItem = pages.magicItems.find((item) => item.id === editing);
  const navigateToName = (name: string) => {
    setQuery({ ...NO_MAGIC_ITEM_QUERY, q: name });
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
            shown === undefined ? undefined : magicItemCount(pages.magicItems.length, pages.hasMore)
          }
        >
          <LibraryNav />
          <MagicItemFilters query={query} onQuery={setQuery} />
          <Button size="sm" onClick={() => setEditing("new")}>
            <Icon name="gem" size={13} />
            Write magic item
          </Button>
        </TopBar>
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
          {pages.magicItems.length === 0 ? (
            <EmptyState icon="gem" title="No magic items here">
              Clear a filter, write an item, or load the bundled 2014 SRD corpus with{" "}
              <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                pnpm -F server magic-item:import
              </code>
              .
            </EmptyState>
          ) : (
            <>
              <MagicItemGrid
                magicItems={pages.magicItems}
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
        <MagicItemDialog
          magicItem={opening}
          campaigns={shown?.campaigns ?? []}
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
