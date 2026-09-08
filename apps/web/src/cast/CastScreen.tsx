import type { Npc } from "@taverns/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Button, EMPTY_FILTER_VALUE, FilterInput, Icon } from "@taverns/ui";
import { useState } from "react";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { EmptyState } from "../ui/states";
import { npcsAtom } from "./load";
import { NpcCard } from "./NpcCard";
import { NpcDialog } from "./NpcDialog";
import { npcMatches } from "./persona";

/**
 * The cast — the campaign's NPCs, as a grid.
 *
 * A campaign destination shaped like Notes and Encounters: the search box and
 * *New NPC* in the top bar's action slot (this screen's established placement,
 * and there is no tab strip for the tab rule to apply to), the list as the
 * frame's `extra` so the screen still has three states, and a client-side
 * filter over what was loaded — a cast is bounded by a campaign the way its
 * notes are.
 *
 * Creating lands on the new NPC's own screen, where the rehearsal is: the
 * point of writing one is to hear it, and the card's *Rehearse* goes to the
 * same place.
 */
export function CastScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER_VALUE);
  const [editing, setEditing] = useState<{ readonly npc: Npc | undefined }>();

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Cast"
      extra={npcsAtom(campaignId)}
      subtitle={({ extra }) =>
        extra.length === 0
          ? "The people your players will meet"
          : `${String(extra.length)} ${extra.length === 1 ? "person" : "people"} your players will meet`
      }
      actions={() => (
        <>
          <FilterInput
            label="Search the cast"
            value={filter}
            onChange={setFilter}
            facets={[]}
            className="min-h-control-sm max-w-52 py-0.5"
          />
          <Button variant="secondary" size="sm" onClick={() => setEditing({ npc: undefined })}>
            <Icon name="plus" size={14} />
            New NPC
          </Button>
        </>
      )}
    >
      {({ view, extra: npcs }) => {
        const shown = npcs.filter((npc) => npcMatches(filter.text, npc));
        return (
          <>
            {npcs.length === 0 ? (
              <EmptyState icon="user-round" title="Nobody in the cast yet">
                The ferryman, the patron, the innkeeper who knows too much. Write one with{" "}
                <span className="text-heading">New NPC</span> above, then rehearse them before the
                night.
              </EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState icon="search" title="Nothing matches">
                Nobody here answers to &ldquo;{filter.text.trim()}&rdquo;. Loosen the search, or
                clear it.
              </EmptyState>
            ) : (
              <div className="@container">
                <ul className="grid list-none grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {shown.map((npc) => (
                    <li key={npc.id} className="min-w-0">
                      <NpcCard npc={npc} onEdit={() => setEditing({ npc })} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editing !== undefined && (
              <NpcDialog
                key={editing.npc?.id ?? "new-npc"}
                campaignId={view.campaign.id}
                npc={editing.npc}
                onClose={() => setEditing(undefined)}
                onSaved={(saved) => {
                  const created = editing.npc === undefined;
                  setEditing(undefined);
                  if (created) {
                    void navigate({
                      to: "/campaigns/$campaignId/cast/$npcId",
                      params: { campaignId, npcId: saved.id },
                    });
                  }
                }}
              />
            )}
          </>
        );
      }}
    </CampaignChrome>
  );
}
