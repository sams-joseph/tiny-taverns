import {
  encounterKindLabel,
  type Encounter,
  type EncounterChallenge,
  type EncounterCreature,
  type EncounterKind,
  type EncounterPlayed,
  type EncounterPrep,
  type Note,
} from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Icon, Loading, SectionHeading } from "@taverns/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { HobCover } from "../hob/HobCover";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { describeDifficulty } from "./difficulty";
import { DifficultyMeter } from "./DifficultyMeter";
import { BAND_TEXT } from "./encounterList";
import { sceneNoun } from "../run/scene";
import { encounterPageAtom } from "./load";
import { ReadyBadge } from "./ReadyBadge";

/**
 * The selected encounter, beside the list — the redesign's preview pane
 * (`Campaign Overview.dc.html`, the Encounters tab).
 *
 * **Everything on it is something the wire has.** The head and the difficulty
 * are the `Encounter` row; the read-aloud is the notes attached to it; tactics,
 * treasure and a challenge's numbers are its prep (`encounterPrep.list`, the
 * page's `extra`); the where line, the battle map and the creature table are
 * the two reads the encounter's own page makes (`encounterPageAtom`), both the
 * creator's alone. A section with nothing to say is not drawn. *Ready* or
 * *Draft* is the prep's too, and a played encounter says when it was played
 * instead.
 *
 * **The battle map is a band under the header, for every kind**, the picture
 * Hob drew cropped to the drawing's 24:9 and opening the encounter's page,
 * where the board and its grid are. The drawing's empty *Drop a battle map*
 * slot is not drawn: with no picture there is no band, and while Hob is still
 * drawing one the band says so and the pane re-reads the map until it lands.
 *
 * **Its tactics are always "Running it".** The drawing retitles them *What
 * happened* once the encounter is played, but they are the DM's plan, written
 * before the night, and calling a plan a record would say something the table
 * never did. What happened is the fight's own page, which *View log* opens.
 *
 * **None of its buttons is the peach.** The campaign row's press is this
 * screen's one primary, so *Edit*, *Run encounter*, *View log* and *Pick up*
 * are outline. *Run encounter* is offered only on an encounter never played
 * (`playthroughOf` in `encounterList.ts`).
 * *Edit* and *Add creature* open the encounter builder, the second at its
 * creatures.
 */
export function EncounterPreview({
  encounter,
  prep,
  readAloud,
  group,
  live,
  onTable,
  onRun,
  onPickUp,
  paneRef,
  onSettled,
}: {
  readonly encounter: Encounter;
  readonly prep: EncounterPrep | undefined;
  /** The read-aloud notes attached to it, oldest first. */
  readonly readAloud: ReadonlyArray<Note>;
  /** "On the table now", "Not yet played" or "Played · Session 12". */
  readonly group: string;
  /** This is the fight on the table. */
  readonly live: boolean;
  /**
   * What is on the table — this encounter or another — as the kind it is run
   * as, so *Run* goes back to it, as the campaign's `run` does and the
   * encounter page's *Run* says. `undefined` with nothing on the table.
   */
  readonly onTable: EncounterKind | undefined;
  readonly onRun: () => void;
  /** Pick up the carried fight this encounter is (`encounterList.ts`, `playthroughOf`). */
  readonly onPickUp: (carried: EncounterPlayed) => void;
  readonly paneRef: Ref<HTMLElement>;
  /** Its reads have answered, so it is as tall as it is going to be. */
  readonly onSettled: () => void;
}) {
  const [page, retry] = useApiAtom(
    encounterPageAtom({ campaignId: encounter.campaignId, encounterId: encounter.id }),
  );
  const settled = page.state !== "loading";
  const onSettledRef = useRef(onSettled);
  useLayoutEffect(() => {
    onSettledRef.current = onSettled;
  });
  useEffect(() => {
    if (settled) onSettledRef.current();
  }, [settled]);
  const map = page.state === "ready" ? page.value.map : null;
  const setting = map?.setting ?? null;
  const invalidate = useInvalidate();
  const rereadMap = useCallback(
    () => invalidate([reads.battleMap(encounter.id)]),
    [invalidate, encounter.id],
  );
  useHobDrawingPolling(map?.imagePending ?? false, rereadMap);
  const played = encounter.lastPlayed;
  const tactics = prep?.tactics ?? [];
  const treasure = prep?.treasure ?? null;
  const challenge = prep?.challenge ?? null;
  const headingId = `encounter-preview-${encounter.id}`;

  return (
    <article
      ref={paneRef}
      aria-labelledby={headingId}
      data-slot="encounter-preview"
      // Brought into view when the columns are stacked, under the sticky chrome.
      className="min-w-0 shrink grow-2 basis-encounters-pane scroll-mt-(--chrome-height) overflow-hidden rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <header className="flex flex-wrap items-start gap-4 border-b border-hairline px-6 pt-5.5 pb-4.5">
        <div className="min-w-0 flex-1 basis-70">
          <div className="flex flex-wrap items-center gap-2 text-label leading-none font-medium text-muted-foreground">
            {played === null && <ReadyBadge prep={prep} />}
            {encounter.visibility === "shared" && <Badge variant="info">Shared</Badge>}
            <span>
              {encounterKindLabel(encounter.kind)} · {group}
            </span>
          </div>
          <SectionHeading id={headingId} size="display" className="mt-3 break-words">
            <Link
              to="/campaigns/$campaignId/encounters/$encounterId"
              params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
              className="text-inherit hover:text-link-hover"
            >
              {encounter.name}
            </Link>
          </SectionHeading>
          {setting !== null && (
            <p className="mt-1.5 mb-0 flex items-start gap-1.5 text-body-s leading-body text-muted-foreground">
              <Icon name="map-pin" size={13} className="mt-1 shrink-0" />
              <span className="min-w-0">{setting}</span>
            </p>
          )}
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/campaigns/$campaignId/encounters/$encounterId/edit"
                params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
              />
            }
          >
            <Icon name="pencil" size={13} />
            Edit
          </Button>
          {/* A played encounter's way in is its log, and it is never run
              again: an encounter is played once. One a night finished over
              is picked up instead, while nothing else is on the table. */}
          {played !== null && !live ? (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/campaigns/$campaignId/sessions/$sessionId/runs/$runId"
                    params={{
                      campaignId: encounter.campaignId,
                      sessionId: played.sessionId,
                      runId: played.runId,
                    }}
                  />
                }
              >
                <Icon name="book-open" size={13} />
                View log
              </Button>
              {played.endedReason === "carried" && onTable === undefined && (
                <Button variant="outline" size="sm" onClick={() => onPickUp(played)}>
                  <Icon name="history" size={13} />
                  Pick up the {sceneNoun(encounter.kind)}
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onRun}>
              <Icon name={onTable !== undefined ? "swords" : "play"} size={13} />
              {onTable !== undefined ? `Back to the ${sceneNoun(onTable)}` : "Run encounter"}
            </Button>
          )}
        </div>
      </header>

      {map !== null && (
        <HobCover image={map.image} pending={map.imagePending} shape="strip">
          <Link
            to="/campaigns/$campaignId/encounters/$encounterId"
            params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
            aria-label={`Battle map of ${encounter.name}`}
            // Drawn inside the band, whose frame and the pane both clip.
            className="absolute inset-0 focus-visible:shadow-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
          />
        </HobCover>
      )}

      <div className="flex flex-col gap-6 px-6 py-5">
        <DifficultySection encounter={encounter} />

        {readAloud.map((note) => (
          <section
            key={note.id}
            aria-label="Read aloud"
            className="rounded-md border border-hairline bg-surface-sunken px-4.5 py-4"
          >
            <div className="flex items-center gap-1.5 text-label-s leading-none font-medium text-muted-foreground">
              <Icon name="scroll-text" size={13} />
              Read aloud
            </div>
            <p className="mt-2.5 mb-0 font-serif text-body-l leading-loose text-foreground italic">
              {note.body}
            </p>
          </section>
        ))}

        {page.state === "loading" && <Loading label="Reading the roster…" />}
        {page.state === "failed" && <ApiFailureNotice failure={page.failure} onRetry={retry} />}
        {page.state === "ready" &&
          (page.value.roster.length > 0 || encounter.kind === "combat") && (
            <Creatures encounter={encounter} roster={page.value.roster} />
          )}

        {challenge !== null && <ChallengeSection challenge={challenge} />}

        {tactics.length > 0 && (
          <Section title="Running it">
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {tactics.map((line, index) => (
                <li
                  key={`${String(index)}-${line}`}
                  className="flex gap-3 text-body leading-body text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="w-4.5 shrink-0 font-mono text-mono leading-body font-medium text-faint"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {treasure !== null && (
          <section
            aria-label="Treasure"
            className="flex items-start gap-3 border-t border-hairline pt-4.5"
          >
            <Icon name="gem" size={16} className="mt-0.5 shrink-0 text-accent-ink" />
            <div className="min-w-0 flex-1">
              <div className="text-body-s leading-snug font-semibold text-heading">Treasure</div>
              <p className="mt-0.5 mb-0 text-body-s leading-body text-foreground">{treasure}</p>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <SectionHeading as="h3" size="title" action={action}>
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}

/**
 * The band, where it came from and the meter — or, for an encounter the rule
 * could not rate, why. A scene that is not a fight and has nobody in it has
 * nothing to rate, so it draws no section rather than *No creatures to rate*.
 */
function DifficultySection({ encounter }: { readonly encounter: Encounter }) {
  const { difficulty } = encounter;
  if (
    difficulty._tag === "unrated" &&
    difficulty.reason === "no-creatures" &&
    encounter.kind !== "combat"
  ) {
    return null;
  }
  return (
    <section aria-label="Difficulty" className="@container flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <SectionHeading as="h3" size="title">
          Difficulty
        </SectionHeading>
        <span
          data-slot="difficulty-band"
          className={`text-body-s leading-none font-semibold ${
            difficulty._tag === "rated" ? BAND_TEXT[difficulty.band] : "text-muted-foreground"
          }`}
        >
          {difficulty._tag === "rated" ? difficulty.band : "Unrated"}
        </span>
        <span
          className={
            difficulty._tag === "rated"
              ? // At the far end while it fits there; under the heading, from the
                // left, once it wraps.
                "font-mono text-mono leading-snug font-medium text-muted-foreground @lg:ml-auto"
              : "text-body-s leading-snug text-muted-foreground"
          }
        >
          {describeDifficulty(difficulty)}
        </span>
      </div>
      {difficulty._tag === "rated" && <DifficultyMeter difficulty={difficulty} />}
    </section>
  );
}

const dash = (value: string | number | null): string =>
  value === null || value === "" ? "—" : String(value);

/**
 * The roster as the drawing tables it: *Creature / Qty / CR / AC / HP / XP*,
 * the XP for the whole line.
 *
 * **It fits a phone.** The drawing's grid needs 290px and a 390 phone gives it
 * 274, which it took out of the name. Here the table is the pane's width, the
 * name wraps rather than truncating to nothing, and below `@sm` the AC and HP
 * move under the name as a caption instead of taking two columns.
 */
function Creatures({
  encounter,
  roster,
}: {
  readonly encounter: Encounter;
  readonly roster: ReadonlyArray<EncounterCreature>;
}) {
  return (
    <Section
      title="Creatures"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2.5"
          nativeButton={false}
          render={
            <Link
              to="/campaigns/$campaignId/encounters/$encounterId/edit"
              params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
              hash="creatures"
            />
          }
        >
          <Icon name="plus" size={13} />
          Add creature
        </Button>
      }
    >
      {roster.length === 0 ? (
        <p className="mb-0 text-body-s leading-body text-muted-foreground">No creatures yet.</p>
      ) : (
        <div className="@container overflow-hidden rounded-md border border-hairline">
          <table data-slot="encounter-creatures" className="w-full border-collapse">
            <thead className="bg-surface-sunken text-label-s leading-none font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="py-2.5 pr-2 pl-3.5 text-left font-medium">
                  Creature
                </th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">
                  CR
                </th>
                <th
                  scope="col"
                  className="hidden px-2 py-2.5 text-right font-medium @sm:table-cell"
                >
                  AC
                </th>
                <th
                  scope="col"
                  className="hidden px-2 py-2.5 text-right font-medium @sm:table-cell"
                >
                  HP
                </th>
                <th scope="col" className="py-2.5 pr-3.5 pl-2 text-right font-medium">
                  XP
                </th>
              </tr>
            </thead>
            <tbody className="font-mono text-mono leading-none font-medium text-foreground">
              {roster.map((line) => (
                <tr key={line.id} className="border-t border-hairline">
                  <th
                    scope="row"
                    className="py-2.5 pr-2 pl-3.5 text-left font-sans text-body-s leading-snug font-semibold [overflow-wrap:anywhere] text-heading"
                  >
                    {line.name}
                    <span className="mt-0.5 block font-mono text-caption font-medium text-muted-foreground @sm:hidden">
                      AC {line.ac} · HP {line.hp}
                    </span>
                  </th>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">×{line.count}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">{dash(line.cr)}</td>
                  <td className="hidden px-2 py-2.5 text-right @sm:table-cell">{line.ac}</td>
                  <td className="hidden px-2 py-2.5 text-right @sm:table-cell">{line.hp}</td>
                  <td className="py-2.5 pr-3.5 pl-2 text-right whitespace-nowrap text-muted-foreground">
                    {line.xp === null ? dash(null) : (line.xp * line.count).toLocaleString("en")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/**
 * A skill challenge's DC and tallies, or a hazard's save, cost and length —
 * then the skills either is met with.
 */
function ChallengeSection({ challenge }: { readonly challenge: EncounterChallenge }) {
  const stats: ReadonlyArray<readonly [string, string]> =
    challenge.kind === "challenge"
      ? [
          ["DC", String(challenge.dc)],
          ["Successes", String(challenge.successes)],
          ["Failures", String(challenge.failures)],
        ]
      : [
          ["Save", `${challenge.save.ability} ${String(challenge.save.dc)}`],
          ...(challenge.onFail === undefined ? [] : [["On fail", challenge.onFail] as const]),
          ...(challenge.duration === undefined ? [] : [["Duration", challenge.duration] as const]),
        ];
  return (
    <Section title={challenge.kind === "challenge" ? "Challenge" : "Hazard"}>
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-3">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-label-s leading-none font-medium text-muted-foreground">{label}</dt>
            <dd className="m-0 font-mono text-mono-l leading-snug font-medium text-heading">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {challenge.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {challenge.skills.map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  );
}
