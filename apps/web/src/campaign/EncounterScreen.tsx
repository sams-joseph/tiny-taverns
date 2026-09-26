import type { Encounter, Note } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { BackLink, Badge, Button, Card, EmptyState, Icon, SectionHeading } from "@taverns/ui";
import { useCallback, useState } from "react";
import { useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { ActionsMenu } from "../ui/ActionsMenu";
import { DetailFacts } from "../ui/detail";
import { useGridAdjustment } from "./AdjustGrid";
import { BattleMapBoard, describeBoard } from "./BattleMapBoard";
import { CampaignChrome } from "./CampaignChrome";
import { DeleteEncounterDialog } from "./DeleteEncounterDialog";
import { describeDifficulty } from "./difficulty";
import { DifficultyBadge } from "./DifficultyBadge";
import { describeRoster, playthroughOf } from "./encounterList";
import { encounterPageAtom, type EncounterPage } from "./load";
import { NoteCard } from "./NoteCard";
import { sceneNoun } from "../run/scene";

/**
 * One encounter: its battle map, its roster and the notes attached to it — the
 * page the Encounters preview's heading opens. **The creator's alone**: the map read behind
 * it is refused to everybody else (`campaign/load.ts`, `encounterPageAtom`),
 * so a player who pastes the URL reads the same failure a stranger does.
 *
 * Built from what the campaign already draws: the encounter builder edits it
 * (the name, the roster and the setting line the map was drawn from), the
 * campaign's `run` puts it on the table, `NoteCard` shows what is attached.
 * There is no redraw: a picture is drawn once, as the encounter is made. The
 * grid is shown where the map says it sits, and *Adjust grid* lines it up in
 * place under the board (`AdjustGrid.tsx`).
 *
 * **Run is the page's one primary**, and the campaign row's own press stands
 * down on this route (`CampaignRow` in `shell/AppShell.tsx`): both are
 * `useCampaignAct`'s `run`, so a fight already on the table is where either
 * would go, and the label says so. **An encounter is played once**
 * (`playthroughOf`), so *Run* is only on one never played: a played one has
 * its *View log* and no primary unless a fight is on the table, and one a
 * night finished over has *Pick up* as its primary.
 *
 * *Delete encounter* sits in the page's actions menu beside *Edit*, as the
 * campaign's own delete does on its Overview, never on a list card.
 */
export function EncounterScreen() {
  const { campaignId, encounterId } = useParams({
    from: "/_shell/campaigns/$campaignId/encounters/$encounterId",
  });
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const find = (encounters: ReadonlyArray<Encounter>) =>
    encounters.find((row) => row.id === encounterId);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Encounters"
      extra={encounterPageAtom({ campaignId, encounterId })}
      subtitle={({ view }) => find(view.encounters)?.name}
      actions={({ view, run, pickUp }) => {
        const encounter = find(view.encounters);
        const playthrough =
          encounter === undefined
            ? undefined
            : playthroughOf(encounter, view.run?.encounterId ?? undefined);
        return (
          <>
            <BackLink
              render={<Link to="/campaigns/$campaignId/encounters" params={{ campaignId }} />}
            >
              All encounters
            </BackLink>
            {encounter !== undefined && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to="/campaigns/$campaignId/encounters/$encounterId/edit"
                      params={{ campaignId, encounterId }}
                    />
                  }
                >
                  <Icon name="pencil" size={14} />
                  Edit
                </Button>
                <ActionsMenu
                  label="Encounter actions"
                  items={[
                    {
                      label: "Delete encounter",
                      icon: "trash-2",
                      destructive: true,
                      onSelect: () => setDeleting(true),
                    },
                  ]}
                />
                {(playthrough?._tag === "played" || playthrough?._tag === "carried") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link
                        to="/campaigns/$campaignId/sessions/$sessionId/runs/$runId"
                        params={{
                          campaignId,
                          sessionId: playthrough.played.sessionId,
                          runId: playthrough.played.runId,
                        }}
                      />
                    }
                  >
                    <Icon name="book-open" size={14} />
                    View log
                  </Button>
                )}
                {view.run !== undefined ? (
                  <Button size="sm" onClick={() => run(encounter.id)}>
                    <Icon name="swords" size={13} />
                    Back to the {sceneNoun(view.run.mode)}
                  </Button>
                ) : playthrough?._tag === "carried" ? (
                  <Button size="sm" onClick={() => pickUp(encounter, playthrough.played)}>
                    <Icon name="history" size={13} />
                    Pick up the {sceneNoun(encounter.kind)}
                  </Button>
                ) : playthrough?._tag === "unplayed" ? (
                  <Button size="sm" onClick={() => run(encounter.id)}>
                    <Icon name="swords" size={13} />
                    Run
                  </Button>
                ) : null}
              </>
            )}
          </>
        );
      }}
    >
      {({ view, extra }) => {
        const encounter = find(view.encounters);
        if (encounter === undefined) {
          return (
            <EmptyState icon="swords" title="No such encounter">
              It is not among this table&rsquo;s encounters any more.{" "}
              <Link
                to="/campaigns/$campaignId/encounters"
                params={{ campaignId }}
                className="text-link hover:text-link-hover"
              >
                All encounters
              </Link>
            </EmptyState>
          );
        }
        const notes = view.notes.filter((note) => note.attachedTo?.id === encounter.id);
        return (
          <>
            <EncounterBody
              encounter={encounter}
              page={extra}
              notes={notes}
              running={view.run?.encounterId === encounter.id}
            />
            {deleting && (
              <DeleteEncounterDialog
                campaignId={campaignId}
                encounter={encounter}
                openNight={view.session?.id}
                attachedNotes={notes.length}
                onClose={() => setDeleting(false)}
                onDeleted={() =>
                  void navigate({ to: "/campaigns/$campaignId/encounters", params: { campaignId } })
                }
              />
            )}
          </>
        );
      }}
    </CampaignChrome>
  );
}

function EncounterBody({
  encounter,
  page,
  notes,
  running,
}: {
  readonly encounter: Encounter;
  readonly page: EncounterPage;
  readonly notes: ReadonlyArray<Note>;
  readonly running: boolean;
}) {
  const { map, roster } = page;
  const grid = useGridAdjustment({ campaignId: encounter.campaignId, map });
  const invalidate = useInvalidate();
  // The page opens straight after the encounter is made, while Hob may still be
  // drawing its map. Re-read the map alone until the picture lands or fails.
  const rereadMap = useCallback(
    () => invalidate([reads.battleMap(encounter.id)]),
    [invalidate, encounter.id],
  );
  useHobDrawingPolling(map.imagePending, rereadMap);

  return (
    <div className="@container flex flex-col gap-6">
      <section aria-labelledby="encounter-map" className="flex flex-col gap-3">
        <SectionHeading
          id="encounter-map"
          size="subtitle"
          action={
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-body-s leading-body text-muted-foreground">
                {describeBoard(grid.shown)}
              </span>
              {!grid.adjusting && (
                <Button variant="outline" size="sm" onClick={grid.open}>
                  Adjust grid
                </Button>
              )}
            </span>
          }
        >
          Battle map
        </SectionHeading>
        <BattleMapBoard map={grid.shown} />
        {grid.panel}
        {map.setting !== null && (
          <p className="max-w-measure text-body-s leading-body text-muted-foreground">
            <span className="text-heading">What the place looks like:</span> {map.setting}
          </p>
        )}
        {map.image === null && !map.imagePending && (
          <p className="max-w-measure text-body-s leading-body text-muted-foreground">
            Hob drew no picture of this place, so the board is a blank grid.
          </p>
        )}
      </section>

      <div className="grid gap-6 @3xl:grid-cols-2">
        <Card className="gap-4 p-card">
          <div className="flex flex-wrap items-start gap-2.5">
            <SectionHeading size="title" className="flex-1">
              {encounter.name}
            </SectionHeading>
            {running && <Badge variant="secondary">On the table now</Badge>}
          </div>
          <DetailFacts
            facts={[
              {
                label: "Difficulty",
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <DifficultyBadge difficulty={encounter.difficulty} />
                    <span className="text-body-s text-muted-foreground">
                      {describeDifficulty(encounter.difficulty)}
                    </span>
                  </span>
                ),
              },
              { label: "Creatures", value: describeRoster(encounter) },
              {
                label: "Tags",
                value:
                  encounter.tags.length === 0 ? (
                    "None"
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {encounter.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  ),
              },
              {
                label: "Players",
                value:
                  encounter.visibility === "shared"
                    ? "Can see this encounter"
                    : "Cannot see this encounter",
              },
            ]}
          />
        </Card>

        <Card className="gap-4 p-card">
          <SectionHeading size="title">Roster</SectionHeading>
          {roster.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              No creatures yet. Add them with <span className="text-heading">Edit</span>.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {roster.map((line) => (
                <li
                  key={line.id}
                  className="flex items-baseline justify-between gap-3 text-body leading-body"
                >
                  <span className="min-w-0 text-heading">{line.name}</span>
                  <span className="shrink-0 text-muted-foreground">×{line.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {notes.length > 0 && (
        <section aria-labelledby="encounter-notes" className="flex flex-col gap-3">
          <SectionHeading id="encounter-notes" size="subtitle">
            Notes
          </SectionHeading>
          <div className="flex flex-col gap-4">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
