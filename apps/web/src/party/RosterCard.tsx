import { Badge, Button, Card, Icon } from "@taverns/ui";
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
 * The drawn hover-revealed action row is deliberately not hover-revealed. A
 * control that exists only under a pointer is one a keyboard and a touch screen
 * cannot find, and the one action here — giving somebody a character — is the
 * thing the screen exists to make possible.
 */

/** The person avatar, `PlayerParts.jsx`'s `Seat`, in theme names. */
function Avatar({ name, muted }: { readonly name: string; readonly muted: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        muted
          ? "flex size-7 shrink-0 items-center justify-center rounded-pill border border-hairline bg-surface-raised text-label-s leading-none font-semibold text-faint"
          : "flex size-7 shrink-0 items-center justify-center rounded-pill border border-accent bg-accent-soft text-label-s leading-none font-semibold text-verdigris-300"
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
      return row.characters
        .map((character) =>
          character.descriptor === null || character.descriptor === ""
            ? character.name
            : `${character.name} · ${character.descriptor}`,
        )
        .join(" and ");
    case "no-character":
      return "Joined, and has not got a character yet.";
    default:
      // Not "hasn't opened it" — nothing records whether a link was followed.
      // What is recorded is that it is still live and when it stops being.
      return `Invited, and it runs out on ${dayOf(row.invite.expiresAt)}.`;
  }
};

function RosterLine({
  row,
  first,
  onAssign,
}: {
  readonly row: RosterRow;
  readonly first: boolean;
  readonly onAssign: () => void;
}) {
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

      {/* Only a player member can hold a character: assignment names an account,
          and an invitation has none until it is taken. */}
      {(row.kind === "playing" || row.kind === "no-character") && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAssign}
          aria-label={
            row.kind === "playing" ? `Change ${name}'s character` : `Give ${name} a character`
          }
        >
          <Icon name={row.kind === "playing" ? "pencil" : "user-plus"} size={13} />
          {row.kind === "playing" ? "Change" : "Give them a character"}
        </Button>
      )}
    </div>
  );
}

export function RosterCard({
  rows,
  onAssign,
}: {
  readonly rows: ReadonlyArray<RosterRow>;
  readonly onAssign: (row: RosterRow) => void;
}) {
  return (
    <Card>
      {rows.map((row, index) => (
        <RosterLine key={keyOf(row)} row={row} first={index === 0} onAssign={() => onAssign(row)} />
      ))}
    </Card>
  );
}
