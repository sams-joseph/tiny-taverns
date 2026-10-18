import type { ActionCost } from "@taverns/api";
import { HpBar, Icon, SectionHeading, Toggle, cn } from "@taverns/ui";
import type { ReactNode } from "react";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import type { TurnTicks } from "./turn";

/**
 * Whoever is up, at the foot of the canvas (`Encounter Canvas.dc.html`, the
 * maintainer's call of 2026-10-17): who they are and how they stand, what this
 * turn has spent, what they can do, what the last attack came to, and the one
 * peach button that moves the turn on.
 *
 * - **Spent** is the action, bonus action and reaction, each a toggle with a
 *   dot that goes out once used, and the feet walked against the speed, a
 *   segment for every 5 ft, red past it (the feet alone when there is no
 *   speed to measure against). They write as the panel's *This turn* did
 *   (`run/turn.ts`): absolute values through the turn write.
 * - **What they can do** is a tile per line: an attack's tile resolves against
 *   the selected creature at once, or asks for one; a line with no to-hit
 *   rolls. Each says its to-hit, save and damage, and what it costs when the
 *   block or sheet says.
 *
 * The DM's runner and a seated player's table draw the same card, each with
 * what it may do: a player's carries no *Next turn*.
 */
export interface TurnTile {
  readonly key: string;
  readonly name: string;
  /** `+7 to hit · 1d8+4 slashing` (`actionDetail`), or a multiattack's summary. */
  readonly detail: string;
  /** What it costs, when the block or sheet says. */
  readonly cost: ActionCost | undefined;
  /** An attack resolves against a target; a roll rolls with none. */
  readonly kind: "attack" | "multiattack" | "roll";
  /** The tile's accessible name: `Attack with Longsword`, `Roll Fire Breath`. */
  readonly label: string;
  /** Its target is being picked. */
  readonly pressed?: boolean;
  readonly onPress: () => void;
}

const COST: Readonly<Record<ActionCost, string>> = {
  action: "Action",
  bonus: "Bonus",
  reaction: "Reaction",
  free: "Free",
};

const TICKS = [
  ["actionUsed", "Action"],
  ["bonusUsed", "Bonus"],
  ["reactionUsed", "Reaction"],
] as const;

export function TurnCard({
  name,
  label,
  portrait,
  subtitle,
  subtitleSerif,
  health,
  ac,
  spent,
  speed,
  ticksDisabled,
  locked,
  onTick,
  tiles,
  tilesDisabled,
  result,
  hint,
  action,
}: {
  readonly name: string;
  /** The token's initials (`tokenLabels`). */
  readonly label: string;
  readonly portrait: string | undefined;
  readonly subtitle: string | undefined;
  /** A monster's line is the stat block's flavour, in the block's serif italic. */
  readonly subtitleSerif: boolean;
  /** Exact hit points; absent where the reader is not told them. */
  readonly health: { readonly hp: number; readonly max: number } | undefined;
  readonly ac: number | null;
  readonly spent: {
    readonly actionUsed: boolean;
    readonly bonusUsed: boolean;
    readonly reactionUsed: boolean;
    readonly feetMoved: number;
  };
  readonly speed: number | undefined;
  readonly ticksDisabled: boolean;
  /** Ticks this reader may not press now: a player's action off their own turn. */
  readonly locked?: ReadonlySet<keyof TurnTicks>;
  readonly onTick: (ticks: TurnTicks) => void;
  readonly tiles: ReadonlyArray<TurnTile>;
  readonly tilesDisabled: boolean;
  /** The last attack's result card (`AttackResultCard`). */
  readonly result?: ReactNode;
  /** A line of what to do next. */
  readonly hint: string;
  /** The card's one peach button: the DM's *Next turn*. */
  readonly action?: ReactNode;
}) {
  const moved = spent.feetMoved;
  const over = speed !== undefined && moved > speed;
  // A segment for every 5 ft of the speed, lit for what is left.
  const segments = speed === undefined ? 0 : Math.min(24, Math.max(1, Math.ceil(speed / 5)));
  const left = speed === undefined ? 0 : Math.max(0, speed - moved);
  return (
    <section
      aria-label={`This turn of ${name}`}
      data-slot="turn-card"
      className="flex flex-col gap-3.5 rounded-card border border-t-3 border-strong border-t-accent bg-surface-card px-5 py-4 shadow-3 @container"
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <span
          aria-hidden="true"
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-surface-raised",
            "text-label leading-none font-semibold text-heading shadow-glow-accent",
          )}
        >
          {label}
          <DrawnImage
            src={portrait === undefined ? undefined : apiUrl(portrait)}
            className="object-top"
          />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex min-w-0 items-baseline gap-2">
            <SectionHeading as="h2" size="title" className="min-w-0 truncate">
              {name}
            </SectionHeading>
            <span className="shrink-0 text-body-s leading-none text-accent-ink">is up</span>
          </div>
          {subtitle !== undefined && (
            <p
              className={cn(
                "mb-0 truncate leading-snug text-muted-foreground",
                subtitleSerif ? "font-serif text-body italic" : "text-caption",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {health !== undefined && (
            <>
              <HpBar
                fraction={health.max <= 0 ? 0 : health.hp / health.max}
                className="h-2.5 w-40"
              />
              <span
                className={cn(
                  "min-w-13 font-mono text-mono leading-none",
                  health.hp === 0 ? "text-danger" : "text-heading",
                )}
              >
                {health.hp}/{health.max}
              </span>
            </>
          )}
          {ac !== null && (
            <span
              aria-label={`AC ${String(ac)}`}
              className="flex items-center gap-1 font-mono text-mono leading-none text-muted-foreground"
            >
              <Icon name="shield" size={14} />
              {ac}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TICKS.map(([key, word]) => (
          <Toggle
            key={key}
            size="sm"
            className="gap-1.5 rounded-pill data-pressed:text-faint"
            pressed={spent[key]}
            disabled={ticksDisabled || locked?.has(key) === true}
            onPressedChange={(used) => onTick({ [key]: used })}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full border-2",
                spent[key] ? "border-strong" : "border-accent bg-accent",
              )}
            />
            {word}
          </Toggle>
        ))}
        <span
          data-slot="movement-pill"
          className="inline-flex h-control-sm items-center gap-2 rounded-pill border border-strong px-3 text-label-s text-heading"
        >
          Move
          {speed !== undefined && (
            <span data-slot="movement-bar" aria-hidden="true" className="flex gap-0.5">
              {Array.from({ length: segments }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 w-2.5 rounded-xs",
                    over
                      ? "bg-danger"
                      : index < Math.ceil(left / 5)
                        ? "bg-accent"
                        : "bg-surface-raised",
                  )}
                />
              ))}
            </span>
          )}
          <span
            data-slot="movement"
            className={cn(
              "font-mono text-mono leading-none whitespace-nowrap",
              over ? "text-danger" : "text-muted-foreground",
            )}
          >
            {/* No speed to measure against is the feet walked alone, never a guessed maximum. */}
            {speed === undefined ? `${String(moved)} ft` : `${String(moved)}/${String(speed)} ft`}
          </span>
        </span>
      </div>

      {tiles.length > 0 && (
        <section aria-label={`Actions of ${name}`}>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 @lg:grid-cols-3">
            {tiles.map((tile) => (
              <li key={tile.key} className="min-w-0">
                <button
                  type="button"
                  aria-label={tile.label}
                  aria-pressed={tile.kind === "roll" ? undefined : tile.pressed === true}
                  disabled={tilesDisabled}
                  onClick={tile.onPress}
                  className={cn(
                    "flex size-full cursor-pointer flex-col gap-1.5 rounded-control border bg-surface-raised px-3 py-2.5 text-left",
                    "transition-control outline-none hover:bg-surface-page focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
                    tile.pressed === true ? "border-danger" : "border-strong",
                  )}
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    <Icon
                      name={
                        tile.kind === "multiattack"
                          ? "swords"
                          : tile.kind === "attack"
                            ? "sword"
                            : "dice-5"
                      }
                      size={14}
                      className={cn("shrink-0", tile.kind === "roll" ? "text-info" : "text-danger")}
                    />
                    <span className="min-w-0 flex-1 truncate text-body-s leading-tight font-semibold text-heading">
                      {tile.name}
                    </span>
                    {tile.cost !== undefined && (
                      <span className="shrink-0 text-caption leading-none text-muted-foreground">
                        {COST[tile.cost]}
                      </span>
                    )}
                  </span>
                  {tile.detail !== "" && (
                    <span className="w-full truncate font-mono text-caption leading-snug text-muted-foreground">
                      {tile.detail}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result}

      <div className="flex flex-wrap items-center gap-3">
        <p className="mb-0 min-w-0 flex-1 basis-56 text-body-s leading-snug text-muted-foreground">
          {hint}
        </p>
        {action}
      </div>
    </section>
  );
}
