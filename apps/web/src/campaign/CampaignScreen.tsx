import type { Character, Encounter, EncounterId, Note } from "@taverns/api";
import { useNavigate, useParams, type LinkProps } from "@tanstack/react-router";
import { Badge, Button, Icon, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@taverns/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { Hob, useHobPanel } from "../hob";
import { AppShell, NavContext, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { CampaignDialog } from "./CampaignDialog";
import { CharacterDialog } from "./CharacterDialog";
import { EncounterCard } from "./EncounterCard";
import { EncounterDialog } from "./EncounterDialog";
import { FinishSessionDialog } from "./FinishSessionDialog";
import { InviteDialog } from "./InviteDialog";
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
 * the open tab makes**: an encounter, a note, or a character. That is why `Tabs`
 * is controlled here rather than left on `defaultValue`; the top bar has to know
 * which tab is open.
 *
 * Editing is a pencil on the row itself, not a click on the card. The card's
 * click is the prototype's "run this encounter", and taking it for an editor
 * would be a decision the live-session step has to undo.
 *
 * ### The campaign itself is editable, and says whether it is shared
 *
 * The bar's leftmost control reads **Private** or **Shared** and opens
 * `CampaignDialog`. It is a word rather than a gear on purpose:
 * `campaign.visibility` is the master toggle every per-row share narrows within
 * (`CampaignDialog` says why at length), so the current answer has to be legible
 * without opening anything — a campaign that has never been shared should say so
 * on its own screen rather than leave it to be inferred from a badge that is
 * absent.
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
  | { readonly what: "note"; readonly note: Note | undefined }
  | { readonly what: "character"; readonly character: Character | undefined }
  /** The campaign's own settings — the one that carries the sharing control. */
  | { readonly what: "campaign" }
  /**
   * Who is invited to this table, and who can be uninvited.
   *
   * Beside the sharing control rather than inside it, because they answer
   * different halves of one question: `visibility` decides what a player may
   * read, and an invitation decides whether there is a player at all. Sharing a
   * campaign with nobody at it does nothing, and inviting somebody to a private
   * campaign lands them on a blank page — so each dialog names the other.
   */
  | { readonly what: "invites" };

/**
 * The party count moved here when the rail did: the top nav carries the name and
 * the session badge the delivery draws, and nothing else, so the one fact the
 * rail's footer held that has no other home joins the line that already says
 * which night and whose party.
 */
const subtitleFor = (view: CampaignView): string | undefined => {
  const parts = [
    view.session === undefined ? undefined : `Session ${view.session.number}`,
    view.campaign.partyName ?? undefined,
    `${view.campaign.playerCount} ${view.campaign.playerCount === 1 ? "player" : "players"}`,
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
    // `@4xl` (56rem = 896px) is the *content column's* width, not the
    // viewport's — `main` is the container, and with the rail gone the column is
    // 260px wider than the `xl:` viewport breakpoint this replaced was written
    // for. 896 is where the aside earns its place: 340 for it, 32 for the gap,
    // and 524 left for the tabs, which is the 516 two encounter cards need.
    <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
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
                Write the first one down with <span className="text-heading">Add character</span>{" "}
                above.
              </EmptyState>
            ) : party.length === 0 ? (
              nothingMatches
            ) : (
              <PartyList
                party={party}
                onEdit={(character) => onEdit({ what: "character", character })}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <aside className="flex flex-col gap-4 @4xl:w-aside @4xl:shrink-0">
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

export function CampaignScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  // Memoised on the id alone: its identity is what tells `useApiResource` to
  // load again, so an unmemoised closure here would load forever.
  const load = useCallback(
    (client: TavernsClient) => loadCampaignView(campaignId)(client),
    [campaignId],
  );
  const [resource, reload] = useApiResource(load);
  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  const hob = useHobPanel({ initialOpen: false });
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("encounters");
  const [editing, setEditing] = useState<Editing | undefined>();
  /** The encounter the DM pressed Run on, while the start dialog is open. */
  const [starting, setStarting] = useState<{ readonly encounterId: EncounterId | undefined }>();
  /** Whether the "end the night" confirmation is up. */
  const [finishing, setFinishing] = useState(false);

  const loaded = resource.state === "ready" ? resource.value : undefined;

  /**
   * **A player who arrives here is handed the screen that works.**
   *
   * Nothing in the product links a player at this URL any more — the campaign
   * list and the invitation page both route by role — but a bookmark, or a link
   * a DM pasted into a chat, still can. It does not fail loudly if they do:
   * every read the first round makes succeeds for a player, narrowed, so this
   * screen would draw its own chrome (*New encounter*, *Ask Hob*, the sharing
   * control, the Chronicle in the nav) over a player's data and break only on
   * the press. `location.replace` rather than an assignment, so *Back* goes
   * where they came from instead of returning them here.
   */
  const wrongSide = loaded?.role === "player";
  useEffect(() => {
    if (wrongSide) {
      void navigate({
        to: "/play/campaigns/$campaignId",
        params: { campaignId },
        replace: true,
      });
    }
  }, [wrongSide, campaignId, navigate]);

  // Withheld for the frame before the hash lands, so none of this screen's
  // chrome is ever drawn for somebody it does not belong to.
  const view = wrongSide ? undefined : loaded;

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
  //
  // Memoised because it is an object now rather than the href string it used
  // to be: a fresh literal every render would give `run` a fresh identity
  // every render, and `run` is handed to the encounter grid.
  const live: LinkProps | undefined = useMemo(
    () =>
      view?.run !== undefined && view.session !== undefined
        ? {
            to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
            params: { campaignId, sessionId: view.session.id, runId: view.run.id },
          }
        : undefined,
    [campaignId, view?.run, view?.session],
  );

  const run = useCallback(
    (encounterId: EncounterId | undefined) => {
      if (live !== undefined) {
        void navigate(live);
        return;
      }
      setStarting({ encounterId });
    },
    [live, navigate],
  );

  /** The top bar's one create slot, named for whichever tab is open. */
  const create =
    tab === "encounters"
      ? { label: "New encounter", editing: { what: "encounter", encounter: undefined } as const }
      : tab === "notes"
        ? { label: "New note", editing: { what: "note", note: undefined } as const }
        : { label: "Add character", editing: { what: "character", character: undefined } as const };

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} campaignId={campaignId} />}
      context={
        view === undefined ? undefined : (
          <NavContext name={view.campaign.name}>
            {view.session !== undefined && (
              <Badge variant="secondary">Session {view.session.number}</Badge>
            )}
          </NavContext>
        )
      }
      topBar={
        <TopBar title={view?.campaign.name ?? "Campaign"} subtitle={view && subtitleFor(view)}>
          {view !== undefined && (
            <>
              {/* The sharing control, worn as its own answer. `lock` and `users`
                  are both already in the glyph table, and the word beside them
                  is what keeps the fail-closed default from being something the
                  DM has to infer from an absent badge. */}
              <Button
                variant="secondary"
                size="sm"
                /* The visible word leads, verbatim, so the accessible name
                   contains the label a voice-control user would say. */
                aria-label={
                  view.campaign.visibility === "shared"
                    ? "Shared with your players — campaign settings"
                    : "Private to you — campaign settings"
                }
                onClick={() => setEditing({ what: "campaign" })}
              >
                <Icon name={view.campaign.visibility === "shared" ? "users" : "lock"} size={14} />
                {view.campaign.visibility === "shared" ? "Shared" : "Private"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing({ what: "invites" })}>
                <Icon name="user-round" size={14} />
                Invite
              </Button>
              <Input
                aria-label="Search this campaign"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-control-sm w-44"
              />
              <Button variant="secondary" size="sm" onClick={() => setEditing(create.editing)}>
                <Icon name="plus" size={14} />
                {create.label}
              </Button>
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
      {editing?.what === "character" && view !== undefined && (
        <CharacterDialog
          key={editing.character?.id ?? "new-character"}
          campaignId={campaignId}
          character={editing.character}
          onClose={close}
          onSaved={saved}
        />
      )}
      {editing?.what === "campaign" && view !== undefined && (
        <CampaignDialog campaign={view.campaign} onClose={close} onSaved={saved} />
      )}
      {editing?.what === "invites" && view !== undefined && (
        // `onChanged` rather than `onSaved`: this dialog stays open across
        // several writes — minting a link, then withdrawing another — so it
        // re-reads the view underneath without closing itself.
        <InviteDialog campaign={view.campaign} onClose={close} onChanged={reload} />
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
            void navigate({
              to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
              params: { campaignId, sessionId, runId },
            });
          }}
        />
      )}
    </AppShell>
  );
}
