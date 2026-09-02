import type { CampaignId } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { ShowMore } from "../library/filters";
import { useListQuery } from "../library/query";
import { EmptyState } from "../ui/states";
import {
  loadCampaignSpells,
  loadMoreCampaignSpells,
  NO_SPELL_QUERY,
  spellClear,
  spellNarrows,
  type SpellQuery,
} from "./load";
import { useSpellPages } from "./pages";
import { SpellDialog, SpellFilters, SpellGrid } from "./SpellParts";

const campaignSpellsAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: SpellQuery }) =>
    apiAtom(loadCampaignSpells(campaignId, query), [reads.spells(campaignId)]),
);

export function SpellbookScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const list = useListQuery(NO_SPELL_QUERY, {
    narrows: spellNarrows,
    onClear: (query) => spellClear(query, NO_SPELL_QUERY),
  });
  const spellAtom = campaignSpellsAtom({ campaignId, query: list.query });
  const [resource] = useApiAtom(spellAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useSpellPages(resource, list.query, (query, cursor) =>
    loadMoreCampaignSpells(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.spells.find((spell) => spell.id === opened);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Spells"
      subtitle={() => (shown === undefined ? undefined : `${pages.spells.length} spells`)}
      extra={spellAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : (
            <div className="flex flex-col gap-6">
              <SpellFilters list={list} busy={resource.state === "loading"} />
              {pages.spells.length === 0 ? (
                <EmptyState icon="book-open" title="No spells here">
                  Clear a filter, or copy a spell from the Library into this campaign.
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
        </>
      )}
    </CampaignChrome>
  );
}
