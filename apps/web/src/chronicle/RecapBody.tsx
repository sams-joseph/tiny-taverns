import type { Beat, CampaignId, Note, PrepItem, RecapFight, SessionId } from "@taverns/api";
import { Badge, Card, Icon, type IconName } from "@taverns/ui";
import { useCallback, type ReactNode } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { FailureNotice, Loading } from "../ui/states";
import { fightStory, standing } from "./fight";
import { loadRecap } from "./load";

/**
 * One night, read back from the five sources `SessionRecap` assembles.
 *
 * **Mounted only while its card is open**, which is what makes the recap a
 * per-card read rather than one of twenty fired to draw a timeline — see
 * `load.ts`. Closing the card unmounts this and the next open re-reads, which is
 * correct rather than wasteful: a recap is a view assembled per read and has no
 * stored version to go stale against, so a cached one is the only thing here
 * that could be out of date.
 *
 * ### Read-aloud mode drops the DM-only document rather than restyling it
 *
 * The delivery is explicit (`Chronicle.jsx:3-5`): a recap is two documents, and
 * the toggle drops the second. Here the first document is **beats and the
 * read-aloud prose** — the night as the DM would tell it — and the second is
 * everything that only makes sense on the DM's side of the screen: the fights
 * and their initiative counts, the prep lines that got ticked, the ordinary
 * notes, and the provenance. They are not hidden with a colour change; they are
 * not rendered.
 */

/** The delivery's small-caps facet heading (`Chronicle.jsx:6-15`), in tokens. */
function Facet({
  icon,
  label,
  children,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 text-label-s leading-none font-semibold tracking-caps text-faint uppercase">
        <Icon name={icon} size={12} />
        {label}
      </h4>
      {children}
    </section>
  );
}

/** `Chronicle.jsx:17-27` — an em dash, then the line. */
function Lines({ items }: { readonly items: ReadonlyArray<{ key: string; text: string }> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.key} className="flex gap-2 text-body-s leading-body text-foreground">
          <span className="shrink-0 text-faint" aria-hidden="true">
            &mdash;
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A row the assistant wrote.
 *
 * `origin` is on every content table already (`Provenance.ts`) and nothing
 * writes `assistant` yet, so in practice this renders never — which is the point
 * of reading the column rather than hard-coding the delivery's *"Hob's draft"*
 * badge onto every recap. The badge the designers drew belongs to rows that
 * really came from Hob, and the schema is what says which those are.
 */
function Drafted({ origin }: { readonly origin: string }) {
  if (origin === "authored") return null;
  return (
    <Badge variant="magic">
      <Icon name="sparkles" size={10} />
      Hob&rsquo;s draft
    </Badge>
  );
}

function Fights({ fights }: { readonly fights: ReadonlyArray<RecapFight> }) {
  return (
    <Facet icon="swords" label="At the table">
      <div className="flex flex-col gap-2">
        {fights.map((fight) => {
          const story = fightStory(fight);
          const { total, down } = standing(fight);
          return (
            <Card key={fight.run.id} tone="sunken" className="gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label leading-snug font-semibold text-heading">
                  {story.name}
                </span>
                {story.live ? (
                  <Badge>On the table</Badge>
                ) : fight.run.endedReason === "carried" ? (
                  <Badge variant="info">Carried</Badge>
                ) : (
                  <Badge variant="secondary">Resolved</Badge>
                )}
                <Drafted origin={fight.run.origin} />
              </div>
              <p className="text-body-s leading-body text-foreground">{story.state}</p>
              {/* The two directions of a carried fight, each naming the round
                  that end actually means. See `fight.ts` — they are different
                  numbers and swapping them is invisible. */}
              {story.resumedFrom !== null && (
                <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
                  <Icon name="git-branch" size={12} className="shrink-0 text-faint" />
                  {story.resumedFrom}
                </p>
              )}
              {story.carriedInto !== null && (
                <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
                  <Icon name="arrow-right" size={12} className="shrink-0 text-faint" />
                  {story.carriedInto}
                </p>
              )}
              <p className="text-caption leading-body text-faint">
                {total === 0
                  ? "Nobody left in initiative."
                  : `${String(total)} in initiative${down === 0 ? "" : `, ${String(down)} at zero`}.`}
              </p>
            </Card>
          );
        })}
      </div>
    </Facet>
  );
}

function Notes({
  notes,
  readAloud,
}: {
  readonly notes: ReadonlyArray<Note>;
  readonly readAloud: boolean;
}) {
  return (
    <Facet icon="scroll-text" label={readAloud ? "Read aloud" : "What you read out"}>
      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <div key={note.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-s leading-snug font-semibold text-heading">
                {note.title}
              </span>
              {note.kind === "read_aloud" && <Badge variant="outline">Read aloud</Badge>}
              <Drafted origin={note.origin} />
            </div>
            {note.body !== "" && (
              <p
                className={
                  note.kind === "read_aloud"
                    ? "max-w-measure font-serif text-body leading-loose text-slate-300"
                    : "max-w-measure text-body-s leading-body text-muted-foreground"
                }
              >
                {note.body}
              </p>
            )}
          </div>
        ))}
      </div>
    </Facet>
  );
}

/**
 * The beats, verbatim.
 *
 * *"Quoted, never paraphrased"* (`Recap.ts`) — they are the DM's own words at
 * the right length already. In read-aloud mode they take the serif face at
 * `--fs-body-l`, which is the one typographic change the delivery asks the
 * toggle to make (`Chronicle.jsx:61-62`).
 */
function Beats({
  beats,
  readAloud,
}: {
  readonly beats: ReadonlyArray<Beat>;
  readonly readAloud: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {beats.map((beat) => (
        <div key={beat.id} className="flex flex-col gap-1">
          <p
            className={
              readAloud
                ? "max-w-measure font-serif text-body-l leading-loose text-heading"
                : "max-w-measure text-body leading-body text-slate-300"
            }
          >
            {beat.body}
          </p>
          {!readAloud && <Drafted origin={beat.origin} />}
        </div>
      ))}
    </div>
  );
}

function Ticked({ prepDone }: { readonly prepDone: ReadonlyArray<PrepItem> }) {
  return (
    <Facet icon="list-checks" label="Questions you answered">
      <Lines items={prepDone.map((item) => ({ key: item.id, text: item.label }))} />
    </Facet>
  );
}

export function RecapBody({
  campaignId,
  sessionId,
  readAloud,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly readAloud: boolean;
}) {
  // Memoised on the ids: its identity is what tells `useApiResource` to load
  // again, so an inline closure would load forever.
  const load = useCallback(
    (client: TavernsClient) => loadRecap(campaignId, sessionId)(client),
    [campaignId, sessionId],
  );
  const [resource, reload] = useApiResource(load);

  if (resource.state === "loading") return <Loading label="Reading the night back…" />;
  if (resource.state === "failed") {
    return <FailureNotice failure={resource.failure} onRetry={reload} />;
  }

  const recap = resource.value;
  const readAloudNotes = recap.notes.filter((note) => note.kind === "read_aloud");
  const notes = readAloud ? readAloudNotes : recap.notes;
  const story = recap.beats.length > 0 || notes.length > 0;
  const dmOnly = recap.fights.length > 0 || recap.prepDone.length > 0;

  if (!story && (readAloud || !dmOnly)) {
    return (
      <p className="max-w-measure text-body-s leading-body text-faint">
        {readAloud
          ? "Nothing on this night was written down to read out. Beats and read-aloud notes are what this mode shows."
          : "Nothing was written down for this night — no beats, no fight, no read-aloud. The record only holds what was kept while you played."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {recap.beats.length > 0 && <Beats beats={recap.beats} readAloud={readAloud} />}
      {notes.length > 0 && <Notes notes={notes} readAloud={readAloud} />}

      {/* The DM-only half. Dropped whole in read-aloud mode rather than
          restyled — the delivery's own rule. */}
      {!readAloud && dmOnly && (
        <div className="grid gap-7 border-t border-hairline pt-6 @xl:grid-cols-2">
          {recap.fights.length > 0 && <Fights fights={recap.fights} />}
          {recap.prepDone.length > 0 && <Ticked prepDone={recap.prepDone} />}
        </div>
      )}
    </div>
  );
}
