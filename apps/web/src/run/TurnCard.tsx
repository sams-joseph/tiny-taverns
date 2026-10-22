import type { ActionCost } from "@taverns/api";
import { Icon, SectionHeading, Toggle, cn } from "@taverns/ui";
import type { ReactNode } from "react";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import { HpRing } from "./HpRing";
import type { TurnTicks } from "./turn";

/**
 * Whoever is up, at the foot of the canvas as a game's action bar (the
 * maintainer's calls of 2026-10-17 and 2026-10-22): their portrait with its
 * hit points as a ring, what this turn has spent, a slot per thing they can
 * do, what the last attack came to over it, the one peach button that moves
 * the turn on, and a line of what to do next under it.
 *
 * - **Spent** is the action, bonus action and reaction, each a toggle with a
 *   gem in its colour that goes out once used, and the feet walked against the speed, a
 *   segment for every 5 ft, red past it (the feet alone when there is no
 *   speed to measure against). They write as the panel's *This turn* did
 *   (`run/turn.ts`): absolute values through the turn write.
 * - **What they can do** is a slot per line, side by side: an attack's tile resolves against
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

/** Each tick's gem while unspent, in the colour of what it spends. */
const GEM: Readonly<Record<keyof TurnTicks, string>> = {
  actionUsed: "bg-accent",
  bonusUsed: "bg-info",
  reactionUsed: "bg-magic",
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
  downed,
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
  /**
   * A party member at zero: their death saves (`DeathSaveBlock`), which are
   * rolled on their turn, so on the bar rather than behind the sheet.
   */
  readonly downed?: ReactNode;
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
      className="flex flex-col gap-2.5 rounded-card border border-t-3 border-strong border-t-accent bg-surface-card/95 px-panel py-3 shadow-3 @container"
    >
      {result}
      <div className="flex items-center gap-4">
        <div className="relative flex shrink-0 flex-col items-center">
          <HpRing
            fraction={
              health === undefined ? undefined : health.max <= 0 ? 0 : health.hp / health.max
            }
            className="size-20 rounded-full shadow-glow-accent ring-2 ring-accent"
          >
            <span className="text-title">{label}</span>
            <DrawnImage
              src={portrait === undefined ? undefined : apiUrl(portrait)}
              className="object-top"
            />
          </HpRing>
          {health !== undefined && (
            <span
              className={cn(
                "relative z-lifted -mt-2.5 rounded-sm border border-hairline bg-surface-sunken px-1.5 py-0.5 font-mono text-micro leading-none",
                health.hp === 0 ? "text-danger" : "text-heading",
              )}
            >
              {health.hp}/{health.max}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <SectionHeading as="h2" size="title" className="min-w-0 truncate">
              {name}
            </SectionHeading>
            <span className="shrink-0 text-body-s leading-none text-accent-ink">is up</span>
            {subtitle !== undefined && (
              <span
                className={cn(
                  "min-w-0 truncate leading-snug text-muted-foreground",
                  subtitleSerif ? "font-serif text-body-s italic" : "text-caption",
                )}
              >
                {subtitle}
              </span>
            )}
            {ac !== null && (
              <span
                aria-label={`AC ${String(ac)}`}
                className="ml-auto flex shrink-0 items-center gap-1 font-mono text-mono leading-none text-muted-foreground"
              >
                <Icon name="shield" size={14} />
                {ac}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {TICKS.map(([key, word]) => (
              <Toggle
                key={key}
                size="sm"
                className="gap-2 rounded-pill px-2.5 data-pressed:text-faint data-pressed:line-through"
                pressed={spent[key]}
                disabled={ticksDisabled || locked?.has(key) === true}
                onPressedChange={(used) => onTick({ [key]: used })}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 rotate-45 rounded-xs",
                    spent[key] ? "bg-surface-raised" : GEM[key],
                  )}
                />
                {word}
              </Toggle>
            ))}
            <span
              data-slot="movement-pill"
              className="inline-flex h-control-sm items-center gap-2 px-2 text-label-s text-heading"
            >
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
                {speed === undefined
                  ? `${String(moved)} ft`
                  : `${String(moved)}/${String(speed)} ft`}
              </span>
            </span>
          </div>

          {tiles.length > 0 && (
            <section aria-label={`Actions of ${name}`}>
              <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
                {tiles.map((tile) => (
                  <li key={tile.key} className="w-36 shrink-0">
                    <button
                      type="button"
                      aria-label={tile.label}
                      aria-pressed={tile.kind === "roll" ? undefined : tile.pressed === true}
                      disabled={tilesDisabled}
                      onClick={tile.onPress}
                      className={cn(
                        "flex size-full cursor-pointer flex-col gap-1 rounded-control border bg-surface-raised px-2.5 py-2 text-left",
                        "transition-control outline-none hover:border-accent focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
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
                          size={16}
                          className={cn(
                            "shrink-0",
                            tile.kind === "roll" ? "text-info" : "text-danger",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-body-s leading-tight font-semibold text-heading">
                          {tile.name}
                        </span>
                        {tile.cost !== undefined && (
                          <span className="shrink-0 text-micro leading-none text-muted-foreground">
                            {COST[tile.cost]}
                          </span>
                        )}
                      </span>
                      {tile.detail !== "" && (
                        <span className="w-full truncate font-mono text-micro leading-snug text-muted-foreground">
                          {tile.detail}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {action !== undefined && <div className="shrink-0 self-center">{action}</div>}
      </div>
      {downed}
      <p className="mb-0 truncate text-caption leading-snug text-muted-foreground">{hint}</p>
    </section>
  );
}
