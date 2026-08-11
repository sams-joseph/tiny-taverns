import type { CampaignId, Encounter, EncounterId, Note } from "@taverns/api";
import { Badge, Button, Icon, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@taverns/ui";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { hrefFor, useRoute, type Route } from "../routes";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { EncounterCard } from "./EncounterCard";
import { EncounterDialog } from "./EncounterDialog";
import { FinishSessionDialog } from "./FinishSessionDialog";
import { loadCampaignView, matches, type CampaignView } from "./load";
import { NoteDialog } from "./NoteDialog";
import { NotesList } from "./NotesList";
import { PartyList } from "./PartyList";
import { PrepChecklist } from "./PrepChecklist";
import { SessionCard } from "./SessionCard";
import { StartRunDialog } from "./StartRunDialog";

/**
 * The campaign view — `ui_kits/dm-screen/CampaignHome.jsx`, against the real API.
 *
 * The prototype's shape is kept exactly: three tabs on the left, the checklist
 * in a `--aside-w` sunken card on the right, encounter cards in an auto-filling
 * grid. What changed is where the data comes from and what happens when it is
 * not there — the four states a real screen has (loading, failed, empty, and
 * empty-because-you-searched) are the whole difference between this and a
 * scaffold.
 *
 * ### Authoring
 *
 * The prototype puts `New encounter` in the top bar, so that is where the create
 * action lives — but there is one slot and three tabs, so **it names whatever
 * the open tab makes**: an encounter, a note, or nothing on Party, which has no
 * authoring yet. That is why `Tabs` is controlled here rather than left on
 * `defaultValue`; the top bar has to know which tab is open.
 *
 * Editing is a pencil on the row itself, not a click on the card. The card's
 * click is the prototype's "run this encounter", and taking it for an editor
 * would be a decision the live-session step has to undo.
 *
 * **A save reloads the whole view rather than patching a row in place.** The
 * encounter card's creature count is `sum(encounter_creature.count)` computed
 * per read, and a note's attachment moves a count on a *different* card — so
 * every write here changes something the screen did not send. One re-read is
 * one source of truth; the alternative is a local model that is right until the
 * first thing it forgot about.
 */

/** What the one dialog slot is currently showing. */
type Editing =
  | { readonly what: "encounter"; readonly encounter: Encounter | undefined }
  | { readonly what: "note"; readonly note: Note | undefined };

const subtitleFor = (view: CampaignView): string | undefined => {
  const parts = [
    view.session === undefined ? undefined : `Session ${view.session.number}`,
    view.campaign.partyName ?? undefined,
  ].filter((part): part is string => part !== undefined && part !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
};

function CampaignBody({
  view,
  search,
  tab,
  onTab,
  onEdit,
  onRun,
  onChanged,
  onFinishSession,
}: {
  readonly view: CampaignView;
  readonly search: string;
  readonly tab: string;
  readonly onTab: (tab: string) => void;
  readonly onEdit: (editing: Editing) => void;
  readonly onRun: (encounterId: EncounterId) => void;
  readonly onChanged: () => void;
  readonly onFinishSession: () => void;
}) {
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
        <Tabs value={tab} onValueChange={(value) => onTab(String(value))}>
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
                Nothing is waiting for the party. Write one with{" "}
                <span className="text-heading">New encounter</span> above and it lands here, ready
                to run.
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
                    running={view.run?.encounterId === encounter.id}
                    onEdit={() => onEdit({ what: "encounter", encounter })}
                    onRun={() => onRun(encounter.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes">
            {view.notes.length === 0 ? (
              <EmptyState icon="scroll-text" title="No notes yet">
                The thing you meant to remember when the party opens the crate goes here. Read-aloud
                prose too — start one with <span className="text-heading">New note</span> above.
              </EmptyState>
            ) : notes.length === 0 ? (
              nothingMatches
            ) : (
              <NotesList
                notes={notes}
                encounters={view.encounters}
                onEdit={(note) => onEdit({ what: "note", note })}
              />
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

      <aside className="flex flex-col gap-4 xl:w-aside xl:shrink-0">
        <PrepChecklist
          key={view.session?.id ?? view.campaign.id}
          campaignId={view.campaign.id}
          sessionId={view.session?.id}
          items={view.prep}
          onChanged={onChanged}
        />
        {view.session !== undefined && (
          <SessionCard session={view.session} liveRun={view.run} onFinish={onFinishSession} />
        )}
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
  const [, navigate] = useRoute();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("encounters");
  const [editing, setEditing] = useState<Editing | undefined>();
  /** The encounter the DM pressed Run on, while the start dialog is open. */
  const [starting, setStarting] = useState<{ readonly encounterId: EncounterId | undefined }>();
  /** Whether the "end the night" confirmation is up. */
  const [finishing, setFinishing] = useState(false);

  const view = resource.state === "ready" ? resource.value : undefined;

  const close = useCallback(() => setEditing(undefined), []);
  const saved = useCallback(() => {
    setEditing(undefined);
    reload();
  }, [reload]);

  /**
   * Where the runner is, when there is a fight to go back to.
   *
   * A fight already on the table is reachable from the top bar *and* from its
   * own card, because the DM who reopens this screen mid-session is looking for
   * exactly one thing.
   */
  const live =
    view?.run !== undefined && view.session !== undefined
      ? hrefFor({
          screen: "run",
          campaignId,
          sessionId: view.session.id,
          runId: view.run.id,
        })
      : undefined;

  const run = useCallback(
    (encounterId: EncounterId | undefined) => {
      if (live !== undefined) {
        globalThis.location.hash = live;
        return;
      }
      setStarting({ encounterId });
    },
    [live],
  );

  /** The top bar's one create slot, named for whichever tab is open. */
  const create =
    tab === "encounters"
      ? { label: "New encounter", editing: { what: "encounter", encounter: undefined } as const }
      : tab === "notes"
        ? { label: "New note", editing: { what: "note", note: undefined } as const }
        : undefined;

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
            <>
              <Input
                aria-label="Search this campaign"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-control-sm w-44"
              />
              {create !== undefined && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(create.editing)}>
                  <Icon name="plus" size={14} />
                  {create.label}
                </Button>
              )}
              {/* `CampaignHome.jsx:41`. It says which of the two things it is:
                  starting a night, or walking back into one already running. */}
              <Button size="sm" onClick={() => run(undefined)}>
                <Icon name="swords" size={14} />
                {live === undefined ? "Start session" : "Back to the fight"}
              </Button>
            </>
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
      {view !== undefined && (
        <CampaignBody
          view={view}
          search={search}
          tab={tab}
          onTab={setTab}
          onEdit={setEditing}
          onRun={run}
          onChanged={reload}
          onFinishSession={() => setFinishing(true)}
        />
      )}

      {/* Keyed on what is being edited, so opening the dialog on a second row
          builds a fresh form rather than showing the first row's fields. */}
      {editing?.what === "encounter" && view !== undefined && (
        <EncounterDialog
          key={editing.encounter?.id ?? "new-encounter"}
          campaignId={campaignId}
          encounter={editing.encounter}
          onClose={close}
          onSaved={saved}
        />
      )}
      {editing?.what === "note" && view !== undefined && (
        <NoteDialog
          key={editing.note?.id ?? "new-note"}
          campaignId={campaignId}
          note={editing.note}
          encounters={view.encounters}
          onClose={close}
          onSaved={saved}
        />
      )}
      {finishing && view?.session !== undefined && (
        <FinishSessionDialog
          campaign={view.campaign}
          session={view.session}
          liveRun={view.run}
          onClose={() => setFinishing(false)}
          onFinished={() => {
            setFinishing(false);
            // The night is gone from under the screen: `campaign.currentSessionId`
            // is null now, so the checklist, the session card and the top bar's
            // "Start session" all have a different answer. One re-read, the same
            // rule every structural write here follows.
            reload();
          }}
        />
      )}
      {starting !== undefined && view !== undefined && (
        <StartRunDialog
          campaign={view.campaign}
          session={view.session}
          encounters={view.encounters}
          preselected={starting.encounterId}
          onClose={() => setStarting(undefined)}
          onStarted={(sessionId, runId) => {
            setStarting(undefined);
            navigate({ screen: "run", campaignId, sessionId, runId });
          }}
        />
      )}
    </AppShell>
  );
}
