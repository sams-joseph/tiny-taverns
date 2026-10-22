import {
  Icon,
  type IconName,
  IconSwitch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@taverns/ui";
import { useStageDrawers } from "./stageDrawers";

/**
 * The canvas HUD's shared pieces (the maintainer's call of 2026-10-22 to run
 * the fight as a game screen): the floating surface every HUD panel stands
 * on, the icon button the controls, the rail and the tools are made of, and
 * the drawers the rail opens (`RunStage.tsx`).
 */

/** The surface a HUD panel floats on over the board: the card's, a little see-through. */
export const hudSurface = "rounded-card border border-hairline bg-surface-card/90 shadow-3";

/**
 * A square icon button with its name in a tooltip, since the icon alone does
 * not say it: the accessible name is the same words. `on` lights it in the
 * accent (a switch that is on, a drawer that is open); a badge counts what
 * waits behind it.
 */
export function HudIconButton({
  icon,
  label,
  hint,
  on,
  badge,
  tone = "default",
  side = "bottom",
  disabled,
  expanded,
  onClick,
}: {
  readonly icon: IconName;
  readonly label: string;
  /** The tooltip, where it can say more than the name. */
  readonly hint?: string;
  readonly on?: boolean;
  readonly badge?: number | undefined;
  readonly tone?: "default" | "danger";
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly disabled?: boolean;
  /** For a button that opens a drawer: whether it is open. */
  readonly expanded?: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-expanded={expanded}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "relative flex size-control shrink-0 cursor-pointer items-center justify-center rounded-control",
              "transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus",
              "disabled:cursor-not-allowed disabled:opacity-50",
              tone === "danger"
                ? "text-danger"
                : on === true
                  ? "text-accent-ink"
                  : "text-muted-foreground hover:text-foreground",
            )}
          />
        }
      >
        <Icon name={icon} size={18} />
        {badge !== undefined && badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-magic px-1 text-micro leading-none font-semibold text-on-solid"
          >
            {badge}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side={side}>{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** A switch over what the table sees, as an icon with its name in a tooltip. */
export function HudIconSwitch({
  icon,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  readonly icon: IconName;
  readonly label: string;
  /** The tooltip, where it can say more than the name. */
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <IconSwitch
            aria-label={label}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(next) => onCheckedChange(next)}
          />
        }
      >
        <Icon name={icon} size={18} />
      </TooltipTrigger>
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** An icon button that opens a drawer of the stage; nothing off the canvas. */
export function StageDrawerButton({
  drawer,
  icon,
  label,
  badge,
  side,
}: {
  readonly drawer: string;
  readonly icon: IconName;
  readonly label: string;
  readonly badge?: number | undefined;
  readonly side?: "top" | "bottom" | "left" | "right";
}) {
  const drawers = useStageDrawers();
  if (drawers === null) return null;
  const open = drawers.open === drawer;
  return (
    <HudIconButton
      icon={icon}
      label={label}
      badge={badge}
      side={side}
      on={open}
      expanded={open}
      onClick={() => drawers.toggle(drawer)}
    />
  );
}
