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
  equipmentClear,
  equipmentNarrows,
  loadCampaignEquipment,
  loadMoreCampaignEquipment,
  NO_EQUIPMENT_QUERY,
  type EquipmentQuery,
} from "./load";
import { useEquipmentPages } from "./pages";
import { EquipmentDialog, EquipmentFilters, EquipmentGrid } from "./EquipmentParts";

const campaignEquipmentAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: EquipmentQuery }) =>
    apiAtom(loadCampaignEquipment(campaignId, query), [reads.equipment(campaignId)]),
);

export function EquipmentScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const list = useListQuery(NO_EQUIPMENT_QUERY, {
    narrows: equipmentNarrows,
    onClear: (query) => equipmentClear(query, NO_EQUIPMENT_QUERY),
  });
  const equipmentAtom = campaignEquipmentAtom({ campaignId, query: list.query });
  const [resource] = useApiAtom(equipmentAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useEquipmentPages(resource, list.query, (query, cursor) =>
    loadMoreCampaignEquipment(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.equipment.find((item) => item.id === opened);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Equipment"
      subtitle={() => (shown === undefined ? undefined : `${pages.equipment.length} items`)}
      extra={equipmentAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : (
            <div className="flex flex-col gap-6">
              <EquipmentFilters list={list} busy={resource.state === "loading"} />
              {pages.equipment.length === 0 ? (
                <EmptyState icon="package" title="No equipment here">
                  Clear a filter, or copy equipment from the Library into this campaign.
                </EmptyState>
              ) : (
                <EquipmentGrid equipment={pages.equipment} onOpen={(item) => setOpened(item.id)} />
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
            <EquipmentDialog equipment={opening} onClose={() => setOpened(undefined)} />
          )}
        </>
      )}
    </CampaignChrome>
  );
}
