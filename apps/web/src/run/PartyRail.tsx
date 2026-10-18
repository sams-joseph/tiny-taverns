import type { CombatantId } from "@taverns/api";
import { Badge, HpBar, Icon, SectionHeading, cn } from "@taverns/ui";

/**
 * The party down the canvas's left edge (`Encounter Canvas.dc.html`): a card
 * per member on the party's side, in the order's order, each its name and
 * subtitle, its armour class, its hit points on the shared bar and the
 * conditions it carries. A card selects, as a chip of the strip does, so it is
 * an attack's target while one is picked. Whoever is up is ringed in peach and
 * the selection in the heading's colour.
 *
 * The DM's rail and a seated player's are the same rail over rows each caller
 * works out, as the strip's are (`StripRow`): a player is told an ally's
 * numbers, and nothing the table does not send.
 */
export interface RailRow {
  readonly id: CombatantId;
  readonly displayName: string;
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

/** The conditions a card wears, in the badge each is drawn in. */
const CONDITION_BADGE: Readonly<Record<string, "destructive" | "magic" | "info">> = {
  Concentrating: "magic",
  Unconscious: "destructive",
  Prone: "info",
};

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
      <SectionHeading as="h2" size="label" className="pl-0.5">
        Party
      </SectionHeading>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
                  far ? "out of range" : undefined,
                ]
                  .filter((part) => part !== undefined)
                  .join(", ")}
                onClick={() => onSelect(row.id)}
                className={cn(
                  "flex w-full cursor-pointer flex-col gap-2 rounded-card border bg-surface-card px-3 py-2.5 text-left shadow-2",
                  "transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus",
                  active ? "border-accent" : selected ? "border-faint" : "border-hairline",
                  (row.out || far) && "opacity-60",
                  far && "border-dashed",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon name="shield" size={15} className="shrink-0 text-info" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate text-body-s leading-tight font-semibold text-heading",
                        row.out && "line-through",
                      )}
                    >
                      {row.displayName}
                    </span>
                    {row.subtitle !== undefined && (
                      <span className="truncate text-caption leading-snug text-muted-foreground">
                        {row.subtitle}
                      </span>
                    )}
                  </span>
                  {row.ac !== null && (
                    <span className="shrink-0 font-mono text-mono leading-none whitespace-nowrap text-muted-foreground">
                      AC {row.ac}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {exact ? (
                    <HpBar
                      fraction={row.health.max <= 0 ? 0 : row.health.hp / row.health.max}
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <span className="flex-1" />
                  )}
                  <span
                    className={cn(
                      "min-w-11 text-right font-mono text-mono leading-none whitespace-nowrap",
                      down ? "text-danger" : "text-heading",
                    )}
                  >
                    {numbers}
                  </span>
                </span>
                {row.conditions.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {row.conditions.map((condition) => (
                      <Badge key={condition} variant={CONDITION_BADGE[condition] ?? "secondary"}>
                        {condition}
                      </Badge>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
