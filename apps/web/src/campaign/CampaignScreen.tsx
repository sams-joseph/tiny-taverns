import type { CampaignId } from "@taverns/api";
import { Badge, Icon, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@taverns/ui";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import type { Route } from "../routes";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { EncounterCard } from "./EncounterCard";
import { loadCampaignView, matches, type CampaignView } from "./load";
import { NotesList } from "./NotesList";
import { PartyList } from "./PartyList";
import { PrepChecklist } from "./PrepChecklist";

/**
 * The campaign view — `ui_kits/dm-screen/CampaignHome.jsx`, against the real API.
 *
 * The prototype's shape is kept exactly: three tabs on the left, the checklist
 * in a `--aside-w` sunken card on the right, encounter cards in an auto-filling
 * grid. What changed is where the data comes from and what happens when it is
 * not there — the four states a real screen has (loading, failed, empty, and
 * empty-because-you-searched) are the whole difference between this and a
 * scaffold.
 */

const subtitleFor = (view: CampaignView): string | undefined => {
  const parts = [
    view.session === undefined ? undefined : `Session ${view.session.number}`,
    view.campaign.partyName ?? undefined,
  ].filter((part): part is string => part !== undefined && part !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
};

function CampaignBody({ view, search }: { readonly view: CampaignView; readonly search: string }) {
  const encounters = view.encounters.filter((encounter) =>
    matches(search, encounter.name, ...encounter.tags),
  );
  const notes = view.notes.filter((note) => matches(search, note.title, note.body));
  const party = view.party.filter((character) =>
    matches(search, character.name, character.playerName, character.descriptor),
  );

  // Counted over every note, not the filtered ones: a card's own count should
  // not move because the DM typed in the search box.
  const noteCounts = new Map<string, number>();
  for (const note of view.notes) {
    if (note.attachedTo !== null) {
      noteCounts.set(note.attachedTo.id, (noteCounts.get(note.attachedTo.id) ?? 0) + 1);
    }
  }

  const nothingMatches = (
    <EmptyState icon="search" title="Nothing matches">
      Nothing here answers to &ldquo;{search.trim()}&rdquo;. Loosen the search, or clear it.
    </EmptyState>
  );

  return (
    <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
      {/* A container query, not a viewport one: the tab column's width is what
          decides how many encounter cards fit, and it changes when the aside
          docks beside it. `@lg` (32rem) and `@3xl` (48rem) are the *column's*
          widths, and they are where the prototype's
          `auto-fill minmax(250px, 1fr)` turns over: two cards need 516px, three
          need 782px. Same result, without a raw px literal. */}
      <div className="@container min-w-0 flex-1">
        <Tabs defaultValue="encounters">
          <TabsList>
            <TabsTrigger value="encounters">
              <Icon name="swords" size={13} />
              Encounters
            </TabsTrigger>
            <TabsTrigger value="notes">
              <Icon name="scroll-text" size={13} />
              Notes
            </TabsTrigger>
            <TabsTrigger value="party">
              <Icon name="users" size={13} />
              Party
            </TabsTrigger>
          </TabsList>

          <TabsContent value="encounters">
            {view.encounters.length === 0 ? (
              <EmptyState icon="swords" title="No encounters yet">
                Nothing is waiting for the party. Whatever you write for this campaign lands here,
                ready to run.
              </EmptyState>
            ) : encounters.length === 0 ? (
              nothingMatches
            ) : (
              <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                {encounters.map((encounter) => (
                  <EncounterCard
                    key={encounter.id}
                    encounter={encounter}
                    noteCount={noteCounts.get(encounter.id) ?? 0}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes">
            {view.notes.length === 0 ? (
              <EmptyState icon="scroll-text" title="No notes yet">
                The thing you meant to remember when the party opens the crate goes here. Read-aloud
                prose too.
              </EmptyState>
            ) : notes.length === 0 ? (
              nothingMatches
            ) : (
              <NotesList notes={notes} encounters={view.encounters} />
            )}
          </TabsContent>

          <TabsContent value="party">
            {view.party.length === 0 ? (
              <EmptyState icon="users" title="Nobody at the table yet">
                The characters your players are running show up here, with their AC and hit points.
              </EmptyState>
            ) : party.length === 0 ? (
              nothingMatches
            ) : (
              <PartyList party={party} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <aside className="xl:w-aside xl:shrink-0">
        <PrepChecklist
          key={view.session?.id ?? view.campaign.id}
          campaignId={view.campaign.id}
          sessionId={view.session?.id}
          items={view.prep}
        />
      </aside>
    </div>
  );
}

export function CampaignScreen({
  campaignId,
  route,
}: {
  readonly campaignId: CampaignId;
  readonly route: Route;
}) {
  // Memoised on the id alone: its identity is what tells `useApiResource` to
  // load again, so an unmemoised closure here would load forever.
  const load = useCallback(
    (client: TavernsClient) => loadCampaignView(campaignId)(client),
    [campaignId],
  );
  const [resource, reload] = useApiResource(load);
  const [search, setSearch] = useState("");

  const view = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      route={route}
      railFooter={
        view === undefined ? undefined : (
          <>
            <p className="text-body-s leading-body font-semibold text-on-dark">
              {view.campaign.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {view.session !== undefined && <Badge>Session {view.session.number}</Badge>}
              <span className="text-caption leading-snug text-on-dark-muted">
                {view.campaign.playerCount} {view.campaign.playerCount === 1 ? "player" : "players"}
              </span>
            </div>
          </>
        )
      }
      topBar={
        <TopBar title={view?.campaign.name ?? "Campaign"} subtitle={view && subtitleFor(view)}>
          {view !== undefined && (
            <Input
              aria-label="Search this campaign"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-control-sm w-44"
            />
          )}
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading the campaign…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {view !== undefined && <CampaignBody view={view} search={search} />}
    </AppShell>
  );
}
