import type { Beat, Note, PrepItem } from "@taverns/api";
import { Badge, Icon, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * A night, laid out — the half of a recap that is the same for both audiences.
 *
 * **`SessionRecap` and `PlayerSessionRecap` differ in exactly one field.** The
 * beats, the notes and the ticked prep are already the `shared` ones by
 * row-level predicate and reach the player unchanged (`PlayerRecap.ts` says so
 * in as many words); only the combatant was ever the disclosure. So everything
 * here is shared between `RecapBody` and `PlayerRecapBody`, and each supplies
 * its own already-rendered fights.
 *
 * That is not tidiness. The read-aloud rule below — *the toggle drops the DM's
 * document rather than restyling it* — is the delivery's own (`Chronicle.jsx:3-5`)
 * and is a claim about what a mode shows. Written twice it would be two claims,
 * and the day they part company one screen quietly shows the other's half.
 */

/** The delivery's small-caps facet heading (`Chronicle.jsx:6-15`), in tokens. */
export function Facet({
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
export function Lines({ items }: { readonly items: ReadonlyArray<{ key: string; text: string }> }) {
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
export function Drafted({ origin }: { readonly origin: string }) {
  if (origin === "authored") return null;
  return (
    <Badge variant="magic">
      <Icon name="sparkles" size={10} />
      Hob&rsquo;s draft
    </Badge>
  );
}

export function Notes({
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
export function Beats({
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

export function Ticked({
  prepDone,
  label,
}: {
  readonly prepDone: ReadonlyArray<PrepItem>;
  /**
   * *"Questions you answered"* to the DM who wrote them; *"What the night
   * settled"* to a player, who did not write them and to whom "you" would name
   * the wrong person. Same rows, same predicate — only the voice differs.
   */
  readonly label: string;
}) {
  return (
    <Facet icon="list-checks" label={label}>
      <Lines items={prepDone.map((item) => ({ key: item.id, text: item.label }))} />
    </Facet>
  );
}

/**
 * The night as a document, and the one rule the *Read aloud* toggle means.
 *
 * The first document is **beats and the read-aloud prose** — the night as it
 * would be told. The second is everything that only makes sense beside it: the
 * fights, and the prep lines that got ticked. They are not hidden with a colour
 * change; in read-aloud mode they are not rendered.
 *
 * `fights` arrives already rendered, `null` when the night had none, because it
 * is the one part of a recap whose shape depends on who is reading — a `Fights`
 * over `RecapFight` for the DM and one over `PlayerRecapFight` for a player. The
 * `null` is what this component branches on, so neither caller has to restate
 * "was there a fight" as a second boolean beside the node.
 */
export function RecapDocument({
  beats,
  notes,
  prepDone,
  fights,
  ticked,
  readAloud,
}: {
  readonly beats: ReadonlyArray<Beat>;
  readonly notes: ReadonlyArray<Note>;
  readonly prepDone: ReadonlyArray<PrepItem>;
  readonly fights: ReactNode | null;
  readonly ticked: string;
  readonly readAloud: boolean;
}) {
  const readAloudNotes = notes.filter((note) => note.kind === "read_aloud");
  const shown = readAloud ? readAloudNotes : notes;
  const story = beats.length > 0 || shown.length > 0;
  const aside = fights !== null || prepDone.length > 0;

  if (!story && (readAloud || !aside)) {
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
      {beats.length > 0 && <Beats beats={beats} readAloud={readAloud} />}
      {shown.length > 0 && <Notes notes={shown} readAloud={readAloud} />}

      {/* The second document. Dropped whole in read-aloud mode rather than
          restyled — the delivery's own rule. */}
      {!readAloud && aside && (
        <div className="grid gap-7 border-t border-hairline pt-6 @xl:grid-cols-2">
          {fights}
          {prepDone.length > 0 && <Ticked prepDone={prepDone} label={ticked} />}
        </div>
      )}
    </div>
  );
}
