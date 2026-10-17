import { cn } from "@taverns/ui";
import type { Ref } from "react";
import type { Family } from "./palette";
import { type Ember, type Point, jagged, petal, spark } from "./shapes";

/**
 * The pieces every effect is drawn from, in the board's plane: each shape
 * carries an ink outline, a saturated body and a white-hot core, and the glow
 * under it is screen-blended so it lights the map rather than covering it.
 */

/** A soft-glow filter, `id` unique to its effect, `blur` in plane units. */
export function GlowFilter({ id, blur }: { readonly id: string; readonly blur: number }) {
  return (
    <defs>
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={blur} />
      </filter>
    </defs>
  );
}

/** The embers an effect flings, drawn where they start and hidden until it flings them. */
export function Embers({
  embers,
  family,
  groupRef,
}: {
  readonly embers: ReadonlyArray<Ember>;
  readonly family: Family;
  readonly groupRef: Ref<SVGGElement>;
}) {
  const shades = [family.glowFill, family.bodyFill, family.coreFill];
  return (
    <g ref={groupRef} data-slot="fx-embers" className="mix-blend-screen">
      {embers.map((ember, i) => (
        <circle
          key={i}
          cx={ember.x}
          cy={ember.y}
          r={ember.r}
          opacity={0}
          className={shades[ember.shade]}
        />
      ))}
    </g>
  );
}

/** A ring of flame petals about the origin, `count` of them, each `length` long. */
export function Petals({
  count,
  length,
  width,
  ink,
  family,
  groupRef,
  hidden = false,
  spreadFrom = 0,
  spreadTo = 360,
}: {
  readonly count: number;
  readonly length: number;
  readonly width: number;
  readonly ink: number;
  readonly family: Family;
  readonly groupRef?: Ref<SVGGElement>;
  /** Drawn unseen until `bloom` grows them. */
  readonly hidden?: boolean;
  /** Degrees, clockwise from up: a cone's petals fan across its angle only. */
  readonly spreadFrom?: number;
  readonly spreadTo?: number;
}) {
  const full = spreadTo - spreadFrom >= 360;
  const step = (spreadTo - spreadFrom) / (full ? count : Math.max(1, count - 1));
  return (
    <g ref={groupRef} data-slot="fx-petals">
      {Array.from({ length: count }, (_, i) => (
        <g key={i} transform={`rotate(${String(spreadFrom + i * step)})`}>
          <path
            d={petal(length, width)}
            opacity={hidden ? 0 : undefined}
            strokeWidth={ink}
            strokeLinejoin="round"
            className={cn(
              "stroke-fx-ink",
              i % 3 === 0 ? family.coreFill : i % 2 === 0 ? family.bodyFill : family.glowFill,
            )}
          />
        </g>
      ))}
    </g>
  );
}

/** A four-pointed spark at `at`, hidden until it strikes. */
export function Spark({
  at,
  size,
  ink,
  family,
  sparkRef,
}: {
  readonly at: Point;
  readonly size: number;
  readonly ink: number;
  readonly family: Family;
  readonly sparkRef: Ref<SVGGElement>;
}) {
  return (
    <g transform={`translate(${String(at.x)} ${String(at.y)})`}>
      <g ref={sparkRef} data-slot="fx-spark" opacity={0}>
        <path
          d={spark(size)}
          strokeWidth={ink}
          strokeLinejoin="round"
          className={cn("stroke-fx-ink", family.coreFill)}
        />
      </g>
    </g>
  );
}

/** A jagged bolt from `a` to `b`, three flickers of it, each a glow, an ink line, a body and a core. */
export function Crackle({
  a,
  b,
  cell,
  family,
  random,
  glow,
  groupRef,
}: {
  readonly a: Point;
  readonly b: Point;
  readonly cell: number;
  readonly family: Family;
  readonly random: () => number;
  readonly glow: string;
  readonly groupRef: Ref<SVGGElement>;
}) {
  const segments = Math.max(6, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.5)));
  const flickers = [0, 1, 2].map(() => jagged(a, b, segments, cell * 0.25, random));
  return (
    <g ref={groupRef} data-slot="fx-crackle">
      {flickers.map((points, i) => (
        <g key={i} opacity={0}>
          <polyline
            points={points}
            fill="none"
            strokeWidth={cell * 0.35}
            strokeLinejoin="round"
            filter={`url(#${glow})`}
            className={cn("mix-blend-screen", family.glowStroke)}
          />
          <polyline
            points={points}
            fill="none"
            strokeWidth={cell * 0.17}
            strokeLinejoin="round"
            className="stroke-fx-ink"
          />
          <polyline
            points={points}
            fill="none"
            strokeWidth={cell * 0.1}
            strokeLinejoin="round"
            className={family.bodyStroke}
          />
          <polyline
            points={points}
            fill="none"
            strokeWidth={cell * 0.035}
            strokeLinejoin="round"
            className={family.coreStroke}
          />
        </g>
      ))}
    </g>
  );
}

/** The whole board flashing white for an instant: the impact frame. */
export function ImpactFrame({
  width,
  height,
  frameRef,
}: {
  readonly width: number;
  readonly height: number;
  readonly frameRef: Ref<SVGRectElement>;
}) {
  return (
    <rect
      ref={frameRef}
      data-slot="fx-impact-frame"
      width={width}
      height={height}
      opacity={0}
      className="fill-fx-radiant-core mix-blend-screen"
    />
  );
}
