import type { SearchHit, Session } from "@taverns/api";
import { Badge, Button, Card, Icon, type IconName } from "@taverns/ui";
import { dayOf } from "./format";
import { segments } from "./search";

/**
 * What the record answers, across its three sources.
 *
 * `SearchHit` is a union discriminated on `source` rather than one record with
 * nullable fields (`Search.ts`), so this branches once and renders only the
 * fields that arm actually has: a beat has a `sessionId` and no title, a note
 * and a creature have a title and no session. Nothing here renders a blank where
 * the API has nothing — the same rule the bestiary card follows.
 *
 * **Only a beat is a link**, and only because a beat is the one thing in the
 * corpus that belongs to a night, which is a destination this screen has. A note
 * or a creature would need a deep link into a screen that does not offer one, so
 * the hit is the result line and the pointer, which is what the wire type says a
 * hit is.
 */

const META: Record<SearchHit["source"], { readonly icon: IconName; readonly label: string }> = {
  note: { icon: "scroll-text", label: "Note" },
  beat: { icon: "history", label: "Beat" },
  creature: { icon: "footprints", label: "Bestiary" },
};

/**
 * The snippet, as text, with the DM's own words picked out. See `segments`.
 *
 * An empty one renders nothing at all rather than an empty paragraph: a
 * creature's snippet is its stat block's own meta line, and a creature typed in
 * a hurry has none — measured against a running server, where `"Ferryman's
 * Shade"` came back with `snippet: ""`. The title is the whole result line in
 * that case, which is honest; a blank line under it is not.
 */
function Excerpt({ text, q }: { readonly text: string; readonly q: string }) {
  if (text === "") return null;
  return (
    <p className="max-w-measure text-body-s leading-body text-muted-foreground">
      {segments(text, q).map((piece, index) => (
        <span
          // Position is the only key a split has, and the list never reorders.
          key={`${String(index)}-${piece.text}`}
          className={piece.match ? "font-semibold text-heading" : undefined}
        >
          {piece.text}
        </span>
      ))}
    </p>
  );
}

export function SearchResults({
  hits,
  q,
  sessions,
  onOpenSession,
}: {
  readonly hits: ReadonlyArray<SearchHit>;
  readonly q: string;
  /** Every night of the campaign, so a beat hit can be named by its number. */
  readonly sessions: ReadonlyArray<Session>;
  readonly onOpenSession: (session: Session) => void;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {hits.map((hit) => {
        const meta = META[hit.source];
        const session =
          hit.source === "beat" ? sessions.find((row) => row.id === hit.sessionId) : undefined;
        return (
          <li key={`${hit.source}-${hit.id}`}>
            <Card className="gap-2 p-card">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <Icon name={meta.icon} size={10} />
                  {meta.label}
                </Badge>
                {hit.source !== "beat" && (
                  <span className="text-label leading-snug font-semibold text-heading">
                    {hit.title}
                  </span>
                )}
                {session !== undefined && (
                  <span className="text-label leading-snug font-semibold text-heading">
                    Session {session.number}
                  </span>
                )}
                <span className="ml-auto text-caption leading-body text-faint">
                  {dayOf(hit.updatedAt)}
                </span>
              </div>
              <Excerpt text={hit.snippet} q={q} />
              {session !== undefined && (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => onOpenSession(session)}>
                    <Icon name="scroll-text" size={13} />
                    Read that night
                  </Button>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
