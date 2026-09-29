import type { CampaignId, Encounter, EncounterPlayed, EncounterPrep, Session } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Button, Card, CardFooter, cardLinkClassName, Icon, SectionHeading } from "@taverns/ui";
import { DateTime } from "effect";
import { useState } from "react";
import { DeletePlannedNightDialog } from "./DeletePlannedNightDialog";
import type { CampaignView, PlannedNight } from "./load";
import { onDeckOf, playedLabel } from "./encounterList";
import { encounterDetail, openingReadAloud } from "./overview";
import { sectionLink } from "./OverviewParts";
import { PrepChecklist } from "./PrepChecklist";
import { ReadyBadge } from "./ReadyBadge";

/** How many encounters the card lists before the tab takes over. */
const ON_DECK = 6;

/** `21:04`, in the reader's own zone — the time they sat down. */
const clockOf = (at: DateTime.Utc): string => {
  const date = DateTime.toDateUtc(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * Where an open night stands with nothing on the table.
 *
 * **`startedAt === null` no longer means the night has not begun.** Opening a
 * session stamps it (`session/start.ts`), best effort, so an unstamped open
 * night is one whose stamp did not save or that predates the change. Either way
 * the campaign points at it, so the line says what is still true — it is open —
 * rather than a start time it does not have.
 */
const stateOf = (session: Session): string =>
  session.startedAt !== null
    ? `Playing since ${clockOf(session.startedAt)}. Nothing is on the table.`
    : "Open. Nothing has been put on the table yet.";

function EncounterRow({
  index,
  encounter,
  prep,
  running,
  onTable,
  onRun,
  onPickUp,
}: {
  readonly index: number;
  readonly encounter: Encounter;
  readonly prep: EncounterPrep | undefined;
  readonly running: boolean;
  /** Anything, this encounter or another, is on the table. */
  readonly onTable: boolean;
  readonly onRun: () => void;
  readonly onPickUp: (carried: EncounterPlayed) => void;
}) {
  const played = playedLabel(encounter);
  const last = encounter.lastPlayed;
  return (
    <li className="relative flex min-h-row items-center gap-3 border-b border-hairline px-card py-2 transition-control hover:bg-surface-raised has-[a[data-card-link]:focus-visible]:ring-focus [&_:is(a,button):not([data-card-link])]:relative">
      <span
        aria-hidden="true"
        className="w-4.5 shrink-0 font-mono text-mono leading-none font-medium text-faint"
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-s leading-snug font-semibold text-heading">
          <Link
            to="/campaigns/$campaignId/encounters"
            params={{ campaignId: encounter.campaignId }}
            search={{ encounter: encounter.id }}
            data-card-link
            className={cardLinkClassName}
          >
            {encounter.name}
          </Link>
        </div>
        <div className="text-caption leading-snug text-muted-foreground">
          {played === "" ? encounterDetail(encounter) : `${encounterDetail(encounter)} · ${played}`}
        </div>
      </div>
      {/* A played one says when instead, under its name as the Encounters list
          says it, so the name keeps its room. */}
      {played === "" && <ReadyBadge prep={prep} />}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`Edit ${encounter.name}`}
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/encounters/$encounterId/edit"
            params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
          />
        }
      >
        <Icon name="pencil" size={14} />
      </Button>
      {/* Named for its encounter, or a list of these is a column of identical
          Run buttons. The visible word leads, verbatim. A played encounter is
          never run again (an encounter is played once): its press is its log,
          or, for one a night finished over while nothing is on the table,
          picking it up. */}
      {running || last === null ? (
        <Button
          variant={running ? "secondary" : "outline"}
          size="sm"
          className="shrink-0"
          aria-label={running ? `On the table now — ${encounter.name}` : `Run ${encounter.name}`}
          onClick={onRun}
        >
          <Icon name="swords" size={13} />
          {running ? "On the table now" : "Run"}
        </Button>
      ) : last.endedReason === "carried" && !onTable ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={`Pick up ${encounter.name}`}
          onClick={() => onPickUp(last)}
        >
          <Icon name="history" size={13} />
          Pick up
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          aria-label={`View log — ${encounter.name}`}
          nativeButton={false}
          render={
            <Link
              to="/campaigns/$campaignId/sessions/$sessionId/runs/$runId"
              params={{
                campaignId: encounter.campaignId,
                sessionId: last.sessionId,
                runId: last.runId,
              }}
            />
          }
        >
          <Icon name="book-open" size={13} />
          View log
        </Button>
      )}
    </li>
  );
}

/**
 * A planned night's part of the card: its checklist and its delete. With more
 * than one planned, each is named, so every checklist says whose it is.
 */
function PlannedNightSection({
  campaignId,
  planned,
  named,
  next,
}: {
  readonly campaignId: CampaignId;
  readonly planned: PlannedNight;
  readonly named: boolean;
  /** The planned night *Start the night* opens once this one is deleted, if any. */
  readonly next: Session | undefined;
}) {
  const [deleting, setDeleting] = useState(false);
  const night = planned.session;
  const name = night.title ?? `Session ${String(night.number)}`;
  return (
    <section className="border-t border-hairline" aria-label={name}>
      {named && (
        <div className="px-card pt-4 text-label leading-none font-medium text-muted-foreground">
          {night.title === null ? name : `Session ${String(night.number)} · ${night.title}`}
        </div>
      )}
      <PrepChecklist campaignId={campaignId} sessionId={night.id} items={planned.prep} />
      <CardFooter className="justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          aria-label={`Delete ${name}`}
          onClick={() => setDeleting(true)}
        >
          <Icon name="trash-2" size={14} />
          Delete this night
        </Button>
      </CardFooter>
      {deleting && (
        <DeletePlannedNightDialog
          campaignId={campaignId}
          night={night}
          next={next}
          onClose={() => setDeleting(false)}
        />
      )}
    </section>
  );
}

/**
 * The night being prepared: what it is called, what it opens on, what is on
 * deck and what is still to do. While no night is open that is the planned
 * ones (`CampaignView.planned`), in number order, each with its own checklist;
 * the card is titled for the earliest, which *Start the night* opens.
 *
 * The one card on the page about the next thing to happen, so it wears the
 * accent rule. The press that starts the night is not on it: it is the
 * campaign row's, at the row's end on every tab (`CampaignAct` in
 * `shell/AppShell.tsx`), and one peach primary per screen leaves none for the
 * card.
 *
 * **What the drawing has that the wire does not** is left out rather than
 * stubbed: a scheduled date (a session has when it *ran*, not when it is
 * planned for) and encounters assigned to a night (encounters are the
 * campaign's). A played encounter is left off: what is on deck is what is
 * still to be played, the fight on the table first, then a carried one, then
 * the DM's own order, which the Encounters tab sets and this card only shows. Each row's *Ready* or *Draft* is the encounter's prep, and a
 * played one says when it was played instead. *Open prep* is gone because the prep is here:
 * the checklist the drawing dropped is this card's own section, and so is
 * ending the night when no fight is running. *All encounters* is the way to the
 * tab.
 *
 * **A row opens its encounter on the Encounters tab**, selected in the preview
 * (`?encounter=`), from anywhere on its face — the captain's call on the
 * Encounters redesign, which draws these rows as the way in. Its own *Edit*,
 * which opens the encounter builder, and *Run* stay above that link. *Run* is
 * only on an encounter never played; a played one has *View log*, and a carried
 * one *Pick up* (`playthroughOf` in `encounterList.ts`).
 *
 * Each planned night can be deleted from here, behind a confirmation; one
 * that was started cannot.
 */
export function NextSession({
  view,
  prep,
  onRun,
  onPickUp,
  onFinish,
}: {
  readonly view: CampaignView;
  /** Every encounter's prep, for each row's *Ready* or *Draft*. */
  readonly prep: ReadonlyArray<EncounterPrep>;
  readonly onRun: (encounter: Encounter) => void;
  readonly onPickUp: (encounter: Encounter, carried: EncounterPlayed) => void;
  readonly onFinish: () => void;
}) {
  const prepOf = new Map(prep.map((row) => [row.encounterId, row]));
  const { session, run: live } = view;
  // The night the card is about: the open one, or while none is open the
  // earliest planned one, which *Start the night* will open.
  const night = session ?? view.planned[0]?.session;
  const total = view.encounters.length;
  // What is still to be played, in the order the night reaches it: the one on
  // the table, a carried one, then the DM's order (`onDeckOf`).
  const toPlay = onDeckOf(view.encounters, live?.encounterId ?? undefined);
  const count = toPlay.length;
  const onDeck = toPlay.slice(0, ON_DECK);
  const opening = openingReadAloud(toPlay, view.notes);

  return (
    <Card className="overflow-hidden border-t-3 border-t-accent">
      <div className="flex flex-col gap-4 px-card pt-5 pb-4 @2xl:flex-row @2xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="text-label leading-none font-medium text-accent-ink">Next session</div>
          <SectionHeading size="display" className="mt-2.5">
            {night === undefined
              ? "Nothing is running yet"
              : (night.title ?? `Session ${String(night.number)}`)}
          </SectionHeading>
          <p className="mt-1.5 mb-0 text-body-s leading-body text-muted-foreground">
            {count === 0
              ? "Nothing is waiting for the party yet."
              : `${String(count)} ${count === 1 ? "encounter" : "encounters"} on deck`}
          </p>
        </div>
      </div>

      {opening !== undefined && (
        <div className="mx-card mb-4 rounded-md border border-hairline bg-surface-sunken px-4 py-4">
          <div className="flex items-center gap-1.5 text-label-s leading-none font-medium text-muted-foreground">
            <Icon name="scroll-text" size={13} />
            Opening read-aloud
          </div>
          <p className="mt-2.5 mb-0 font-serif text-body-l leading-loose text-foreground italic">
            {opening.body}
          </p>
        </div>
      )}

      <div className="border-t border-hairline">
        {onDeck.length === 0 ? (
          <div className="border-b border-hairline px-card py-4">
            <p className="mb-0 text-body-s leading-snug font-medium text-heading">
              {total === 0 ? "No encounters yet" : "Every encounter has been played"}
            </p>
            <p className="mb-0 text-body-s leading-body text-muted-foreground">
              Add one and it lands here, ready to run.
            </p>
          </div>
        ) : (
          <ol>
            {onDeck.map((encounter, index) => (
              <EncounterRow
                key={encounter.id}
                index={index + 1}
                encounter={encounter}
                prep={prepOf.get(encounter.id)}
                running={live?.encounterId === encounter.id}
                onTable={live !== undefined}
                onRun={() => onRun(encounter)}
                onPickUp={(carried) => onPickUp(encounter, carried)}
              />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-3 px-card py-2.5">
          {/* A create that belongs to one section is `outline` or quieter, and
              opens the same encounter builder the Encounters tab's does. */}
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2.5"
            nativeButton={false}
            render={
              <Link
                to="/campaigns/$campaignId/encounters/new"
                params={{ campaignId: view.campaign.id }}
              />
            }
          >
            <Icon name="plus" size={13} />
            Add encounter
          </Button>
          <Link
            to="/campaigns/$campaignId/encounters"
            params={{ campaignId: view.campaign.id }}
            className={`ml-auto ${sectionLink}`}
          >
            {total > onDeck.length ? `All ${String(total)} encounters` : "All encounters"}
          </Link>
        </div>
      </div>

      {session === undefined && view.planned.length > 0 ? (
        view.planned.map((planned) => (
          <PlannedNightSection
            key={planned.session.id}
            campaignId={view.campaign.id}
            planned={planned}
            named={view.planned.length > 1}
            next={view.planned.find((other) => other !== planned)?.session}
          />
        ))
      ) : (
        <div className="border-t border-hairline">
          <PrepChecklist
            key={session?.id ?? view.campaign.id}
            campaignId={view.campaign.id}
            sessionId={session?.id}
            items={view.prep}
          />
        </div>
      )}

      {session !== undefined && live === undefined && (
        <CardFooter className="flex-wrap justify-between">
          <p className="mb-0 text-body-s leading-body text-muted-foreground">{stateOf(session)}</p>
          {/* Outline, not destructive: it opens a confirmation, and a red
              button here would read as the ending itself. */}
          <Button variant="outline" size="sm" className="text-muted-foreground" onClick={onFinish}>
            <Icon name="moon" size={14} />
            Finish the night
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
