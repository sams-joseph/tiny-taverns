import type { CampaignId } from "@taverns/api";
import { Button } from "@taverns/ui";
import { useParams } from "@tanstack/react-router";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { EmptyState, FailureNotice } from "../ui/states";
import {
  loadCampaignSpells,
  loadMoreCampaignSpells,
  NO_SPELL_QUERY,
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
  const [query, setQuery] = useState<SpellQuery>(NO_SPELL_QUERY);
  const spellAtom = campaignSpellsAtom({ campaignId, query });
  const [resource] = useApiAtom(spellAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useSpellPages(resource, query, (query, cursor) =>
    loadMoreCampaignSpells(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.spells.find((spell) => spell.id === opened);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Spells"
      subtitle={() => (shown === undefined ? undefined : `${pages.spells.length} spells`)}
      actions={() => <SpellFilters query={query} onQuery={setQuery} />}
      extra={spellAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : pages.spells.length === 0 ? (
            <EmptyState icon="book-open" title="No spells here">
              Clear a filter, or copy a spell from the Library into this campaign.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
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
