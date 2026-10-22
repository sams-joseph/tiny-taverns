import { Link, type LinkProps } from "@tanstack/react-router";
import { Icon } from "@taverns/ui";

/**
 * The canvas's title, top left (`Encounter Canvas.dc.html`): the way back,
 * since the nav rows are put away while the canvas holds the window, then the
 * name and where it is. Plain text on the board's dark edge, with no card, as
 * a game's screen titles a level. The DM's runner and a seated player's table
 * share it.
 */
export function CanvasTitle({
  back,
  title,
  subtitle,
}: {
  readonly back: LinkProps;
  readonly title: string;
  readonly subtitle: string | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Link
        {...back}
        aria-label="Overview"
        className="flex size-control shrink-0 items-center justify-center rounded-control text-muted-foreground transition-control outline-none hover:bg-surface-raised hover:text-foreground focus-visible:ring-focus"
      >
        <Icon name="arrow-left" size={18} />
      </Link>
      <div className="min-w-0">
        <h1 className="mb-0 truncate text-title leading-tight font-semibold tracking-tight text-heading">
          {title}
        </h1>
        {subtitle !== undefined && subtitle !== "" && (
          <p className="mb-0 truncate text-caption leading-snug text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
