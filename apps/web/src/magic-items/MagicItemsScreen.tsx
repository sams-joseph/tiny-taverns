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
  loadCampaignMagicItems,
  loadMoreCampaignMagicItems,
  magicItemClear,
  magicItemNarrows,
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
  const list = useListQuery(NO_MAGIC_ITEM_QUERY, {
    narrows: magicItemNarrows,
    onClear: (query) => magicItemClear(query, NO_MAGIC_ITEM_QUERY),
  });
  const magicItemsAtom = campaignMagicItemsAtom({ campaignId, query: list.query });
  const [resource] = useApiAtom(magicItemsAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useMagicItemPages(resource, list.query, (query, cursor) =>
    loadMoreCampaignMagicItems(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.magicItems.find((item) => item.id === opened);
  const navigateToName = (name: string) => {
    list.clear();
    list.setTerm(name);
    setOpened(undefined);
  };

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Magic items"
      subtitle={() => (shown === undefined ? undefined : `${pages.magicItems.length} items`)}
      extra={magicItemsAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : (
            <div className="flex flex-col gap-6">
              <MagicItemFilters list={list} busy={resource.state === "loading"} />
              {pages.magicItems.length === 0 ? (
                <EmptyState icon="gem" title="No magic items here">
                  Clear a filter, or copy a magic item from the Library into this campaign.
                </EmptyState>
              ) : (
                <MagicItemGrid
                  magicItems={pages.magicItems}
                  onOpen={(item) => setOpened(item.id)}
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
        </>
      )}
    </CampaignChrome>
  );
}
