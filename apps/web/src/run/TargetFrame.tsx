import type { Combatant } from "@taverns/api";
import { Badge, HpBar, Icon, cn } from "@taverns/ui";
import { HitPoints, Disc } from "./CombatantPanel";
import { HudIconButton } from "./hud";
import { SHEET_DRAWER, useStageDrawers } from "./stageDrawers";

/**
 * The canvas's target frame, top centre under the ribbon, as a game frames
 * what it has targeted (the maintainer's call of 2026-10-22): drawn while
 * something other than whoever is up is selected, and gone with the
 * selection. Its disc, name and line, its hit points on the shared bar with
 * the numbers and its armour class, its cover from whoever is up on a level,
 * its conditions, and the damage box, so a
 * hit called at the table is typed without opening anything. Everything else
 * about it (the stat block, its resources, death saves, its menu) is its full
 * card, in the *Sheet* drawer the frame opens (`RunStage.tsx`).
 */
export function TargetFrame({
  combatant,
  hp,
  label,
  portrait,
  subtitle,
  sight,
  disabled,
  onDamage,
  onClear,
}: {
  readonly combatant: Combatant;
  readonly hp: number;
  readonly label: string;
  readonly portrait: string | undefined;
  readonly subtitle: string | undefined;
  /**
   * On a level, where it stands against whoever is up: its cover and who
   * cannot see whom (`levelRules.ts`), since that is what an attack on it takes.
   */
  readonly sight: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onDamage: (amount: number) => void;
  /** Back to following the turn. */
  readonly onClear: () => void;
}) {
  const party = combatant.side === "party";
  const drawers = useStageDrawers();
  return (
    <section
      aria-label={`Target, ${combatant.displayName}`}
      data-slot="target-frame"
      className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-hairline bg-surface-card/95 py-2.5 pr-2 pl-3 shadow-3"
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <Disc
          label={label}
          party={party}
          hidden={combatant.visibility === "dm"}
          portrait={portrait}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-body leading-tight font-semibold text-heading">
              {combatant.displayName}
            </span>
            {subtitle !== undefined && (
              <span
                className={cn(
                  "min-w-0 truncate text-caption leading-snug text-muted-foreground",
                  combatant.kind !== "pc" && "font-serif italic",
                )}
              >
                {subtitle}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <HpBar
              fraction={combatant.hpMax <= 0 ? 0 : hp / combatant.hpMax}
              className="min-w-0 flex-1"
            />
            <span
              className={cn(
                "font-mono text-mono leading-none whitespace-nowrap",
                hp === 0 ? "text-danger" : "text-heading",
              )}
            >
              {hp}/{combatant.hpMax}
            </span>
            {combatant.ac !== null && (
              <span
                aria-label={`AC ${String(combatant.ac)}`}
                className="flex items-center gap-1 font-mono text-mono leading-none text-muted-foreground"
              >
                <Icon name="shield" size={13} />
                {combatant.ac}
              </span>
            )}
          </div>
          {sight.length > 0 && (
            <ul data-slot="target-sight" className="m-0 mt-1 flex list-none flex-col p-0">
              {sight.map((line) => (
                <li key={line} className="text-caption leading-snug text-info-ink">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {combatant.conditions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {combatant.conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="w-64">
          <HitPoints combatant={combatant} disabled={disabled} onApply={onDamage} />
        </div>
        {drawers !== null && (
          <HudIconButton
            icon="scroll-text"
            label={`Sheet of ${combatant.displayName}`}
            expanded={drawers.open === SHEET_DRAWER}
            onClick={() => drawers.toggle(SHEET_DRAWER)}
          />
        )}
        <HudIconButton icon="x" label="Clear target" onClick={onClear} />
      </div>
    </section>
  );
}
