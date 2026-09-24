import type { Encounter, Note } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { BackLink, Badge, Button, Card, EmptyState, Icon, SectionHeading } from "@taverns/ui";
import { useCallback, useState } from "react";
import { useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { DetailFacts } from "../ui/detail";
import { BattleMapBoard, describeBoard } from "./BattleMapBoard";
import { CampaignChrome } from "./CampaignChrome";
import { DifficultyBadge, describeRoster } from "./EncounterCard";
import { EncounterDialog } from "./EncounterDialog";
import { encounterPageAtom, type EncounterPage } from "./load";
import { NoteCard } from "./NotesList";
import { NoteDialog } from "./NoteDialog";

/**
 * One encounter: its battle map, its roster and the notes attached to it — the
 * page an encounter card opens. **The creator's alone**: the map read behind
 * it is refused to everybody else (`campaign/load.ts`, `encounterPageAtom`),
 * so a player who pastes the URL reads the same failure a stranger does.
 *
 * Built from what the campaign already draws: the encounter's own dialog edits
 * it (the name, the roster and the setting line the map was drawn from), the
 * campaign's `run` puts it on the table, `NoteCard` shows what is attached.
 * There is no redraw: a picture is drawn once, as the encounter is made. The
 * grid is shown where the map says it sits; lining it up is a control of its
 * own that this page does not have yet.
 *
 * **Run is the page's one primary**, and the campaign row's own press stands
 * down on this route (`CampaignRow` in `shell/AppShell.tsx`): both are
 * `useCampaignAct`'s `run`, so a fight already on the table is where either
 * would go, and the label says so.
 */
export function EncounterScreen() {
  const { campaignId, encounterId } = useParams({
    from: "/_shell/campaigns/$campaignId/encounters/$encounterId",
  });
  const [editing, setEditing] = useState(false);
  const [editingNote, setEditingNote] = useState<Note>();
  const find = (encounters: ReadonlyArray<Encounter>) =>
    encounters.find((row) => row.id === encounterId);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Encounters"
      extra={encounterPageAtom({ campaignId, encounterId })}
      subtitle={({ view }) => find(view.encounters)?.name}
      actions={({ view, run }) => {
        const encounter = find(view.encounters);
        return (
          <>
            <BackLink
              render={<Link to="/campaigns/$campaignId/encounters" params={{ campaignId }} />}
            >
              All encounters
            </BackLink>
            {encounter !== undefined && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Icon name="pencil" size={14} />
                  Edit
                </Button>
                <Button size="sm" onClick={() => run(encounter.id)}>
                  <Icon name="swords" size={13} />
                  {view.run === undefined ? "Run" : "Back to the fight"}
                </Button>
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
              onEditNote={setEditingNote}
            />
            {editing && (
              <EncounterDialog
                campaignId={campaignId}
                encounter={encounter}
                onClose={() => setEditing(false)}
                onSaved={() => setEditing(false)}
              />
            )}
            {editingNote !== undefined && (
              <NoteDialog
                key={editingNote.id}
                campaignId={campaignId}
                note={editingNote}
                encounters={view.encounters}
                onClose={() => setEditingNote(undefined)}
                onSaved={() => setEditingNote(undefined)}
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
  onEditNote,
}: {
  readonly encounter: Encounter;
  readonly page: EncounterPage;
  readonly notes: ReadonlyArray<Note>;
  readonly running: boolean;
  readonly onEditNote: (note: Note) => void;
}) {
  const { map, roster } = page;
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
            <span className="text-body-s leading-body text-muted-foreground">
              {describeBoard(map)}
            </span>
          }
        >
          Battle map
        </SectionHeading>
        <BattleMapBoard map={map} />
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
              { label: "Difficulty", value: <DifficultyBadge difficulty={encounter.difficulty} /> },
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
              <NoteCard
                key={note.id}
                note={note}
                encounter={undefined}
                onEdit={() => onEditNote(note)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
