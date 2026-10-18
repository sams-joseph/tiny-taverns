import { HpBar, Icon, cn } from "@taverns/ui";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";

/**
 * A token's face: the standee of `Encounter Canvas.dc.html` (the maintainer's
 * call of 2026-10-17), a slate disc with its initials standing over a base
 * ring on its square, ringed in the party's colour or everyone else's.
 *
 * It is drawn in the drawing's own square, 40 units across, and scaled to
 * whatever square it stands on, so the disc, its rings, the bar over it and
 * the name above keep the drawing's proportions on a phone's board and a
 * zoomed-in canvas alike. The type and spacing inside it are the design
 * system's, in those units (an SVG's `foreignObject` lays HTML out in the
 * units of its `viewBox`), so nothing here restates a measurement.
 *
 * It is two layers. The **base** lies on the board: a ring and a wash in the
 * side's colour (peach, glowing, for whoever is up). The **stand** is the
 * disc, its badges, the hit-point bar and the name, standing over it.
 *
 * - **active**, the one whose turn it is: a peach ring outside the disc, with
 *   the board's colour between them, and a peach base.
 * - **selected**: the same ring in the heading colour, unless it is also the
 *   active one, whose ring wins.
 * - **hidden**: the disc's ring is dashed (the DM's board only).
 * - **portrait**: a character's portrait thumbnail, laid over the initials and
 *   clipped to the disc inside its ring, as the initiative strip lays it; the
 *   initials stand under one still loading or failed (`DrawnImage`).
 * - **struck**: the initials are struck through. Under a portrait they cannot
 *   be seen, so a struck token is read by the fade its box gives one that is
 *   out (`run/RunTokens.tsx`).
 * - **health**: the hit-point bar over the disc (`HpBar`'s bands); absent, no bar.
 * - **conditions**: how many it has, on a violet badge at the disc's shoulder.
 * - **name**: the name over it, when the board shows names (`nameShown`).
 *
 * The side's mark, a shield or a skull, sits on the disc's foot.
 *
 * ### Standing on the board
 *
 * The disc stands a little off the map, over a shadow
 * cast down and to the right (the board's 2.5D): the one whose turn it is
 * rises a step, one being dragged rises two, and its shadow falls further
 * away and fainter as it does. A token that moves hops (`hop`): its disc lifts
 * off the shadow and settles while its box glides to the square.
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
  lifted,
  hop,
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
  /** The name over the token, when it wears one. */
  readonly name?: string;
  /** Off the board a step on its turn, two while it is held. */
  readonly lifted?: "turn" | "held" | undefined;
  /** Flips each time it moves, which restarts the hop; never moved, no hop. */
  readonly hop?: "a" | "b" | undefined;
}) {
  const ringed = active || selected;
  return (
    <span
      data-slot="token-face"
      aria-hidden
      className="pointer-events-none relative block size-full"
    >
      <svg
        viewBox="0 0 40 40"
        data-slot="token-base"
        className="absolute inset-0 size-full overflow-visible"
      >
        {active && <circle cx={20} cy={20} r={21} className="fill-accent opacity-20" />}
        <circle
          cx={20}
          cy={20}
          r={18}
          strokeWidth={2}
          className={cn(
            active
              ? "fill-accent/20 stroke-accent"
              : party
                ? "fill-info/15 stroke-info"
                : "fill-danger/15 stroke-danger",
          )}
        />
        <circle
          cx={20}
          cy={20}
          r={15}
          data-slot="token-shadow"
          className={cn(
            "fill-scrim transition-[translate,opacity] duration-(--dur-fast) ease-out",
            lifted === "held"
              ? "translate-x-2 translate-y-3.5 opacity-50"
              : lifted === "turn"
                ? "translate-x-1.5 translate-y-2.5 opacity-75"
                : "translate-x-1 translate-y-1.5 opacity-90",
          )}
        />
      </svg>
      <svg
        viewBox="0 0 40 40"
        data-slot="token-stand"
        className="absolute inset-0 size-full overflow-visible"
      >
        <g
          data-slot="token-disc"
          data-hop={hop}
          className={cn(
            "transition-[translate] duration-(--dur-fast) ease-out",
            lifted === "held" ? "-translate-y-2" : lifted === "turn" && "-translate-y-1",
            hop === "a" && "animate-token-hop-a",
            hop === "b" && "animate-token-hop-b",
          )}
        >
          {/* What a blow does to it (`fx/stage.ts`): knocked back and flashed white. */}
          <g data-slot="token-recoil">
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
            {/* The ink every shape on the board is drawn in. */}
            <circle
              cx={20}
              cy={20}
              r={16.5}
              strokeWidth={1.5}
              fill="none"
              className="stroke-fx-ink"
            />
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
            {/* A hard rim of light from the top left. */}
            <path
              d="M 6.5 22 A 13.5 13.5 0 0 1 18 6.6"
              fill="none"
              strokeWidth={1.2}
              strokeLinecap="round"
              className="stroke-fx-radiant-core opacity-70"
            />
            <circle
              data-slot="token-flash"
              cx={20}
              cy={20}
              r={15}
              opacity={0}
              className="fill-fx-radiant-core"
            />
            {/* The side's mark on the disc's foot: a shield for the party, a skull for everyone else. */}
            <foreignObject x={27} y={27} width={11} height={11}>
              <span
                data-slot="token-side"
                className={cn(
                  "flex size-full items-center justify-center rounded-full border border-strong bg-surface-sunken",
                  party ? "text-info" : "text-danger",
                )}
              >
                <Icon name={party ? "shield" : "skull"} size={7} />
              </span>
            </foreignObject>
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
          </g>
        </g>
        {health !== undefined && (
          <foreignObject x={8} y={-4} width={24} height={3}>
            <HpBar fraction={health} className="h-full" />
          </foreignObject>
        )}
        {name !== undefined && (
          <foreignObject x={-100} y={health === undefined ? -22 : -26} width={240} height={20}>
            <div className="flex h-full items-end justify-center">
              <span
                data-slot="token-name"
                className={cn(
                  "rounded-xs border bg-surface-sunken px-1.5 py-0.5 font-sans text-micro leading-snug font-medium whitespace-nowrap text-heading",
                  active ? "border-accent" : "border-hairline",
                )}
              >
                {name}
              </span>
            </div>
          </foreignObject>
        )}
      </svg>
    </span>
  );
}
