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
  loadCampaignMagicItems,
  loadMoreCampaignMagicItems,
  NO_MAGIC_ITEM_QUERY,
  type MagicItemQuery,
} from "./load";
import { MagicItemDialog, MagicItemFilters, MagicItemGrid } from "./MagicItemParts";
import { useMagicItemPages } from "./pages";

const campaignMagicItemsAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: MagicItemQuery }) =>
    apiAtom(loadCampaignMagicItems(campaignId, query), [reads.magicItems(campaignId)]),
);

export function MagicItemsScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const [query, setQuery] = useState<MagicItemQuery>(NO_MAGIC_ITEM_QUERY);
  const magicItemsAtom = campaignMagicItemsAtom({ campaignId, query });
  const [resource] = useApiAtom(magicItemsAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useMagicItemPages(resource, query, (query, cursor) =>
    loadMoreCampaignMagicItems(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.magicItems.find((item) => item.id === opened);
  const navigateToName = (name: string) => {
    setQuery({ ...NO_MAGIC_ITEM_QUERY, q: name });
    setOpened(undefined);
  };

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Magic items"
      subtitle={() => (shown === undefined ? undefined : `${pages.magicItems.length} items`)}
      actions={() => <MagicItemFilters query={query} onQuery={setQuery} />}
      extra={magicItemsAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : pages.magicItems.length === 0 ? (
            <EmptyState icon="gem" title="No magic items here">
              Clear a filter, or copy a magic item from the Library into this campaign.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              <MagicItemGrid magicItems={pages.magicItems} onOpen={(item) => setOpened(item.id)} />
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
            <MagicItemDialog
              magicItem={opening}
              onClose={() => setOpened(undefined)}
              onNavigateToName={navigateToName}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}
