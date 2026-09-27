import type { Beat, BeatId, CampaignId, EncounterRun, Visibility } from "@taverns/api";
import { Badge, Button, cn, Icon } from "@taverns/ui";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { KIND_ICON } from "../campaign/encounterList";
import type { AnyChronicleNight } from "./load";

/**
 * An opened night, as the drawing lays it out: the DM's summary, its moments,
 * the encounters played in it, and — for the DM — what the table was not told.
 *
 * **One body for both audiences**, handed a night the server already narrowed.
 * `chronicle.read` and `chronicle.readAsPlayer` differ in which nights, beats
 * and encounter names they answer, not in shape, and nothing here reads past
 * the night's session, beats and runs:
 *
 * - **The summary leads, whole**, where the closed card clamped it. It sits
 *   above the moments and the encounters, never in place of them: they stay
 *   word for word underneath. While the DM edits it, the composer stands in
 *   its place (`NightAudience.editor`).
 * - **Moments are beats, word for word.** For the DM, a beat shared with the
 *   table is a bullet and one kept back goes in the *DM only* box, and each
 *   carries the press that moves it to the other (*Share* / *Unshare*). A
 *   player's record holds only the beats the DM shared, by row predicate, so
 *   on their screen every beat is a bullet, the box never draws and there is
 *   nothing to press.
 * - **Encounters are runs, told by kind.** Each chip wears its kind's glyph
 *   (`KIND_ICON`, the one the Encounters list uses). The DM's opens the
 *   encounter on the Encounters tab; a player's is plain text, because the
 *   encounter's page is the creator's and a link to a refusal is worse than
 *   none. A player's run name is already the neutral one ("A fight") unless
 *   the encounter is Shared and Ready — `runColumns` decides that in SQL.
 */
export function NightBody({
  audience,
  night,
}: {
  readonly audience: NightAudience;
  /** Its beats verbatim and its runs in the order played, both oldest first. */
  readonly night: AnyChronicleNight;
}) {
  const { beats, runs } = night;
  const summary = night.session.summary;
  const editor = audience.kind === "dm" ? audience.editor : undefined;
  const told =
    audience.kind === "player" ? beats : beats.filter((beat) => beat.visibility === "shared");
  const kept =
    audience.kind === "player" ? [] : beats.filter((beat) => beat.visibility !== "shared");

  if (
    editor === undefined &&
    summary === null &&
    told.length === 0 &&
    kept.length === 0 &&
    runs.length === 0
  ) {
    return (
      <p className="max-w-measure text-body-s leading-body text-faint">
        {audience.kind === "player"
          ? "Nothing from this night has been shared beyond the date."
          : "Nothing was written down for this night — no moment and no encounter. The record only holds what was kept while you played."}
      </p>
    );
  }

  return (
    <>
      {editor ??
        (summary !== null && (
          <p className="max-w-measure text-body leading-body whitespace-pre-line text-foreground">
            {summary}
          </p>
        ))}

      {told.length > 0 && (
        <ul aria-label="Moments" className="m-0 flex list-none flex-col gap-2 p-0">
          {told.map((beat) => (
            <li
              key={beat.id}
              className="flex max-w-measure gap-2.5 text-body-s leading-body text-foreground"
            >
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-circle bg-faint" />
              <span className="min-w-0 flex-1">{beat.body}</span>
              {audience.kind === "dm" && <ShareMoment beat={beat} audience={audience} to="dm" />}
            </li>
          ))}
        </ul>
      )}

      {runs.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 border-t border-hairline pt-3.5 text-body-s leading-snug">
          <dt className="text-muted-foreground">Encounters</dt>
          <dd className="m-0">
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {runs.map((run) => (
                <li key={run.id} className="max-w-full">
                  <EncounterChip
                    run={run}
                    linkedIn={audience.kind === "dm" ? audience.campaignId : undefined}
                  />
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      )}

      {kept.length > 0 && (
        // The drawing's box: the glyph, the words, the badge at the end. On a
        // phone the badge rides beside the glyph on a line of its own, so the
        // words keep the box's width rather than a third of it.
        <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-md border border-hairline bg-surface-sunken px-3.5 py-3">
          <Icon name="eye-off" size={14} className="mt-1 shrink-0 text-magic-ink" />
          <ul
            aria-label="Kept from the table"
            className="order-last m-0 flex min-w-0 basis-full list-none flex-col gap-2 p-0 text-body-s leading-body text-foreground @md:order-none @md:flex-1 @md:basis-0"
          >
            {kept.map((beat) => (
              <li key={beat.id} className="flex items-start gap-2.5">
                <p className="m-0 max-w-measure min-w-0 flex-1">{beat.body}</p>
                {audience.kind === "dm" && (
                  <ShareMoment beat={beat} audience={audience} to="shared" />
                )}
              </li>
            ))}
          </ul>
          <Badge variant="magic" className="shrink-0 @md:order-last">
            DM only
          </Badge>
        </div>
      )}
    </>
  );
}

/**
 * Who the night is being read back to. The DM's carries the campaign, which is
 * what a chip's link needs, the write that shares or keeps a moment, and the
 * composer while the summary is being edited; a player's needs nothing,
 * because it links nowhere and changes nothing.
 */
export type NightAudience =
  | {
      readonly kind: "dm";
      readonly campaignId: CampaignId;
      /** Share a moment with the table, or keep it back. */
      readonly share: (beat: Beat, visibility: Visibility) => void;
      /** The moment whose write is in flight. */
      readonly sharing: BeatId | undefined;
      /** Drawn where the summary is, while the DM edits it. */
      readonly editor: ReactNode | undefined;
    }
  | { readonly kind: "player" };

/** The DM's press on one moment, moving it to the other side of the line. */
function ShareMoment({
  beat,
  audience,
  to,
}: {
  readonly beat: Beat;
  readonly audience: Extract<NightAudience, { kind: "dm" }>;
  readonly to: Visibility;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-my-1.5 shrink-0 text-muted-foreground"
      aria-label={to === "shared" ? "Share this moment with the table" : "Unshare this moment"}
      disabled={audience.sharing !== undefined}
      onClick={() => audience.share(beat, to)}
    >
      <Icon name={to === "shared" ? "users" : "eye-off"} size={13} />
      {/* The glyph alone on a phone, where the moment needs the width. */}
      <span className="hidden @md:inline">{to === "shared" ? "Share" : "Unshare"}</span>
    </Button>
  );
}

const chipFace =
  "inline-flex min-h-control-sm max-w-full items-center gap-1.5 rounded-sm border border-strong px-2.5 py-1 text-label leading-snug font-medium text-foreground";

/**
 * One run as a chip, its kind's glyph beside its name. Also the composer's
 * *Played* row, which is why it takes the campaign to link into rather than an
 * audience: `undefined` is a player's, and draws text.
 */
export function EncounterChip({
  run,
  linkedIn,
}: {
  readonly run: EncounterRun;
  readonly linkedIn: CampaignId | undefined;
}) {
  const face = (
    <>
      <Icon
        name={KIND_ICON[run.mode]}
        size={13}
        className="pointer-events-none shrink-0 text-muted-foreground"
      />
      {/* Wraps rather than truncating: a chip on a phone keeps its whole name. */}
      <span className="min-w-0 break-words">{run.encounterName}</span>
    </>
  );

  // A run outlives its encounter (`encounter_id` is `on delete set null`), so
  // even the DM's chip is text once there is nothing left to open.
  if (linkedIn === undefined || run.encounterId === null) {
    return (
      <span data-slot="encounter-chip" data-kind={run.mode} className={chipFace}>
        {face}
      </span>
    );
  }
  return (
    <Link
      data-slot="encounter-chip"
      data-kind={run.mode}
      to="/campaigns/$campaignId/encounters"
      params={{ campaignId: linkedIn }}
      search={{ encounter: run.encounterId }}
      className={cn(
        chipFace,
        "no-underline transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus",
      )}
    >
      {face}
    </Link>
  );
}
