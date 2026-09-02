import { Badge, Card, Icon } from "@taverns/ui";
import { dayOf } from "../chronicle/format";
import { initialsOf, keyOf, nameOf, type RosterRow } from "./roster";

/**
 * The roster: one hairline-separated row per person, in `Party.jsx`'s shape.
 *
 * What is different from the drawing is what a row *is*. There, a row is a seat
 * and a person may or may not be in it; here every row is somebody — a member of
 * the table, or somebody holding a live invitation to it. That is the single-use
 * invitation contract showing through: one invitation grants one membership and
 * names who took it, so an outstanding one is a named person who has not arrived
 * rather than a share of a reusable link.
 *
 * The drawn assignment control is gone with the continuity architecture: a
 * character is its owner's, seated by its owner, and there is no re-pointing
 * for a creator to perform. What a creator manages is the *seat* — shared or
 * hidden, kept or retired — and those verbs live on the character list below
 * the roster, where the seat is drawn.
 */

/** The person avatar, `PlayerParts.jsx`'s `Seat`, in theme names. */
function Avatar({ name, muted }: { readonly name: string; readonly muted: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        muted
          ? "flex size-7 shrink-0 items-center justify-center rounded-pill border border-hairline bg-surface-raised text-label-s leading-none font-semibold text-faint"
          : "flex size-7 shrink-0 items-center justify-center rounded-pill border border-accent bg-accent-soft text-label-s leading-none font-semibold text-accent-ink"
      }
    >
      {initialsOf(name)}
    </span>
  );
}

/** The second line: what this person's state actually is, in words. */
const detailOf = (row: RosterRow): string => {
  switch (row.kind) {
    case "dm":
      return "Runs this table.";
    case "playing":
      return row.seats
        .map((seat) => {
          const character = seat.character;
          if (character === null) return `${seat.seat.displayName} (character deleted)`;
          return character.descriptor === null || character.descriptor === ""
            ? character.name
            : `${character.name} · ${character.descriptor}`;
        })
        .join(" and ");
    case "no-character":
      return "Joined, and has not got a character yet.";
    default:
      // Not "hasn't opened it" — nothing records whether a link was followed.
      // What is recorded is that it is still live and when it stops being.
      return `Invited, and it runs out on ${dayOf(row.invite.expiresAt)}.`;
  }
};

function RosterLine({ row, first }: { readonly row: RosterRow; readonly first: boolean }) {
  const name = nameOf(row);
  const muted = row.kind !== "playing";

  return (
    <div
      className={
        first
          ? "flex min-h-row flex-wrap items-center gap-3 px-card py-2.5"
          : "flex min-h-row flex-wrap items-center gap-3 border-t border-hairline px-card py-2.5"
      }
    >
      <Avatar name={name} muted={muted} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-body-s leading-body font-semibold text-heading">
            {name}
          </span>
          {row.kind === "dm" && (
            <Badge variant="outline">
              <Icon name="crown" size={12} />
              DM
            </Badge>
          )}
        </span>
        <span className="text-caption leading-body text-muted-foreground">{detailOf(row)}</span>
      </div>

      {row.kind === "playing" && <Badge variant="success">Playing</Badge>}
      {row.kind === "no-character" && <Badge variant="destructive">No character</Badge>}
      {row.kind === "invited" && <Badge variant="info">Invited</Badge>}
    </div>
  );
}

export function RosterCard({ rows }: { readonly rows: ReadonlyArray<RosterRow> }) {
  return (
    <Card>
      {rows.map((row, index) => (
        <RosterLine key={keyOf(row)} row={row} first={index === 0} />
      ))}
    </Card>
  );
}
