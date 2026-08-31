import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { Hob, useHobPanel } from "../hob";
import { LibraryNav } from "../library/LibraryNav";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadMoreLibrarySpells, loadSpellLibrary, NO_SPELL_QUERY, type SpellQuery } from "./load";
import { useSpellPages } from "./pages";
import { SpellCreateDialog, SpellDialog, SpellFilters, SpellGrid } from "./SpellParts";

const librarySpellsAtom = Atom.family((query: SpellQuery) =>
  apiAtom(loadSpellLibrary(query), [reads.librarySpells]),
);

const countOf = (count: number, more: boolean): string => {
  const spells = `${count} ${count === 1 ? "spell" : "spells"}`;
  return more ? `The first ${spells}` : spells;
};

export function SpellLibraryScreen() {
  const [query, setQuery] = useState<SpellQuery>(NO_SPELL_QUERY);
  const [resource, reload] = useApiAtom(librarySpellsAtom(query));
  const [opened, setOpened] = useState<string | undefined>();
  const [writing, setWriting] = useState(false);
  const hob = useHobPanel({ initialOpen: false });

  const pages = useSpellPages(resource, query, loadMoreLibrarySpells);
  const shown = pages.shown;
  const opening = pages.spells.find((spell) => spell.id === opened);

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title="Library"
          subtitle={shown === undefined ? undefined : countOf(pages.spells.length, pages.hasMore)}
        >
          <LibraryNav />
          <SpellFilters query={query} onQuery={setQuery} />
          <Button size="sm" onClick={() => setWriting(true)}>
            <Icon name="plus" size={13} />
            Write a spell
          </Button>
        </TopBar>
      }
    >
      {shown === undefined && resource.state === "loading" && (
        <Loading label="Reading the spells…" />
      )}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {shown !== undefined && resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          {pages.spells.length === 0 ? (
            <EmptyState icon="book-open" title="No spells here">
              Clear a filter, write one, or load the bundled 2014 SRD corpus with{" "}
              <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                pnpm -F server spell:import
              </code>
              .
            </EmptyState>
          ) : (
            <>
              <SpellGrid spells={pages.spells} onOpen={(spell) => setOpened(spell.id)} />
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
        <SpellDialog
          spell={opening}
          campaigns={shown?.campaigns ?? []}
          onClose={() => setOpened(undefined)}
        />
      )}
      {writing && <SpellCreateDialog onClose={() => setWriting(false)} />}
    </AppShell>
  );
}
