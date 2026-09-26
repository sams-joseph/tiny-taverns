import {
  encounterKindLabel,
  type CampaignId,
  type Encounter,
  type EncounterId,
  type EncounterPlayed,
  type EncounterPrep,
} from "@taverns/api";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Badge, Button, EmptyState, Icon, SectionHeading, Toggle } from "@taverns/ui";
import { useRef, useState } from "react";
import { CampaignChrome } from "./CampaignChrome";
import { ReadyBadge } from "./ReadyBadge";
import {
  BAND_TEXT,
  creatureWords,
  encountersSummary,
  groupLabel,
  KIND_FILTERS,
  KIND_ICON,
  matchesKind,
  playedLabel,
  ratingOf,
  sectionsOf,
  type KindFilter,
} from "./encounterList";
import { EncounterPreview } from "./EncounterPreview";
import { encounterPrepListAtom, type CampaignView } from "./load";

/**
 * Every encounter built for this table, as the redesign draws the tab
 * (`Campaign Overview.dc.html`): a list grouped by where each encounter stands,
 * and beside it a preview of the one selected.
 *
 * **The page is centred at the Overview's width** (`CampaignChrome`'s
 * `centred`), header included so its left edge is the list's, and scrolls with
 * the window — neither column scrolls on its own and nothing is sticky.
 *
 * **A row selects; it does not open.** The captain chose the drawing's preview
 * over rows that open the encounter, so a row is a button that puts its
 * encounter in the pane, and the pane's heading is the way to the whole page.
 * The selection is the URL's (`?encounter=`), so a reload, a shared link and
 * the Overview's rows land on it. Choosing a row *replaces* the address rather
 * than pushing one: picking through ten rows is one visit to the page, and
 * *Back* leaves it as it would any other tab. With no choice, or one the pill
 * hides, the first row shown is the one previewed.
 *
 * **The filter is the drawing's pills and nothing else** — the captain's call:
 * no search box and no other facets. They are the kinds, counted over every
 * encounter.
 *
 * The two columns are the drawing's own wrap rather than a breakpoint, like the
 * Overview's: the list `basis-encounters-list-min` up to `max-w-encounters-list`
 * beside the preview's `basis-encounters-pane`, stacking below 704px of content
 * whatever narrows it. Stacked, the preview is under the whole list, so
 * choosing a row scrolls it into view — the drawing's own narrow layout left
 * the change a screen below with nothing to say it happened.
 */
export function EncountersScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Encounters"
      centred
      extra={encounterPrepListAtom(campaignId)}
      subtitle={({ view }) =>
        encountersSummary(view.encounters, view.run?.encounterId ?? undefined)
      }
      actions={() => (
        // Outline, not peach: the campaign row's press is this screen's one
        // primary. It opens the encounter builder, a page of its own.
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/campaigns/$campaignId/encounters/new" params={{ campaignId }} />}
        >
          <Icon name="plus" size={14} />
          New encounter
        </Button>
      )}
    >
      {({ view, extra, run, pickUp }) => (
        <EncounterBrowser
          campaignId={campaignId}
          view={view}
          prep={extra}
          onRun={(encounter) => run(encounter.id)}
          onPickUp={pickUp}
        />
      )}
    </CampaignChrome>
  );
}

/**
 * Whether the preview sits under the list rather than beside it. A list with no
 * height has not been laid out (or is jsdom's), and nothing is scrolled then.
 */
const stacked = (list: HTMLElement, pane: HTMLElement): boolean => {
  const above = list.getBoundingClientRect();
  return above.height > 0 && pane.getBoundingClientRect().top >= above.bottom - 1;
};

const reducedMotion = (): boolean =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function EncounterBrowser({
  campaignId,
  view,
  prep,
  onRun,
  onPickUp,
}: {
  readonly campaignId: CampaignId;
  readonly view: CampaignView;
  readonly prep: ReadonlyArray<EncounterPrep>;
  readonly onRun: (encounter: Encounter) => void;
  readonly onPickUp: (encounter: Encounter, carried: EncounterPlayed) => void;
}) {
  const chosen = useSearch({ strict: false }).encounter;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<KindFilter>("all");
  const listRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  /**
   * Whether the next preview to settle should be scrolled to: set by a row's
   * click and by opening on a choice, and nothing else. It waits for the
   * preview's reads because, scrolled while they are loading, the page is too
   * short to bring it up and it lands half way down when the roster arrives.
   */
  const reveal = useRef(chosen !== undefined);

  const liveId = view.run?.encounterId ?? undefined;
  const shown = view.encounters.filter((encounter) => matchesKind(encounter, filter));
  const sections = sectionsOf(shown, liveId);
  const ordered = sections.flatMap((section) => section.encounters);
  const selected = ordered.find((encounter) => encounter.id === chosen) ?? ordered[0];
  const prepOf = new Map(prep.map((row) => [row.encounterId, row]));

  const choose = (encounterId: EncounterId | undefined) =>
    void navigate({
      to: "/campaigns/$campaignId/encounters",
      params: { campaignId },
      search: encounterId === undefined ? {} : { encounter: encounterId },
      replace: true,
      resetScroll: false,
    });

  // Stacked, the preview is under the whole list: bring it into view when a
  // row is chosen, or when the page opens on a choice (the Overview's rows).
  const bringPaneIntoView = () => {
    const list = listRef.current;
    const pane = paneRef.current;
    if (list === null || pane === null || !stacked(list, pane)) return;
    pane.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const revealIfChosen = () => {
    if (!reveal.current) return;
    reveal.current = false;
    bringPaneIntoView();
  };

  if (view.encounters.length === 0) {
    return (
      <EmptyState icon="swords" title="No encounters yet">
        Nothing is waiting for the party. Write one with{" "}
        <span className="text-heading">New encounter</span> above and it lands here, ready to run.
      </EmptyState>
    );
  }

  const pickFilter = (next: KindFilter) => {
    setFilter(next);
    // Keep the address honest: a choice the new pill hides gives way to the
    // first encounter the pill shows.
    const still = view.encounters.find((encounter) => encounter.id === chosen);
    if (still !== undefined && !matchesKind(still, next)) choose(undefined);
  };

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Filter by kind" className="flex flex-wrap items-center gap-1.5">
        {KIND_FILTERS.map(([value, label]) => (
          <Toggle
            key={value}
            size="sm"
            className="rounded-pill"
            pressed={filter === value}
            onPressedChange={() => pickFilter(value)}
          >
            {label}
            <span className="font-mono text-mono leading-none font-medium text-faint">
              {view.encounters.filter((encounter) => matchesKind(encounter, value)).length}
            </span>
          </Toggle>
        ))}
      </div>

      {selected === undefined ? (
        <EmptyState icon="search" title="Nothing matches">
          None of this table&rsquo;s encounters is one of these yet. Choose{" "}
          <span className="text-heading">All</span> to see every one.
        </EmptyState>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div
            ref={listRef}
            data-slot="encounter-list"
            className="flex min-w-0 shrink grow basis-encounters-list-min flex-col gap-5 max-w-encounters-list"
          >
            {sections.map((section) => (
              <section
                key={section.group}
                aria-labelledby={`encounters-${section.group}`}
                className="flex flex-col gap-1.5"
              >
                <SectionHeading id={`encounters-${section.group}`} className="px-1 pb-1">
                  {section.title}
                </SectionHeading>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {section.encounters.map((encounter) => (
                    <li key={encounter.id}>
                      <EncounterRow
                        encounter={encounter}
                        prep={prepOf.get(encounter.id)}
                        selected={encounter.id === selected.id}
                        onSelect={() => {
                          if (encounter.id === selected.id) {
                            bringPaneIntoView();
                            return;
                          }
                          reveal.current = true;
                          choose(encounter.id);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <EncounterPreview
            key={selected.id}
            paneRef={paneRef}
            onSettled={revealIfChosen}
            encounter={selected}
            prep={prepOf.get(selected.id)}
            readAloud={view.notes.filter(
              (note) =>
                note.kind === "read_aloud" &&
                note.body.trim() !== "" &&
                note.attachedTo?.kind === "encounter" &&
                note.attachedTo.id === selected.id,
            )}
            group={groupLabel(selected, liveId)}
            live={selected.id === liveId}
            onTable={view.run?.mode}
            onRun={() => onRun(selected)}
            onPickUp={(carried) => onPickUp(selected, carried)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One encounter in the list, as the drawing draws it: its kind's glyph, the
 * name, "Combat · Medium" under it and *Ready* or *Draft* at its end — plus
 * what the captain kept from the old card, the creature count and *Shared*,
 * since an absent badge is not a fail-closed default a DM can read. A played
 * one says when instead of Ready or Draft.
 */
function EncounterRow({
  encounter,
  prep,
  selected,
  onSelect,
}: {
  readonly encounter: Encounter;
  readonly prep: EncounterPrep | undefined;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const rating = ratingOf(encounter, prep);
  const creatures = creatureWords(encounter);
  const played = playedLabel(encounter);
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md border border-transparent bg-transparent px-3.5 py-2.5 text-left font-sans transition-control outline-none hover:bg-surface-card focus-visible:ring-focus aria-current:border-accent aria-current:bg-surface-card"
    >
      <Icon name={KIND_ICON[encounter.kind]} size={16} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        {/* *Shared* rides beside the name rather than in a column of its own,
            so the line under it keeps the row's whole width. */}
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-body-s leading-snug font-semibold text-heading">
            {encounter.name}
          </span>
          {encounter.visibility === "shared" && <Badge variant="info">Shared</Badge>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption leading-snug text-muted-foreground">
          <span>{encounterKindLabel(encounter.kind)}</span>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
          <span className={rating.band === undefined ? undefined : BAND_TEXT[rating.band]}>
            {rating.text}
          </span>
          {creatures !== undefined && (
            <>
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
              <span>{creatures}</span>
            </>
          )}
        </span>
        {played !== "" && (
          <span className="mt-0.5 block text-caption leading-snug text-faint">{played}</span>
        )}
      </span>
      {played === "" && <ReadyBadge prep={prep} />}
    </button>
  );
}
