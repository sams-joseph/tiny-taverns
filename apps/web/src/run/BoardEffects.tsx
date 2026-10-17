import { type DamageType, areaSquares, areaToward, battleMapPlane, cellRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import type { AnimationEvent, CSSProperties } from "react";
import type { DrawnBoard } from "./BoardTools";
import type { BlastPlay, Playing, StrikePlay } from "./useBoardEffects";
import { percentOf } from "./tokens";

/**
 * The board's combat effects, over its tokens, on the DM's board and a
 * player's alike (`TokenLayer`, `run/RunTokens.tsx`).
 *
 * What plays is `effectsBetween` (`run/effects.ts`) over the tokens this board
 * draws, so it plays only what this reader may already see: a burst rings a
 * token that was hit (`danger`) or healed (`success`), with the number rising
 * off it when the reader knows the hit points, and a token that moved hops
 * (`TokenFace`). Each burst is its own element, playing its keyframes once from
 * the moment it mounts (`styles.css`, §4b) and removed on `animationend`; under
 * reduced motion its duration is zero, so it ends the frame it starts.
 *
 * A strike (`strikesOf`, from an attack roll that says what it was) is drawn
 * from the attacker's square to the target's: a ranged weapon looses an arrow
 * that arcs over its own ground shadow, a spell a bolt with a trail, a melee
 * weapon a swing across the target. A hit lands in a flash at the target, a
 * miss a square aside in a puff. An area (`blastsOf`) fills its own squares in
 * a wave out from its origin: a cone or a line from the creature, a sphere or
 * a cube from its centre, lobbed there first as an arcing orb when it went off
 * away from the creature, with a shockwave ring. Every tone is a semantic one,
 * by damage type (`TONE`), until the designers' delivery answers them.
 */

/** `−5`, `+4`, with a true minus. */
const said = (effect: Extract<Playing, { kind: "hurt" | "heal" }>): string =>
  `${effect.kind === "hurt" ? "−" : "+"}${String(effect.amount)}`;

export function BoardEffects({
  board,
  playing,
  ended,
}: {
  readonly board: DrawnBoard;
  readonly playing: ReadonlyArray<Playing>;
  readonly ended: (key: number) => void;
}) {
  if (playing.length === 0) return null;
  const plane = battleMapPlane(board, board.image);
  return (
    <div
      data-slot="board-effects"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-lifted"
    >
      {playing.map((effect) => {
        if (effect.kind === "blast") {
          return (
            <BlastEffect
              key={effect.key}
              board={board}
              blast={effect}
              onEnd={() => ended(effect.key)}
            />
          );
        }
        if (effect.kind === "strike") {
          return (
            <StrikeEffect
              key={effect.key}
              board={board}
              strike={effect}
              onEnd={() => ended(effect.key)}
            />
          );
        }
        const hurt = effect.kind === "hurt";
        return (
          <div
            key={effect.key}
            data-effect={effect.kind}
            data-token={effect.id}
            className="absolute"
            // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
            style={percentOf(cellRect(board, effect.at), plane)}
            onAnimationEnd={() => ended(effect.key)}
          >
            <svg viewBox="0 0 40 40" className="size-full overflow-visible">
              <circle
                cx={20}
                cy={20}
                r={17}
                strokeWidth={4}
                className={cn(
                  "origin-center animate-effect-burst transform-fill",
                  hurt ? "fill-danger/45 stroke-danger" : "fill-success/45 stroke-success",
                )}
              />
              {effect.amount !== undefined && (
                // Visible overflow: the number rises out of the box it starts in.
                <foreignObject x={-30} y={-14} width={100} height={20} className="overflow-visible">
                  <div className="flex justify-center">
                    <span
                      data-slot="effect-amount"
                      className={cn(
                        "animate-effect-rise rounded-xs bg-surface-sunken px-1 font-mono text-label-s leading-tight font-semibold",
                        hurt ? "text-danger" : "text-success",
                      )}
                    >
                      {said(effect)}
                    </span>
                  </div>
                </foreignObject>
              )}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/** The semantic tone a damage type is drawn in; a weapon's own three are the plain heading. */
type Tone = "accent" | "info" | "success" | "magic" | "heading";

const TONE: Readonly<Record<DamageType, Tone>> = {
  fire: "accent",
  cold: "info",
  lightning: "info",
  thunder: "info",
  acid: "success",
  poison: "success",
  necrotic: "magic",
  force: "magic",
  psychic: "magic",
  radiant: "heading",
  piercing: "heading",
  slashing: "heading",
  bludgeoning: "heading",
};

// Whole class names, so the theme emits every one of them.
const FILL: Readonly<Record<Tone, string>> = {
  accent: "fill-accent",
  info: "fill-info",
  success: "fill-success",
  magic: "fill-magic",
  heading: "fill-heading",
};
const HALO: Readonly<Record<Tone, string>> = {
  accent: "fill-accent/35",
  info: "fill-info/35",
  success: "fill-success/35",
  magic: "fill-magic/35",
  heading: "fill-heading/35",
};
const STROKE: Readonly<Record<Tone, string>> = {
  accent: "stroke-accent",
  info: "stroke-info",
  success: "stroke-success",
  magic: "stroke-magic",
  heading: "stroke-heading",
};

/** `calc(var(--dur-fast) * n)`: every time here is a multiple of the delivery's own step. */
const times = (token: string, n: number): string => `calc(var(${token}) * ${String(n)})`;

/**
 * One strike, drawn on a plane-sized layer so a point is the board's own. The
 * flight's length sets its time, half a step of `--dur-fast` a square within
 * bounds, and the impact waits for it. Its geometry and
 * timing are custom properties on its root, which the keyframes read.
 */
function StrikeEffect({
  board,
  strike,
  onEnd,
}: {
  readonly board: DrawnBoard;
  readonly strike: StrikePlay;
  readonly onEnd: () => void;
}) {
  const plane = battleMapPlane(board, board.image);
  const centre = (square: StrikePlay["from"]) => {
    const rect = cellRect(board, square);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, cell: rect.width };
  };
  const from = centre(strike.from);
  const at = centre(strike.to);
  const cell = at.cell;
  const missed = strike.outcome === "miss" || strike.outcome === "fumble";
  const critical = strike.outcome === "crit";
  const span = Math.hypot(at.x - from.x, at.y - from.y);
  const along =
    span === 0 ? { x: 1, y: 0 } : { x: (at.x - from.x) / span, y: (at.y - from.y) / span };
  // A miss flies on past the target and a little aside.
  const to = missed
    ? {
        x: at.x + along.x * cell * 0.5 - along.y * cell * 0.6,
        y: at.y + along.y * cell * 0.5 + along.x * cell * 0.6,
      }
    : at;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squares = Math.hypot(dx, dy) / cell;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tone = TONE[strike.damageType ?? "piercing"];
  const melee = strike.delivery === "melee-weapon";
  const flight = times("--dur-fast", Math.min(6, Math.max(2.5, squares * 0.5)));
  const geometry = {
    "--fx-dx": `${String(dx)}px`,
    "--fx-dy": `${String(dy)}px`,
    "--fx-arc": `${String(Math.min(cell * 1.2, squares * cell * 0.25))}px`,
    "--fx-flight": flight,
    "--fx-after": melee ? times("--dur-slower", 0.4) : flight,
  } as CSSProperties;

  const ended = (event: AnimationEvent) => {
    if (event.animationName === "tt-fx-impact") onEnd();
  };

  return (
    <svg
      data-effect="strike"
      data-delivery={strike.delivery}
      data-outcome={strike.outcome ?? undefined}
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
      // eslint-disable-next-line shadcn/no-inline-styles -- the strike's own geometry and timing, as custom properties its keyframes read.
      style={geometry}
      onAnimationEnd={ended}
    >
      {strike.delivery === "ranged-weapon" && (
        <g transform={`translate(${String(from.x)} ${String(from.y)})`}>
          {/* The shadow keeps to the ground while the arrow arcs over it. */}
          <g data-slot="fx-shadow" className="animate-fx-travel">
            <ellipse rx={cell * 0.2} ry={cell * 0.05} className="fill-scrim opacity-70" />
          </g>
          <g className="animate-fx-travel">
            <g className="animate-fx-arc">
              <g data-slot="fx-arrow" transform={`rotate(${String(angle)}) scale(1.6)`}>
                <line
                  x1={-cell * 0.3}
                  x2={cell * 0.22}
                  strokeWidth={cell * 0.09}
                  strokeLinecap="round"
                  className="stroke-surface-sunken"
                />
                <line
                  x1={-cell * 0.3}
                  x2={cell * 0.22}
                  strokeWidth={cell * 0.04}
                  strokeLinecap="round"
                  className={STROKE[tone]}
                />
                <polygon
                  points={`${String(cell * 0.34)},0 ${String(cell * 0.18)},${String(-cell * 0.07)} ${String(cell * 0.18)},${String(cell * 0.07)}`}
                  strokeWidth={cell * 0.02}
                  className={cn(FILL[tone], "stroke-surface-sunken")}
                />
                <line
                  x1={-cell * 0.3}
                  x2={-cell * 0.4}
                  y2={-cell * 0.07}
                  strokeWidth={cell * 0.035}
                  className="stroke-danger"
                />
                <line
                  x1={-cell * 0.3}
                  x2={-cell * 0.4}
                  y2={cell * 0.07}
                  strokeWidth={cell * 0.035}
                  className="stroke-danger"
                />
              </g>
            </g>
          </g>
        </g>
      )}
      {(strike.delivery === "ranged-spell" || strike.delivery === "melee-spell") && (
        <g data-slot="fx-bolt" transform={`translate(${String(from.x)} ${String(from.y)})`}>
          {[2, 1].map((n) => (
            <g
              key={n}
              className="animate-fx-travel"
              // eslint-disable-next-line shadcn/no-inline-styles -- a trailing mote starts a beat behind the bolt.
              style={{ "--fx-trail": times("--dur-instant", n) } as CSSProperties}
            >
              <circle r={cell * (0.08 + 0.05 * (3 - n))} className={HALO[tone]} />
            </g>
          ))}
          <g className="animate-fx-travel">
            <circle r={cell * 0.42} className={HALO[tone]} />
            <circle r={cell * 0.22} className={FILL[tone]} />
            <circle r={cell * 0.1} className="fill-heading" />
          </g>
        </g>
      )}
      {melee && (
        <path
          data-slot="fx-swing"
          // An arc across the target's near side, facing the attacker.
          d={swing(at, from, cell * (missed ? 0.75 : 0.55))}
          pathLength={1}
          strokeDasharray={1}
          strokeWidth={cell * (critical ? 0.12 : 0.08)}
          strokeLinecap="round"
          fill="none"
          className={cn("animate-fx-swing", STROKE[tone], missed && "opacity-60")}
        />
      )}
      <circle
        data-slot="fx-impact"
        cx={to.x}
        cy={to.y}
        r={cell * (missed ? 0.3 : critical ? 0.95 : 0.65)}
        strokeWidth={missed ? 0 : cell * 0.06}
        className={cn(
          "origin-center animate-fx-impact transform-fill",
          missed ? "fill-heading/25" : cn(HALO[tone], STROKE[tone]),
        )}
      />
    </svg>
  );
}

/** A 130° arc about `at`, facing `from`. */
const swing = (
  at: { readonly x: number; readonly y: number },
  from: { readonly x: number; readonly y: number },
  radius: number,
): string => {
  const facing = Math.atan2(from.y - at.y, from.x - at.x);
  const point = (turn: number) => ({
    x: at.x + Math.cos(facing + turn) * radius,
    y: at.y + Math.sin(facing + turn) * radius,
  });
  const start = point(-(65 * Math.PI) / 180);
  const end = point((65 * Math.PI) / 180);
  return `M ${String(start.x)} ${String(start.y)} A ${String(radius)} ${String(radius)} 0 0 1 ${String(end.x)} ${String(end.y)}`;
};

/**
 * One area, on a plane-sized layer: each square it covers flares in turn, a
 * beat of `--dur-instant` further for every square or so from its origin, so a
 * cone rolls out of the dragon and a fireball bursts outward. A sphere or a
 * cube that went off away from its creature is lobbed there first, and its
 * burst waits for the orb.
 */
function BlastEffect({
  board,
  blast,
  onEnd,
}: {
  readonly board: DrawnBoard;
  readonly blast: BlastPlay;
  readonly onEnd: () => void;
}) {
  const plane = battleMapPlane(board, board.image);
  const { area } = blast;
  const centre = (square: { readonly column: number; readonly row: number }) => {
    const rect = cellRect(board, square);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, cell: rect.width };
  };
  const origin = centre(area.origin);
  const cell = origin.cell;
  const squares = areaSquares(board, {
    shape: area.shape,
    feet: area.feet,
    feetPerCell: board.feetPerCell,
    origin: area.origin,
    toward: areaToward(area),
  });
  const point = area.shape === "sphere" || area.shape === "cube";
  const from = blast.from === undefined ? undefined : centre(blast.from);
  const lobbed =
    point &&
    blast.from !== undefined &&
    (blast.from.column !== area.origin.column || blast.from.row !== area.origin.row);
  const dx = from === undefined ? 0 : origin.x - from.x;
  const dy = from === undefined ? 0 : origin.y - from.y;
  const flightSquares = Math.hypot(dx, dy) / cell;
  const flight = times("--dur-fast", Math.min(7, Math.max(3, flightSquares * 0.6)));
  const tone = TONE[blast.damageType ?? "force"];
  const distance = (square: { readonly column: number; readonly row: number }) =>
    Math.hypot(square.column - area.origin.column, square.row - area.origin.row);
  const farthest = Math.max(0, ...squares.map(distance));
  const waitFor = (square: { readonly column: number; readonly row: number }) => {
    const wave = times("--dur-instant", distance(square) * 0.6);
    return lobbed ? `calc(${flight} + ${wave})` : wave;
  };
  const radius = (area.feet / board.feetPerCell) * cell;
  const geometry = {
    "--fx-dx": `${String(dx)}px`,
    "--fx-dy": `${String(dy)}px`,
    "--fx-arc": `${String(Math.min(cell * 2.5, flightSquares * cell * 0.4))}px`,
    "--fx-flight": flight,
    "--fx-after": lobbed ? flight : "0s",
  } as CSSProperties;

  const ended = (event: AnimationEvent) => {
    if (
      event.animationName === "tt-fx-flare" &&
      (event.target as Element).getAttribute("data-last") === "true"
    ) {
      onEnd();
    }
  };

  let lastMarked = false;
  return (
    <svg
      data-effect="blast"
      data-shape={area.shape}
      data-lobbed={lobbed ? "true" : undefined}
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
      // eslint-disable-next-line shadcn/no-inline-styles -- the area's own geometry and timing, as custom properties its keyframes read.
      style={geometry}
      onAnimationEnd={ended}
    >
      {lobbed && from !== undefined && (
        <g data-slot="fx-orb" transform={`translate(${String(from.x)} ${String(from.y)})`}>
          <g className="animate-fx-travel">
            <ellipse rx={cell * 0.3} ry={cell * 0.08} className="fill-scrim opacity-70" />
          </g>
          <g className="animate-fx-travel">
            <g className="animate-fx-arc">
              <circle r={cell * 0.5} className={HALO[tone]} />
              <circle r={cell * 0.28} className={FILL[tone]} />
              <circle r={cell * 0.12} className="fill-heading" />
            </g>
          </g>
        </g>
      )}
      {squares.map((square) => {
        const rect = cellRect(board, square);
        const last = !lastMarked && distance(square) === farthest;
        if (last) lastMarked = true;
        return (
          <rect
            key={`${String(square.column)}:${String(square.row)}`}
            data-slot="fx-flare"
            data-last={last ? "true" : undefined}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            className={cn("origin-center animate-fx-flare transform-fill", FILL[tone])}
            // eslint-disable-next-line shadcn/no-inline-styles -- each square flares as the wave reaches it.
            style={{ "--fx-wait": waitFor(square) } as CSSProperties}
          />
        );
      })}
      {area.shape === "line" && "toward" in area && (
        <Beam from={origin} toward={centre(area.toward)} length={radius} cell={cell} tone={tone} />
      )}
      {point && (
        <>
          <circle
            data-slot="fx-core"
            cx={origin.x}
            cy={origin.y}
            r={radius * 0.6}
            className={cn("origin-center animate-fx-impact transform-fill", HALO[tone])}
          />
          <circle
            data-slot="fx-ring"
            cx={origin.x}
            cy={origin.y}
            r={radius + cell * 0.5}
            fill="none"
            strokeWidth={cell * 0.12}
            className={cn("origin-center animate-fx-impact transform-fill", STROKE[tone])}
          />
        </>
      )}
    </svg>
  );
}

/** A line's bolt, drawn along its whole length from its origin and fading: a glow under a white-hot core. */
function Beam({
  from,
  toward,
  length,
  cell,
  tone,
}: {
  readonly from: { readonly x: number; readonly y: number };
  readonly toward: { readonly x: number; readonly y: number };
  readonly length: number;
  readonly cell: number;
  readonly tone: Tone;
}) {
  const span = Math.hypot(toward.x - from.x, toward.y - from.y) || 1;
  const end = {
    x: from.x + ((toward.x - from.x) / span) * length,
    y: from.y + ((toward.y - from.y) / span) * length,
  };
  const d = `M ${String(from.x)} ${String(from.y)} L ${String(end.x)} ${String(end.y)}`;
  return (
    <g data-slot="fx-beam">
      <path
        d={d}
        pathLength={1}
        strokeDasharray={1}
        strokeWidth={cell * 0.45}
        strokeOpacity={0.5}
        strokeLinecap="round"
        fill="none"
        className={cn("animate-fx-beam", STROKE[tone])}
      />
      <path
        d={d}
        pathLength={1}
        strokeDasharray={1}
        strokeWidth={cell * 0.12}
        strokeLinecap="round"
        fill="none"
        className="animate-fx-beam stroke-heading"
      />
    </g>
  );
}
