import type { CombatantId } from "@taverns/api";
import { SectionHeading, Tooltip, TooltipContent, TooltipTrigger, cn } from "@taverns/ui";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import { HpRing } from "./HpRing";

/**
 * The party down the canvas's left edge, as a game's party frames (the
 * maintainer's call of 2026-10-22): a portrait per member on the party's side,
 * in the order's order, its hit points a ring round it and the numbers under
 * it. The name, armour class and conditions are its tooltip and its accessible
 * name; a dot counts its conditions. A portrait selects, as a chip of the
 * strip does, so it is an attack's target while one is picked. Whoever is up
 * is ringed in peach and the selection in the heading's colour; one out of
 * reach of the line being aimed is faded.
 *
 * The DM's rail and a seated player's are the same rail over rows each caller
 * works out, as the strip's are (`StripRow`): a player is told an ally's
 * numbers, and nothing the table does not send.
 */
export interface RailRow {
  readonly id: CombatantId;
  readonly displayName: string;
  /** The token's initials (`tokenLabels`), under the portrait. */
  readonly label: string;
  /** A PC's portrait, where the reader is shown one. */
  readonly portrait: string | undefined;
  /** A person's line: what they are and who plays them. */
  readonly subtitle: string | undefined;
  readonly ac: number | null;
  readonly health:
    | { readonly hp: number; readonly max: number }
    | { readonly band: string; readonly down: boolean };
  readonly conditions: ReadonlyArray<string>;
  /** Faded: out of the fight (`outOfTheFight`). */
  readonly out: boolean;
}

export function PartyRail({
  rows,
  activeId,
  selectedId,
  outOfRange,
  onSelect,
}: {
  readonly rows: ReadonlyArray<RailRow>;
  readonly activeId: CombatantId | null;
  readonly selectedId: CombatantId | undefined;
  /** Beyond the reach and range of the line whose target is being picked. */
  readonly outOfRange?: ReadonlySet<CombatantId> | undefined;
  readonly onSelect: (id: CombatantId) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Party" data-slot="party-rail" className="flex flex-col gap-2">
      <SectionHeading as="h2" size="label" className="sr-only">
        Party
      </SectionHeading>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row) => {
          const active = row.id === activeId;
          const selected = row.id === selectedId;
          const far = outOfRange?.has(row.id) === true;
          const exact = "hp" in row.health;
          const down = exact ? row.health.hp === 0 : row.health.down;
          const numbers = exact
            ? `${String(row.health.hp)}/${String(row.health.max)}`
            : row.health.band;
          return (
            <li key={row.id}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      data-party-row={row.id}
                      aria-pressed={selected}
                      aria-current={active ? "step" : undefined}
                      aria-label={[
                        `${row.displayName} in the party`,
                        exact
                          ? `${String(row.health.hp)} of ${String(row.health.max)} hit points`
                          : row.health.band.toLowerCase(),
                        row.ac === null ? undefined : `AC ${String(row.ac)}`,
                        row.conditions.length === 0 ? undefined : row.conditions.join(", "),
                        far ? "out of range" : undefined,
                      ]
                        .filter((part) => part !== undefined)
                        .join(", ")}
                      onClick={() => onSelect(row.id)}
                      className={cn(
                        "relative flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-card p-0.5",
                        "transition-control outline-none focus-visible:ring-focus",
                        (row.out || far) && "opacity-60",
                      )}
                    />
                  }
                >
                  <HpRing
                    fraction={
                      exact ? (row.health.max <= 0 ? 0 : row.health.hp / row.health.max) : undefined
                    }
                    className={cn(
                      "size-14 rounded-full",
                      active
                        ? // No glow: the column scrolls, and its box would clip one square.
                          "ring-2 ring-accent"
                        : selected && "ring-2 ring-faint",
                    )}
                  >
                    <span className={cn(row.out && "line-through")}>{row.label}</span>
                    <DrawnImage
                      src={row.portrait === undefined ? undefined : apiUrl(row.portrait)}
                      className="object-top"
                    />
                  </HpRing>
                  {row.conditions.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-0 flex size-4.5 items-center justify-center rounded-full bg-magic text-micro leading-none font-semibold text-on-solid"
                    >
                      {row.conditions.length}
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-mono text-micro leading-none whitespace-nowrap",
                      down ? "text-danger" : "text-muted-foreground",
                    )}
                  >
                    {numbers}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex flex-col items-start gap-0.5">
                  <span className="font-semibold">{row.displayName}</span>
                  {row.subtitle !== undefined && <span>{row.subtitle}</span>}
                  <span className="font-mono">
                    {numbers}
                    {row.ac === null ? "" : ` · AC ${String(row.ac)}`}
                  </span>
                  {row.conditions.length > 0 && <span>{row.conditions.join(", ")}</span>}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
