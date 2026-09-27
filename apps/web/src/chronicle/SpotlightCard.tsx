import type { PartySeat, Session } from "@taverns/api";
import { Card, SectionHeading, cn } from "@taverns/ui";
import { spotlightTally } from "./spotlight";

/**
 * *Spotlight*, under *Jump to*: one row per seat at the table with how many
 * nights were theirs, and a line naming whoever has had the fewest.
 *
 * **The DM's only.** It is their balancing tool, not part of the record the
 * table reads, so the player's Chronicle has no aside of this kind at all.
 *
 * Drawn once a night names somebody still at the table (`spotlightTally`): a
 * column of empty bars counts nothing. The fewest take the accent and the rest
 * the info colour — the semantic tokens, where the drawing reached for the
 * ramp steps behind them.
 */
export function SpotlightCard({
  party,
  sessions,
}: {
  readonly party: ReadonlyArray<PartySeat>;
  readonly sessions: ReadonlyArray<Session>;
}) {
  const tally = spotlightTally(party, sessions);
  if (!tally.any) return null;

  return (
    <Card className="flex flex-col gap-3 px-card py-4">
      <SectionHeading size="title">Spotlight</SectionHeading>
      <ul aria-label="Spotlight" className="m-0 flex list-none flex-col gap-3 p-0">
        {tally.rows.map((row) => (
          <li key={row.seatId} data-fewest={row.fewest} className="flex items-center gap-2.5">
            <span className="w-20 shrink-0 truncate text-label leading-none font-medium text-heading">
              {row.name}
            </span>
            <div
              aria-hidden="true"
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunken"
            >
              <div
                data-slot="spotlight-fill"
                className={cn("h-full", row.fewest ? "bg-accent" : "bg-info")}
                style={{ width: `${String(Math.round(row.share * 100))}%` }}
              />
            </div>
            <span className="w-5 shrink-0 text-right font-mono text-mono leading-none font-medium text-muted-foreground">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
      {tally.hint !== undefined && (
        <p className="m-0 text-label leading-body text-pretty text-muted-foreground">
          {tally.hint}
        </p>
      )}
    </Card>
  );
}
