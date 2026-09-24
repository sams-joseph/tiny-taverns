import type { Encounter, Session } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Button, Card, CardFooter, Icon, SectionHeading } from "@taverns/ui";
import { DateTime } from "effect";
import type { CampaignView } from "./load";
import { encounterDetail, openingReadAloud } from "./overview";
import { sectionLink } from "./OverviewParts";
import { PrepChecklist } from "./PrepChecklist";

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
  running,
  onEdit,
  onRun,
}: {
  readonly index: number;
  readonly encounter: Encounter;
  readonly running: boolean;
  readonly onEdit: () => void;
  readonly onRun: () => void;
}) {
  return (
    <li className="flex min-h-row items-center gap-3 border-b border-hairline px-card py-2">
      <span
        aria-hidden="true"
        className="w-4.5 shrink-0 font-mono text-mono leading-none font-medium text-faint"
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-s leading-snug font-semibold text-heading">{encounter.name}</div>
        <div className="text-caption leading-snug text-muted-foreground">
          {encounterDetail(encounter)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={`Edit ${encounter.name}`}
        onClick={onEdit}
      >
        <Icon name="pencil" size={14} />
      </Button>
      {/* Named for its encounter, or a list of these is a column of identical
          Run buttons. The visible word leads, verbatim. */}
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
    </li>
  );
}

/**
 * The night being prepared: what it is called, what it opens on, what is on
 * deck and what is still to do.
 *
 * The one card on the page about the next thing to happen, so it wears the
 * accent rule. The press that starts the night is not on it: it is the
 * campaign row's, at the row's end on every tab (`CampaignAct` in
 * `shell/AppShell.tsx`), and one peach primary per screen leaves none for the
 * card.
 *
 * **What the drawing has that the wire does not** is left out rather than
 * stubbed: a scheduled date (a session has when it *ran*, not when it is
 * planned for), encounters assigned to a night (encounters are the campaign's),
 * and an encounter's CR, DC and readiness. *Open prep* is gone because the prep
 * is here: the checklist the drawing dropped is this card's own section, and so
 * is ending the night when no fight is running.
 *
 * The rows open nothing — each carries its own *Edit* and *Run*, which is where
 * the Overview has always put them.
 */
export function NextSession({
  view,
  onRun,
  onFinish,
  onAddEncounter,
  onEditEncounter,
}: {
  readonly view: CampaignView;
  readonly onRun: (encounter: Encounter) => void;
  readonly onFinish: () => void;
  readonly onAddEncounter: () => void;
  readonly onEditEncounter: (encounter: Encounter) => void;
}) {
  const { session, run: live } = view;
  const count = view.encounters.length;
  const onDeck = view.encounters.slice(0, ON_DECK);
  const opening = openingReadAloud(view.encounters, view.notes);

  return (
    <Card className="overflow-hidden border-t-3 border-t-accent">
      <div className="flex flex-col gap-4 px-card pt-5 pb-4 @2xl:flex-row @2xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="text-label leading-none font-medium text-accent-ink">Next session</div>
          <SectionHeading size="display" className="mt-2.5">
            {session === undefined
              ? "Nothing is running yet"
              : (session.title ?? `Session ${String(session.number)}`)}
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
              No encounters yet
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
                running={live?.encounterId === encounter.id}
                onEdit={() => onEditEncounter(encounter)}
                onRun={() => onRun(encounter)}
              />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-3 px-card py-2.5">
          {/* A create that belongs to one section is `outline` or quieter, and
              opens the same dialog the Encounters tab's does. */}
          <Button variant="ghost" size="sm" className="-ml-2.5" onClick={onAddEncounter}>
            <Icon name="plus" size={13} />
            Add encounter
          </Button>
          <Link
            to="/campaigns/$campaignId/encounters"
            params={{ campaignId: view.campaign.id }}
            className={`ml-auto ${sectionLink}`}
          >
            {count > ON_DECK ? `All ${String(count)} encounters` : "All encounters"}
          </Link>
        </div>
      </div>

      <div className="border-t border-hairline">
        <PrepChecklist
          key={session?.id ?? view.campaign.id}
          campaignId={view.campaign.id}
          sessionId={session?.id}
          items={view.prep}
        />
      </div>

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
