import type { CampaignId, Session } from "@taverns/api";
import { Card, CardContent, cn, Icon } from "@taverns/ui";
import { dayOf, spanOf } from "./format";
import { RecapBody } from "./RecapBody";

/**
 * One night on the spine: a dot, a rule, and a card that opens.
 *
 * `Chronicle.jsx:29-141` in shipped components. The dot-and-rule is the
 * delivery's own — a bigger accent dot with a soft ring for the newest night, a
 * hairline running on down the column — built from the spacing scale rather than
 * its literal 13/9/21px, which is the same substitution the encounter grid made
 * for `minmax(250px,1fr)`.
 *
 * **The collapsed card carries no summary**, and that is the one visible
 * difference from the prototype. `s.summary` there is authored prose on a
 * fixture; nothing stores a recap here by decision (`Recap.ts`), and reading one
 * per collapsed row would be a request per night to draw a list. So the head
 * says what the `session` row itself knows — which night, when it was played,
 * and how long it ran — and the recap arrives when the card is opened.
 */
export function SessionEntry({
  campaignId,
  session,
  latest,
  open,
  readAloud,
  onToggle,
}: {
  readonly campaignId: CampaignId;
  readonly session: Session;
  /** The newest night, which the delivery marks with the accent dot. */
  readonly latest: boolean;
  readonly open: boolean;
  readonly readAloud: boolean;
  readonly onToggle: () => void;
}) {
  /**
   * A night is titled or it is not, and the head is arranged around which.
   *
   * The delivery gives every night a name and puts *"Session 11"* in the
   * eyebrow above it (`Chronicle.jsx:46,51`). `session.title` is nullable and in
   * practice usually null — nothing on the campaign screen asks for one — so an
   * untitled night takes its number as the heading and the eyebrow drops it
   * rather than printing *"Session 12"* twice, once in each size.
   */
  const titled = session.title !== null;
  const title = session.title ?? `Session ${String(session.number)}`;
  const played = session.startedAt === null ? null : dayOf(session.startedAt);

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4">
      <div className="flex w-4 flex-col items-center">
        <div
          className={cn(
            "mt-5 shrink-0 rounded-circle",
            latest
              ? "size-3 bg-accent ring-4 ring-accent-soft"
              : "size-2 border border-strong bg-slate-700",
          )}
        />
        <div className="mt-2 w-px flex-1 bg-hairline" />
      </div>

      <div className="pb-6">
        <Card className={latest ? "border-strong" : undefined}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full cursor-pointer items-start gap-3 p-card text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {titled && (
                  <>
                    <span className="font-mono text-mono leading-none font-medium text-accent-ink">
                      Session {session.number}
                    </span>
                    <span className="text-faint" aria-hidden="true">
                      &middot;
                    </span>
                  </>
                )}
                <span className="text-label leading-none text-muted-foreground">
                  {played ?? "Not played yet"}
                </span>
              </div>
              <h3 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
                {title}
              </h3>
              {!open && (
                <p className="mt-2 max-w-measure text-body-s leading-body text-muted-foreground">
                  {spanOf(session.startedAt, session.endedAt)}
                </p>
              )}
            </div>
            <Icon
              name={open ? "chevron-up" : "chevron-down"}
              size={16}
              className="mt-1 shrink-0 text-faint"
            />
          </button>

          {open && (
            <CardContent className="pt-0">
              {!readAloud && (
                <p className="mb-5 text-caption leading-body text-faint">
                  {spanOf(session.startedAt, session.endedAt)}
                </p>
              )}
              <RecapBody campaignId={campaignId} sessionId={session.id} readAloud={readAloud} />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
