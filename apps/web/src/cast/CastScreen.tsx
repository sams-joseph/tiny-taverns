import { type Npc, type NpcId, UNNAMED_NPC } from "@taverns/api";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Button, EMPTY_FILTER_VALUE, EmptyState, FilterInput, Icon } from "@taverns/ui";
import { Result } from "effect";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { SaveFailure } from "../ui/form";
import { npcsAtom } from "./load";
import { useNpcSavers } from "./npcAutosave";
import { NpcCard } from "./NpcCard";
import { NpcDrawer } from "./NpcDrawer";
import { npcMatches } from "./persona";

/**
 * The cast — the campaign's NPCs, as the redesign draws the tab
 * (`Campaign Overview.dc.html`): a header, a filter row, and a grid of cards,
 * with the NPC chosen open in a drawer beside them.
 *
 * **Centred at the Overview's width** (`CampaignChrome`'s `centred`), header
 * included, and scrolled by the window. The header holds the count and two
 * presses: the outline *Archived*, the way back to what the drawer's *Archive*
 * took off this shelf, and a secondary *Add NPC* — secondary rather than the
 * drawing's peach, because the campaign row's press is this screen's one
 * primary.
 *
 * **The search is in the body**, on a filter row above the grid, as the Notes
 * tab's is: a client-side filter over what was loaded, because a cast is
 * bounded by a campaign the way its notes are. The row is not drawn over an
 * empty cast, where there is nothing to filter.
 *
 * **The grid is the drawing's `auto-fill` over a `--cast-card-min` floor**, so
 * its columns follow the room the page has, a docked Hob panel included, and
 * never a viewport breakpoint. Each card opens its NPC from anywhere on its
 * face (`NpcCard`).
 *
 * **A card opens the NPC's drawer** (`NpcDrawer`), and the choice is the URL's
 * (`?npc=`), written with `replace` as the Notes tab's is, so a reload or a
 * shared link lands on it and *Back* leaves the tab. A choice the cast does
 * not list — archived, or not an NPC of this campaign — is no choice, and the
 * address says so. The drawer saves as you type (`npcAutosave.ts`), one saver
 * per NPC for as long as the tab is open.
 *
 * **Add NPC makes the NPC at once**, as drawn: blank, under `UNNAMED_NPC`, the
 * DM's alone as every new row is, and opens its drawer with the name focused.
 * It has no portrait yet — the name is never drawn from — and Hob draws one
 * from the first role the DM gives it.
 */
export function CastScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const { npc: chosen } = useSearch({ strict: false });
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER_VALUE);
  /** The NPC *Add NPC* just made, until the cast's own read has it. */
  const [created, setCreated] = useState<Npc>();
  /** The same NPC, until its drawer closes: its name is focused as it opens. */
  const [fresh, setFresh] = useState<NpcId>();
  /** Bumped by a *Reload*, so the drawer starts over from the row read again. */
  const [reloads, setReloads] = useState(0);
  const { busy, failure, submit } = useMutation();
  const { saverFor, forget } = useNpcSavers(campaignId);
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

  const choose = useCallback(
    (npcId: NpcId | undefined) => {
      if (npcId === undefined) setFresh(undefined);
      void navigate({
        to: "/campaigns/$campaignId/cast",
        params: { campaignId },
        search: npcId === undefined ? {} : { npc: npcId },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, campaignId],
  );

  const addNpc = async () => {
    const made = await submit(
      (client) =>
        client.npcs.create({
          params: { campaignId },
          payload: { name: UNNAMED_NPC, visibility: "dm" },
        }),
      [reads.npcs(campaignId)],
    );
    if (Result.isFailure(made)) return;
    // A new NPC is found wherever the search was: clear it.
    setFilter(EMPTY_FILTER_VALUE);
    setCreated(made.success);
    setFresh(made.success.id);
    choose(made.success.id);
  };

  const reload = async (npc: Npc) => {
    const read = await submit(
      (client) => client.npcs.findById({ params: { campaignId, npcId: npc.id } }),
      [reads.npcs(campaignId), reads.npc(npc.id)],
    );
    if (Result.isFailure(read)) return;
    forget(npc.id);
    saverFor(read.success);
    setReloads((count) => count + 1);
  };

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Cast"
      centred
      extra={npcsAtom(campaignId)}
      subtitle={({ extra }) => {
        const count = withCreated(created, extra).length;
        return count === 0 ? "No NPCs yet" : `${String(count)} ${count === 1 ? "NPC" : "NPCs"}`;
      }}
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
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void addNpc()}>
            <Icon name="user-plus" size={14} />
            Add NPC
          </Button>
        </>
      )}
    >
      {({ extra }) => {
        const npcs = withCreated(created, extra);
        return (
          <>
            {failure !== undefined && (
              <div className="mb-4">
                <SaveFailure failure={failure} />
              </div>
            )}
            {npcs.length === 0 ? (
              <EmptyState icon="user-round" title="Nobody in the cast yet">
                The ferryman, the patron, the innkeeper who knows too much. Start one with{" "}
                <span className="text-heading">Add NPC</span> above, or copy one in from your
                Library, then rehearse them on their page before the night.
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
                <CastGrid
                  npcs={npcs.filter((npc) => npcMatches(filter.text, npc))}
                  chosen={chosen}
                />
              </div>
            )}
            <ChosenNpc
              npcs={npcs}
              chosen={chosen}
              render={(npc) => (
                <NpcDrawer
                  key={`${npc.id}:${String(reloads)}`}
                  npc={npc}
                  saver={saverFor(npc)}
                  focusName={fresh === npc.id}
                  onClose={() => choose(undefined)}
                  onArchived={() => {
                    forget(npc.id);
                    setCreated((made) => (made?.id === npc.id ? undefined : made));
                    choose(undefined);
                  }}
                  onReload={() => void reload(npc)}
                />
              )}
              onUnknown={() => choose(undefined)}
            />
          </>
        );
      }}
    </CampaignChrome>
  );
}

/** The cast's NPCs, and the one *Add NPC* made until the cast's read has it. */
const withCreated = (created: Npc | undefined, npcs: ReadonlyArray<Npc>): ReadonlyArray<Npc> =>
  created !== undefined && !npcs.some((npc) => npc.id === created.id) ? [created, ...npcs] : npcs;

/**
 * The drawer for the NPC the address names, when the cast lists them. A choice
 * it does not list is taken off the address, so a stale link does not sit
 * there naming nobody.
 */
function ChosenNpc({
  npcs,
  chosen,
  render,
  onUnknown,
}: {
  readonly npcs: ReadonlyArray<Npc>;
  readonly chosen: NpcId | undefined;
  readonly render: (npc: Npc) => ReactNode;
  readonly onUnknown: () => void;
}) {
  const npc = chosen === undefined ? undefined : npcs.find((row) => row.id === chosen);
  const unknown = chosen !== undefined && npc === undefined;
  useEffect(() => {
    if (unknown) onUnknown();
  }, [unknown, onUnknown]);
  return npc === undefined ? null : render(npc);
}

function CastGrid({
  npcs,
  chosen,
}: {
  readonly npcs: ReadonlyArray<Npc>;
  readonly chosen: NpcId | undefined;
}) {
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
          <NpcCard npc={npc} chosen={npc.id === chosen} />
        </li>
      ))}
    </ul>
  );
}
