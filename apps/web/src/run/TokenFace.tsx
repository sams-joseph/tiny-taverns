import { HpBar, cn } from "@taverns/ui";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";

/**
 * A token's face: the drawing's counter (`Encounter Runner.dc.html`), a slate
 * disc with its initials, ringed in the party's colour or everyone else's.
 *
 * It is drawn in the drawing's own square, 40 units across, and scaled to
 * whatever square it stands on, so the disc, its rings, the bar under it and
 * the name below keep the drawing's proportions on a phone's board and a
 * zoomed-in canvas alike. The type and spacing inside it are the design
 * system's, in those units (an SVG's `foreignObject` lays HTML out in the
 * units of its `viewBox`), so nothing here restates a measurement.
 *
 * - **active**, the one whose turn it is: a peach ring outside the disc, with
 *   the board's colour between them.
 * - **selected**: the same ring in the heading colour, unless it is also the
 *   active one, whose ring wins.
 * - **hidden**: the disc's ring is dashed (the DM's board only).
 * - **portrait**: a character's portrait thumbnail, laid over the initials and
 *   clipped to the disc inside its ring, as the initiative strip lays it; the
 *   initials stand under one still loading or failed (`DrawnImage`).
 * - **struck**: the initials are struck through. Under a portrait they cannot
 *   be seen, so a struck token is read by the fade its box gives one that is
 *   out (`run/RunTokens.tsx`).
 * - **health**: the hit-point bar under the disc (`HpBar`'s bands); absent, no bar.
 * - **conditions**: how many it has, on a violet badge at the disc's shoulder.
 * - **name**: the name under it, when the board shows names (`nameShown`).
 *
 * Fading a token that is out or hidden is the token's own box's, not the
 * face's, so the player's board decides its own (`play/PlayerBoard.tsx`).
 */
export function TokenFace({
  party,
  label,
  selected,
  active,
  hidden = false,
  struck = false,
  portrait,
  health,
  conditions = 0,
  name,
}: {
  /** The party's colour rather than everyone else's. */
  readonly party: boolean;
  /** The initials (`tokenLabels`). */
  readonly label: string;
  readonly selected: boolean;
  readonly active: boolean;
  readonly hidden?: boolean;
  readonly struck?: boolean;
  /** A character's portrait thumbnail (`thumbUrl`), when it has one; never a monster's. */
  readonly portrait: string | undefined;
  /** Hit points over maximum, 0–1, when this board draws the bar. */
  readonly health?: number;
  readonly conditions?: number;
  /** The name under the token, when it wears one. */
  readonly name?: string;
}) {
  const ringed = active || selected;
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      data-slot="token-face"
      className="pointer-events-none size-full overflow-visible"
    >
      {ringed && (
        <>
          <circle
            cx={20}
            cy={20}
            r={17}
            fill="none"
            strokeWidth={2}
            className="stroke-surface-page"
          />
          <circle
            cx={20}
            cy={20}
            r={19}
            fill="none"
            strokeWidth={2}
            data-ring={active ? "active" : "selected"}
            className={active ? "stroke-accent" : "stroke-heading"}
          />
        </>
      )}
      <circle
        cx={20}
        cy={20}
        r={15}
        strokeWidth={2}
        strokeDasharray={hidden ? "4 3" : undefined}
        data-ring={hidden ? "hidden" : undefined}
        className={cn("fill-surface-raised", party ? "stroke-info" : "stroke-danger")}
      />
      <text
        x={20}
        y={20}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          "fill-heading font-sans text-label-s font-semibold",
          struck && "line-through",
        )}
      >
        {label}
      </text>
      {portrait !== undefined && (
        <foreignObject x={6} y={6} width={28} height={28}>
          <div
            data-slot="token-portrait"
            className="relative size-full overflow-hidden rounded-full"
          >
            <DrawnImage src={apiUrl(portrait)} className="object-top" />
          </div>
        </foreignObject>
      )}
      {health !== undefined && (
        <foreignObject x={6} y={41} width={28} height={3}>
          <HpBar fraction={health} className="h-full" />
        </foreignObject>
      )}
      {conditions > 0 && (
        <foreignObject x={2} y={-2} width={40} height={15}>
          <div className="flex h-full justify-end">
            <span
              data-slot="token-conditions"
              className="flex h-full min-w-3.75 items-center justify-center rounded-pill bg-magic px-0.75 font-mono text-micro leading-none font-semibold text-on-solid"
            >
              {conditions}
            </span>
          </div>
        </foreignObject>
      )}
      {name !== undefined && (
        <foreignObject x={-100} y={46} width={240} height={24}>
          <div className="flex justify-center">
            <span
              data-slot="token-name"
              className="rounded-xs border border-hairline bg-surface-sunken px-1.5 py-0.5 font-sans text-micro leading-snug font-medium whitespace-nowrap text-heading"
            >
              {name}
            </span>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
