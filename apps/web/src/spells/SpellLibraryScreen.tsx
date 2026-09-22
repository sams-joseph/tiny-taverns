import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { ShowMore } from "../library/filters";
import { listCount, useFilterQuery } from "../library/query";
import { LibraryNav } from "../library/LibraryNav";
import { TopBar } from "../shell/TopBar";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import {
  loadMoreLibrarySpells,
  loadSpellLibrary,
  SPELL_FACETS,
  spellQueryOf,
  type SpellQuery,
} from "./load";
import { useSpellPages } from "./pages";
import { SpellCreateDialog, SpellDialog, SpellFilters, SpellGrid } from "./SpellParts";

const librarySpellsAtom = Atom.family((query: SpellQuery) =>
  apiAtom(loadSpellLibrary(query), [reads.librarySpells]),
);

const countOf = (n: number, narrowed: boolean, more: boolean): string =>
  listCount(
    n,
    { one: "spell", many: "spells" },
    { narrowed, hasMore: more, empty: "Nothing here yet", suffix: "yours, and the bundled corpus" },
  );

export function SpellLibraryScreen() {
  const list = useFilterQuery(SPELL_FACETS);
  const [sort, setSort] = useState<SpellQuery["sort"]>("level");
  const query = spellQueryOf(list, sort);
  const [resource, reload] = useApiAtom(librarySpellsAtom(query));
  const [opened, setOpened] = useState<string | undefined>();
  const [writing, setWriting] = useState(false);

  const pages = useSpellPages(resource, query, loadMoreLibrarySpells);
  const shown = pages.shown;
  const opening = pages.spells.find((spell) => spell.id === opened);

  return (
    <>
      <TopBar
        title="Library"
        subtitle={
          shown === undefined
            ? undefined
            : countOf(pages.spells.length, list.narrowed, pages.hasMore)
        }
        tabs={<LibraryNav />}
      />
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
          <SpellFilters
            list={list}
            sort={sort}
            onSort={setSort}
            busy={resource.state === "loading"}
            actions={
              <Button size="sm" onClick={() => setWriting(true)}>
                <Icon name="plus" size={13} />
                Write a spell
              </Button>
            }
          />
          {pages.spells.length === 0 ? (
            <EmptyState icon="book-open" title="No spells here">
              {list.narrowed ? (
                "Loosen a filter, or clear the search — the bundled corpus is in this list too."
              ) : (
                <>
                  Write a spell, or load the bundled 2014 SRD corpus with{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server spell:import
                  </code>
                  .
                </>
              )}
            </EmptyState>
          ) : (
            <SpellGrid spells={pages.spells} onOpen={(spell) => setOpened(spell.id)} />
          )}
          <ShowMore
            hasMore={pages.hasMore}
            loadingMore={pages.loadingMore}
            onMore={pages.loadMore}
            count={pages.spells.length}
            failure={pages.moreFailure}
          />
        </div>
      )}
      {opening !== undefined && (
        <SpellDialog spell={opening} onClose={() => setOpened(undefined)} />
      )}
      {writing && <SpellCreateDialog onClose={() => setWriting(false)} />}
    </>
  );
}
