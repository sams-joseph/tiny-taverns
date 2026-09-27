import type {
  CampaignCharacterId,
  CampaignId,
  EncounterRun,
  PartySeat,
  Session,
} from "@taverns/api";
import { Badge, Button, Icon, Input, Label, SectionHeading, Toggle } from "@taverns/ui";
import { Effect, Result } from "effect";
import { useEffect, useId, useRef, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure, Textarea } from "../ui/form";
import { entryPatch, type HeldDraft } from "./entry";
import { dayOf } from "./format";
import { EncounterChip } from "./NightBody";
import { NumberTile } from "./SessionEntry";
import { seatName } from "./spotlight";
import { useSummaryDraft } from "./summaryDraft";

/**
 * Writing a night up: its summary, an optional title and whose night it was.
 *
 * `Campaign Overview.dc.html`'s draft card, over a night that exists. The
 * drawing's draft is for a night nobody has played yet, dated; the product has
 * no planned night (the captain's "Later"), so the card is for **the newest
 * night that has been played and has no summary** (`nightToWriteUp`), and it
 * says when that night was played rather than when the next one is.
 *
 * **Hob drafts, the DM keeps** (the captain's Q1 c). *Ask Hob to draft* fills
 * the box with Hob's words (`useSummaryDraft`) for the DM to edit; *Add to
 * chronicle* then keeps Hob's draft through the ordinary accept, stamped
 * `assistant` with the turn, and sends the DM's own `PATCH` for the title, the
 * spotlight and any edit. Emptying the box lets the draft go, so words the DM
 * wrote from scratch are never stamped Hob's. With no model behind Hob the
 * press is not drawn and the DM writes by hand.
 *
 * *Add to chronicle* is **outline**, not the drawing's peach: the campaign's
 * press in the row above is this screen's one primary.
 *
 * The same fields edit a written night from inside its card (`mode: "edit"`),
 * where there is no card of its own and *Cancel* puts the summary back.
 */
export function NightComposer({
  campaignId,
  session,
  party,
  hobAvailable,
  mode,
  onSaved,
  onCancel,
}: {
  readonly campaignId: CampaignId;
  readonly session: Session;
  /** The seated party, whose names the Spotlight toggles carry. */
  readonly party: ReadonlyArray<PartySeat>;
  /** A model answers behind Hob, so *Ask Hob to draft* is drawn. */
  readonly hobAvailable: boolean;
  /**
   * The card above the nights, with the runs its *Played* row draws, or the
   * fields alone inside an opened night.
   */
  readonly mode:
    | { readonly kind: "draft"; readonly runs: ReadonlyArray<EncounterRun> }
    | { readonly kind: "edit" };
  readonly onSaved: () => void;
  /** Edit only: leave the summary as it was. */
  readonly onCancel: (() => void) | undefined;
}) {
  const id = useId();
  const [title, setTitle] = useState(session.title ?? "");
  const [text, setText] = useState(mode.kind === "edit" ? (session.summary ?? "") : "");
  const [spotlight, setSpotlight] = useState<CampaignCharacterId | null>(session.spotlightSeatId);
  /** Hob's draft the box holds, until the DM empties it. */
  const [held, setHeld] = useState<HeldDraft | undefined>(undefined);
  /**
   * The draft already kept, so a retry after the `PATCH` failed does not keep
   * it twice — the server answers a second accept with a `Conflict`.
   */
  const kept = useRef<string | undefined>(undefined);
  const hob = useSummaryDraft(campaignId, session);
  const { busy, failure, submit } = useMutation();

  // A new draft replaces what is in the box. The press that asked for it is
  // only offered while the box is empty or still holds Hob's last words, so
  // nothing the DM wrote is overwritten.
  const offered = hob.draft;
  useEffect(() => {
    if (offered === undefined) return;
    setText(offered.text);
    setHeld(offered);
  }, [offered]);

  const blank = text.trim() === "";
  const mayAsk = blank || (held !== undefined && text === held.text);

  const save = async () => {
    const patch = entryPatch({ title, summary: text, spotlightSeatId: spotlight, draft: held });
    const done = await submit(
      (client) =>
        Effect.gen(function* () {
          if (held !== undefined && kept.current !== held.turnId) {
            yield* client.hob.accept({
              params: { campaignId, threadId: held.threadId, turnId: held.turnId },
              payload: {},
            });
            kept.current = held.turnId;
          }
          return yield* client.sessions.update({
            params: { campaignId, sessionId: session.id },
            payload: patch,
          });
        }),
      // The row the nights list, the Overview's *Last time* and the campaign
      // row read; the recap carries the same row.
      [reads.sessions(campaignId), reads.recap(session.id)],
    );
    if (Result.isSuccess(done)) onSaved();
  };

  const fields = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>Title (optional)</Label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={120}
          placeholder={`Session ${String(session.number)}`}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="Summary"
          rows={3}
          maxLength={8000}
          value={text}
          placeholder="What happened, in a few sentences. Write it while it's fresh."
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value.trim() === "") setHeld(undefined);
          }}
        />
        {hobAvailable && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button variant="ghost" size="sm" disabled={hob.asking || !mayAsk} onClick={hob.ask}>
              <Icon name="sparkles" size={13} />
              {held === undefined ? "Ask Hob to draft" : "Ask Hob again"}
            </Button>
            <span aria-live="polite" className="text-caption leading-snug text-muted-foreground">
              {hob.asking
                ? (hob.activity ?? "Hob is reading the night…")
                : held !== undefined
                  ? "Hob's draft. Edit it as you like; adding keeps it as Hob's."
                  : !mayAsk
                    ? "Hob drafts into an empty box."
                    : hob.note}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {party.length > 0 && (
          <div role="group" aria-label="Spotlight" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-label-s leading-none font-medium text-muted-foreground">
              Spotlight
            </span>
            {party.map((row) => (
              <Toggle
                key={row.seat.id}
                size="sm"
                pressed={spotlight === row.seat.id}
                // One at most, and pressing the lit one puts nobody in it.
                onPressedChange={(pressed) => setSpotlight(pressed ? row.seat.id : null)}
              >
                {seatName(row)}
              </Toggle>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onCancel !== undefined && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={blank || busy} onClick={() => void save()}>
            <Icon name="check" size={13} />
            {mode.kind === "draft" ? "Add to chronicle" : busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </>
  );

  if (mode.kind === "edit") {
    return (
      <div aria-label="Edit the night's summary" role="group" className="flex flex-col gap-3.5">
        {fields}
      </div>
    );
  }

  return (
    <section
      aria-label={`Write up session ${String(session.number)}`}
      className="flex flex-col gap-3.5 rounded-card border border-dashed border-strong bg-surface-card p-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <NumberTile number={session.number} muted />
        <div className="min-w-0 flex-1">
          <SectionHeading as="h3" size="title">
            {session.title ?? `Session ${String(session.number)}`}
          </SectionHeading>
          <p className="m-0 text-label leading-snug text-muted-foreground">
            {playedLine(session, mode.runs.length)}
          </p>
        </div>
        <Badge variant="secondary">Draft</Badge>
      </div>
      {mode.runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label-s leading-none font-medium text-muted-foreground">
            Played
          </span>
          <ul aria-label="Played" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {mode.runs.map((run) => (
              <li key={run.id} className="max-w-full">
                <EncounterChip run={run} linkedIn={campaignId} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {fields}
    </section>
  );
}

/**
 * When the night was played, and how many encounters it held — the drawing's
 * *"Played today · 1 encounter"*, from the row and its runs rather than a date
 * nobody planned.
 */
const playedLine = (session: Session, encounters: number): string =>
  [
    session.startedAt === null ? undefined : `Played ${dayOf(session.startedAt)}`,
    session.endedAt === null ? "still open" : undefined,
    encounters === 0
      ? undefined
      : `${String(encounters)} ${encounters === 1 ? "encounter" : "encounters"}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
