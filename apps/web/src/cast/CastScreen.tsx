import type { Npc } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Button, EMPTY_FILTER_VALUE, EmptyState, FilterInput, Icon } from "@taverns/ui";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { npcsAtom } from "./load";
import { NpcCard } from "./NpcCard";
import { NpcDialog } from "./NpcDialog";
import { npcMatches } from "./persona";

/**
 * The cast — the campaign's NPCs, as the redesign draws the tab
 * (`Campaign Overview.dc.html`): a header, a filter row, and a grid of cards.
 *
 * **Centred at the Overview's width** (`CampaignChrome`'s `centred`), header
 * included, and scrolled by the window. The header holds the count and two
 * presses: the outline *Archived*, the way back to what the NPC page's
 * *Archive* took off this shelf, and a secondary *Add NPC* — secondary rather
 * than the drawing's peach, because the campaign row's press is this screen's
 * one primary.
 *
 * **The search is in the body**, on a filter row above the grid, as the Notes
 * tab's is: a client-side filter over what was loaded, because a cast is
 * bounded by a campaign the way its notes are. The row is not drawn over an
 * empty cast, where there is nothing to filter.
 *
 * **The grid is the drawing's `auto-fill` over a `--cast-card-min` floor**, so
 * its columns follow the room the page has, a docked Hob panel included, and
 * never a viewport breakpoint. Each card opens its NPC's page from anywhere on
 * its face (`NpcCard`), where editing, sharing, rehearsing and Hob's proposals
 * live. Creating lands on that page too.
 */
export function CastScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER_VALUE);
  const [creating, setCreating] = useState(false);
  // While Hob draws a new NPC's portrait, re-read the cast until it lands.
  const [cast] = useApiAtom(npcsAtom(campaignId));
  const invalidate = useInvalidate();
  const rereadCast = useCallback(
    () => invalidate([reads.npcs(campaignId)]),
    [invalidate, campaignId],
  );
  useHobDrawingPolling(
    cast.state === "ready" && cast.value.some((npc) => npc.imagePending),
    rereadCast,
  );

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Cast"
      centred
      extra={npcsAtom(campaignId)}
      subtitle={({ extra }) =>
        extra.length === 0
          ? "No NPCs yet"
          : `${String(extra.length)} ${extra.length === 1 ? "NPC" : "NPCs"}`
      }
      actions={() => (
        <>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId/cast/archived" params={{ campaignId }} />}
          >
            <Icon name="archive" size={14} />
            Archived
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            <Icon name="user-plus" size={14} />
            Add NPC
          </Button>
        </>
      )}
    >
      {({ view, extra: npcs }) => (
        <>
          {npcs.length === 0 ? (
            <EmptyState icon="user-round" title="Nobody in the cast yet">
              The ferryman, the patron, the innkeeper who knows too much. Write one with{" "}
              <span className="text-heading">Add NPC</span> above, or copy one in from your Library,
              then rehearse them on their page before the night.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-5">
              <div data-slot="cast-filters" className="flex flex-wrap items-center gap-3">
                <FilterInput
                  label="Search the cast"
                  value={filter}
                  onChange={setFilter}
                  facets={[]}
                  className="w-full max-w-cast-search"
                />
              </div>
              <CastGrid npcs={npcs.filter((npc) => npcMatches(filter.text, npc))} />
            </div>
          )}

          {creating && (
            <NpcDialog
              campaignId={view.campaign.id}
              npc={undefined}
              onClose={() => setCreating(false)}
              onSaved={(saved) => {
                setCreating(false);
                void navigate({
                  to: "/campaigns/$campaignId/cast/$npcId",
                  params: { campaignId, npcId: saved.id },
                });
              }}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}

function CastGrid({ npcs }: { readonly npcs: ReadonlyArray<Npc> }) {
  if (npcs.length === 0) {
    return (
      <EmptyState icon="search" title="Nobody here">
        Loosen the search, or add the NPC you just made up.
      </EmptyState>
    );
  }
  return (
    <ul
      data-slot="cast-grid"
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,var(--spacing-cast-card)),1fr))] gap-4 p-0"
    >
      {npcs.map((npc) => (
        <li key={npc.id} className="min-w-0">
          <NpcCard npc={npc} />
        </li>
      ))}
    </ul>
  );
}
