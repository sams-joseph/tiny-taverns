import {
  BOARD_COLUMNS_DEFAULT,
  BOARD_ROWS_DEFAULT,
  type Encounter,
  FEET_PER_SQUARE_DEFAULT,
  type LevelId,
  type Note,
} from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  BackLink,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Loading,
  SectionHeading,
} from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { LevelPreview } from "../level/LevelPreview";
import { libraryLevelAtom } from "../levels/load";
import { sizeLine } from "../levels/size";
import { describeBoard } from "../run/runBoard";
import { ActionsMenu } from "../ui/ActionsMenu";
import { DetailFacts } from "../ui/detail";
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
 * page the Encounters preview's heading opens. **The creator's alone**: the
 * roster read behind it is refused to everybody else (`campaign/load.ts`,
 * `encounterPageAtom`), so a player who pastes the URL reads the same failure
 * a stranger does.
 *
 * Built from what the campaign already draws: the encounter builder edits it
 * (the name, the roster and the level it is played on), the campaign's `run`
 * puts it on the table, `NoteCard` shows what is attached. The battle map is
 * the encounter's level, drawn as a still and opened in the Library's editor
 * (`EncounterLevel`), or the plain grid when it names none.
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
  const { roster } = page;

  return (
    <div className="@container flex flex-col gap-6">
      {encounter.levelId === null ? (
        <section aria-labelledby="encounter-map" className="flex flex-col gap-3">
          <SectionHeading
            id="encounter-map"
            size="subtitle"
            action={
              <span className="text-body-s leading-body text-muted-foreground">
                {describeBoard({
                  columns: BOARD_COLUMNS_DEFAULT,
                  rows: BOARD_ROWS_DEFAULT,
                  feetPerCell: FEET_PER_SQUARE_DEFAULT,
                })}
              </span>
            }
          >
            Battle map
          </SectionHeading>
          <p className="max-w-measure text-body-s leading-body text-muted-foreground">
            This encounter names no level, so a fight on it is played on a plain grid. Pick one of
            your levels with <span className="text-heading">Edit</span>.
          </p>
        </section>
      ) : (
        <EncounterLevel levelId={encounter.levelId} />
      )}

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

/**
 * The encounter's level, as its battle map: a still of it (`LevelPreview`),
 * its size, and the way into the Library's editor. The level is the
 * creator's own Library object, read through the shelf's own read.
 */
function EncounterLevel({ levelId }: { readonly levelId: LevelId }) {
  const [level, retry] = useApiAtom(libraryLevelAtom(levelId));
  return (
    <section aria-labelledby="encounter-map" className="flex flex-col gap-3">
      <SectionHeading
        id="encounter-map"
        size="subtitle"
        action={
          <span className="flex flex-wrap items-center gap-3">
            {level.state === "ready" && (
              <span className="text-body-s leading-body text-muted-foreground">
                {level.value.name} · {sizeLine(level.value)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/library/levels/$levelId" params={{ levelId }} />}
            >
              <Icon name="pencil" size={14} />
              Open in the editor
            </Button>
          </span>
        }
      >
        Battle map
      </SectionHeading>
      {level.state === "loading" && <Loading label="Reading the level…" />}
      {level.state === "failed" && <ApiFailureNotice failure={level.failure} onRetry={retry} />}
      {level.state === "ready" && (
        <>
          <LevelPreview level={level.value} label={`The level ${level.value.name}, from above`} />
          {level.value.description !== null && (
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              <span className="text-heading">What the place looks like:</span>{" "}
              {level.value.description}
            </p>
          )}
        </>
      )}
    </section>
  );
}
