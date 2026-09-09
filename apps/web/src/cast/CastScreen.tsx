import type { CampaignId, Npc, NpcSource } from "@taverns/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EMPTY_FILTER_VALUE,
  FilterInput,
  Icon,
} from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { SaveFailure } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { npcsAtom } from "./load";
import { NpcCard } from "./NpcCard";
import { NpcDialog } from "./NpcDialog";
import { npcMatches } from "./persona";

const sourceDescription = (source: NpcSource): string => {
  const summary = source.persona.identity?.summary?.trim() ?? "";
  if (summary !== "") return summary;
  const manner = source.persona.voice?.manner?.trim() ?? "";
  if (manner !== "") return manner;
  return "No persona written yet.";
};

const npcSourcesAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom((client) => client.npcs.sources({ params: { campaignId } }), [reads.libraryNpcs]),
);

function AddNpcFromLibraryDialog({
  campaignId,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly onClose: () => void;
}) {
  const [resource, reload] = useApiAtom(npcSourcesAtom(campaignId));
  const { busy, failure, submit } = useMutation();

  const copy = async (source: NpcSource) => {
    const saved = await submit(
      (client) =>
        client.npcs.copyFromSource({ params: { campaignId, sourceNpcId: source.id }, payload: {} }),
      [reads.npcs(campaignId)],
    );
    if (Result.isSuccess(saved)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Add NPC from Library">
        <DialogHeader>
          <DialogTitle>Add from Library</DialogTitle>
          <DialogDescription>
            Choose a reusable NPC source. Add from Library creates an independent Cast snapshot:
            later source edits do not update it, and another creator's group-shared secrets are not
            copied.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
          {resource.state === "loading" && <Loading label="Reading NPC sources…" />}
          {resource.state === "failed" && (
            <FailureNotice failure={resource.failure} onRetry={reload} />
          )}
          {resource.state === "ready" && resource.value.length === 0 && (
            <p className="text-body text-muted">No NPC sources are available yet.</p>
          )}
          {resource.state === "ready" &&
            resource.value.map((source) => (
              <Button
                key={source.id}
                variant="outline"
                className="h-auto justify-start py-3 text-left"
                onClick={() => void copy(source)}
                disabled={busy}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-label font-semibold text-heading">
                    {source.name}
                  </span>
                  <span className="line-clamp-2 text-caption text-muted">
                    {sourceDescription(source)}
                  </span>
                </span>
              </Button>
            ))}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [copying, setCopying] = useState(false);

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
          <Button variant="outline" size="sm" onClick={() => setCopying(true)}>
            <Icon name="copy" size={14} />
            Add from Library
          </Button>
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
                <span className="text-heading">New NPC</span> above, add reusable sources from the
                Library, then Rehearse them before the night.
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
                      <NpcCard
                        npc={npc}
                        currentSessionId={view.session?.id}
                        onEdit={() => setEditing({ npc })}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {copying && (
              <AddNpcFromLibraryDialog
                campaignId={view.campaign.id}
                onClose={() => setCopying(false)}
              />
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
