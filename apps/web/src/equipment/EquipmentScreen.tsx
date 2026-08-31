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
  const [query, setQuery] = useState<EquipmentQuery>(NO_EQUIPMENT_QUERY);
  const equipmentAtom = campaignEquipmentAtom({ campaignId, query });
  const [resource] = useApiAtom(equipmentAtom);
  const [opened, setOpened] = useState<string | undefined>();

  const pages = useEquipmentPages(resource, query, (query, cursor) =>
    loadMoreCampaignEquipment(campaignId, query, cursor),
  );
  const shown = pages.shown;
  const opening = pages.equipment.find((item) => item.id === opened);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Equipment"
      subtitle={() => (shown === undefined ? undefined : `${pages.equipment.length} items`)}
      actions={() => <EquipmentFilters query={query} onQuery={setQuery} />}
      extra={equipmentAtom}
    >
      {() => (
        <>
          {shown === undefined ? null : pages.equipment.length === 0 ? (
            <EmptyState icon="package" title="No equipment here">
              Clear a filter, or copy equipment from the Library into this campaign.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              <EquipmentGrid equipment={pages.equipment} onOpen={(item) => setOpened(item.id)} />
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
            <EquipmentDialog equipment={opening} onClose={() => setOpened(undefined)} />
          )}
        </>
      )}
    </CampaignChrome>
  );
}
