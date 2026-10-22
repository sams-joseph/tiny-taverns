import { areaSquares, areaToward, boardPlane, cellRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { DrawnBoard } from "../BoardTools";
import type { BlastPlay } from "../useBoardEffects";
import { animates, choreo } from "./motion";
import { bloom, flicker, fling } from "./moves";
import { crackles, familyOf } from "./palette";
import { Crackle, Embers, GlowFilter, ImpactFrame, Petals } from "./parts";
import { embers as scatter, seeded } from "./shapes";
import type { BoardStage } from "./stage";

/**
 * One area, over the template's own squares (`areaSquares`, the board's one
 * geometry):
 *
 * - a **sphere or a cube** that went off away from its creature is lobbed
 *   there first, an orb of flame petals arcing over its shadow; then it
 *   bursts: the impact frame, a hit-stop, a heavy shake, an inked shockwave,
 *   petals and embers thrown out, the squares flaring outward and a scorch
 *   left on the ground;
 * - a **cone** fans flame petals out from its creature across its angle;
 * - a **line** cracks along its length as a jagged bolt for lightning or
 *   thunder, and draws as an inked beam for anything else.
 *
 * Whoever stands in it is knocked back from its origin, and a damage number on
 * any of its squares waits for it to land.
 */
export function BlastFx({
  board,
  blast,
  stage,
  seed,
  onEnd,
}: {
  readonly board: DrawnBoard;
  readonly blast: BlastPlay;
  readonly stage: BoardStage;
  readonly seed: number;
  readonly onEnd: () => void;
}) {
  const plane = boardPlane(board);
  const { area } = blast;
  const centre = (square: { readonly column: number; readonly row: number }) => {
    const rect = cellRect(square);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, cell: rect.width };
  };
  const origin = centre(area.origin);
  const cell = origin.cell;
  const ink = cell * 0.05;
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
  const radius = (area.feet / board.feetPerCell) * cell;
  const aim = centre(areaToward(area));
  const heading = Math.atan2(aim.y - origin.y, aim.x - origin.x);
  const end = {
    x: origin.x + Math.cos(heading) * radius,
    y: origin.y + Math.sin(heading) * radius,
  };
  const bolt = area.shape === "line" && crackles(blast.damageType);
  const family = familyOf(blast.damageType, "force");
  const glow = `fx-glow-${String(seed)}`;
  const distance = (square: { readonly column: number; readonly row: number }) =>
    Math.hypot(square.column - area.origin.column, square.row - area.origin.row);
  const fx = useMemo(() => {
    const random = seeded(seed);
    return {
      random,
      embers: point
        ? scatter(origin, 30, radius * 1.1, cell * 0.08, random)
        : scatter(
            origin,
            22,
            radius,
            cell * 0.07,
            random,
            heading,
            area.shape === "cone" ? 0.9 : 0.25,
          ),
    };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps -- one effect's shapes, fixed for its life.

  const root = useRef<SVGSVGElement>(null);
  const travel = useRef<SVGGElement>(null);
  const lift = useRef<SVGGElement>(null);
  const shadow = useRef<SVGGElement>(null);
  const spin = useRef<SVGGElement>(null);
  const flares = useRef<SVGGElement>(null);
  const petals = useRef<SVGGElement>(null);
  const ring = useRef<SVGGElement>(null);
  const core = useRef<SVGCircleElement>(null);
  const scorch = useRef<SVGGElement>(null);
  const crackle = useRef<SVGGElement>(null);
  const beam = useRef<SVGGElement>(null);
  const embersRef = useRef<SVGGElement>(null);
  const frame = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    if (!animates(root.current)) return;
    const c = choreo();
    for (const square of squares) stage.expect(square);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      for (const square of squares) stage.landed(square);
    };
    const b = stage.beats();
    void (async () => {
      if (b.effect === 0) {
        land();
        onEnd();
        return;
      }
      // The lob: an orb of petals over its shadow.
      if (lobbed && from !== undefined) {
        const squaresFlown = Math.hypot(dx, dy) / cell;
        const flight = Math.min(7, Math.max(3, squaresFlown * 0.6)) * b.fast;
        const arc = Math.min(cell * 2.5, squaresFlown * cell * 0.45);
        const moving = [
          { transform: "translate(0, 0)" },
          { transform: `translate(${String(dx)}px, ${String(dy)}px)` },
        ];
        void c.play(shadow.current, moving, { duration: flight, easing: "linear" });
        void c.play(
          spin.current,
          [{ transform: "rotate(0deg) scale(0.8)" }, { transform: "rotate(540deg) scale(1.2)" }],
          { duration: flight, easing: "linear" },
        );
        void c.play(
          lift.current,
          [
            { transform: "translateY(0)", easing: b.out },
            { transform: `translateY(${String(-arc)}px)`, offset: 0.5, easing: "ease-in" },
            { transform: "translateY(0)" },
          ],
          { duration: flight },
        );
        await c.play(
          travel.current,
          [
            { ...moving[0], opacity: 1 },
            { ...moving[1], opacity: 1 },
          ],
          { duration: flight, easing: "linear" },
        );
        void c.play(travel.current, [{ opacity: 1 }, { opacity: 0 }], { duration: b.instant });
      }
      // The burst.
      land();
      const caught = stage.standing(squares);
      const heavy = point;
      stage.shake(heavy ? 7 : 4, heavy ? b.slower + b.fast : b.slower);
      if (heavy)
        void c.play(frame.current, [{ opacity: 0.4 }, { opacity: 0 }], {
          duration: b.fast,
          easing: "ease-out",
        });
      const flaring = Promise.all(
        [...(flares.current?.children ?? [])].map((rect) => {
          const d = Number(rect.getAttribute("data-distance") ?? "0");
          return c.play(rect, [{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }], {
            duration: b.effect,
            delay: d * b.instant * 0.6,
            easing: "ease-out",
          });
        }),
      );
      if (point) {
        void c.play(
          core.current,
          [
            { transform: "scale(0.2)", opacity: 1 },
            { transform: "scale(1)", opacity: 0.9, offset: 0.3 },
            { transform: "scale(1.05)", opacity: 0 },
          ],
          { duration: b.effect * 0.8, easing: "ease-out" },
        );
        void c.play(
          ring.current,
          [
            { transform: "scale(0.15)", opacity: 1 },
            { transform: "scale(1.1)", opacity: 0 },
          ],
          { duration: b.slower + b.fast, easing: b.out },
        );
        void bloom(c, petals.current, b.effect * 0.7, b.overshoot);
      } else if (area.shape === "cone") {
        void bloom(c, petals.current, b.effect * 0.8, b.overshoot, b.instant * 0.25);
      } else if (bolt) {
        void flicker(c, crackle.current, b.slower + b.fast);
      } else {
        void c.play(beam.current, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
          duration: b.effect,
        });
        for (const path of beam.current?.querySelectorAll("path") ?? []) {
          void c.play(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: b.slow,
            easing: b.out,
          });
        }
      }
      void c.play(
        scorch.current,
        [
          { opacity: 0 },
          { opacity: 0.35, offset: 0.1 },
          { opacity: 0.35, offset: 0.5 },
          { opacity: 0 },
        ],
        { duration: b.effect * 2 },
      );
      const thrown = fling(c, embersRef.current, fx.embers, b.effect);
      // Whoever it caught is thrown back from where it went off.
      for (const { id, square } of caught) {
        const there = centre(square);
        const off = Math.hypot(there.x - origin.x, there.y - origin.y);
        const away =
          off === 0
            ? { x: 0, y: 0 }
            : { x: (there.x - origin.x) / off, y: (there.y - origin.y) / off };
        stage.recoil([id], away, heavy ? 6 : 4);
      }
      await stage.hitStop(heavy ? b.instant * 1.25 : b.instant * 0.75);
      await Promise.all([flaring, thrown]);
      onEnd();
    })();
    return () => {
      c.stop();
      land();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one effect, played once from its mount.

  // A cone's petals fan across its angle: as wide as it is far, so 26.6° either side.
  const coneHalf = (Math.atan(0.5) * 180) / Math.PI;
  const headingDeg = (heading * 180) / Math.PI + 90;
  const farthest = Math.max(0, ...squares.map(distance));
  const lineD = `M ${String(origin.x)} ${String(origin.y)} L ${String(end.x)} ${String(end.y)}`;

  return (
    <svg
      ref={root}
      data-effect="blast"
      data-shape={area.shape}
      data-lobbed={lobbed ? "true" : undefined}
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
    >
      <GlowFilter id={glow} blur={cell * 0.3} />
      {/* The scorch it leaves, under everything else it draws. */}
      <g ref={scorch} data-slot="fx-scorch" opacity={0}>
        {point ? (
          <circle
            cx={origin.x}
            cy={origin.y}
            r={radius * 0.75}
            filter={`url(#${glow})`}
            className="fill-fx-ink"
          />
        ) : (
          <path
            d={lineD}
            strokeWidth={cell * 0.6}
            strokeLinecap="round"
            filter={`url(#${glow})`}
            fill="none"
            className="stroke-fx-ink"
          />
        )}
      </g>
      <g ref={flares} data-slot="fx-flares" className="mix-blend-screen">
        {squares.map((square) => {
          const rect = cellRect(square);
          return (
            <rect
              key={`${String(square.column)}:${String(square.row)}`}
              data-slot="fx-flare"
              data-distance={distance(square)}
              data-last={distance(square) === farthest ? "true" : undefined}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              opacity={0}
              className={family.bodyFill}
            />
          );
        })}
      </g>
      {point && (
        <>
          <circle
            ref={core}
            data-slot="fx-core"
            cx={origin.x}
            cy={origin.y}
            r={radius}
            opacity={0}
            filter={`url(#${glow})`}
            className={cn("origin-center mix-blend-screen transform-fill", family.glowFill)}
          />
          <g transform={`translate(${String(origin.x)} ${String(origin.y)})`}>
            <Petals
              count={12}
              length={radius * 0.85}
              width={radius * 0.22}
              ink={ink * 1.2}
              family={family}
              groupRef={petals}
              hidden
            />
            <g ref={ring} data-slot="fx-ring" opacity={0}>
              <circle
                r={radius + cell * 0.25}
                fill="none"
                strokeWidth={ink * 2.2}
                className="stroke-fx-ink"
              />
              <circle r={radius} fill="none" strokeWidth={ink * 3} className={family.bodyStroke} />
            </g>
          </g>
        </>
      )}
      {area.shape === "cone" && (
        <g
          transform={`translate(${String(origin.x)} ${String(origin.y)}) rotate(${String(headingDeg)})`}
        >
          {/* A spray, not a blade: a short rank and a long one of thin tongues. */}
          <g ref={petals}>
            <Petals
              count={5}
              length={radius * 0.55}
              width={radius * 0.12}
              ink={ink}
              family={family}
              hidden
              spreadFrom={-coneHalf * 0.8}
              spreadTo={coneHalf * 0.8}
            />
            <Petals
              count={9}
              length={radius}
              width={radius * 0.08}
              ink={ink}
              family={family}
              hidden
              spreadFrom={-coneHalf}
              spreadTo={coneHalf}
            />
          </g>
        </g>
      )}
      {bolt && (
        <Crackle
          a={origin}
          b={end}
          cell={cell * 1.4}
          family={family}
          random={fx.random}
          glow={glow}
          groupRef={crackle}
        />
      )}
      {area.shape === "line" && !bolt && (
        <g ref={beam} data-slot="fx-beam" opacity={0}>
          <path
            d={lineD}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * 0.5}
            strokeLinecap="round"
            fill="none"
            filter={`url(#${glow})`}
            className={cn("mix-blend-screen", family.glowStroke)}
          />
          <path
            d={lineD}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * 0.32}
            strokeLinecap="round"
            fill="none"
            className="stroke-fx-ink"
          />
          <path
            d={lineD}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * 0.2}
            strokeLinecap="round"
            fill="none"
            className={family.bodyStroke}
          />
          <path
            d={lineD}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * 0.07}
            strokeLinecap="round"
            fill="none"
            className={family.coreStroke}
          />
        </g>
      )}
      {lobbed && from !== undefined && (
        <g data-slot="fx-orb" transform={`translate(${String(from.x)} ${String(from.y)})`}>
          <g ref={shadow}>
            <ellipse rx={cell * 0.3} ry={cell * 0.09} className="fill-fx-ink opacity-60" />
          </g>
          <g ref={travel} opacity={0}>
            <g ref={lift}>
              <circle
                r={cell * 0.6}
                filter={`url(#${glow})`}
                className={cn("mix-blend-screen", family.glowFill)}
              />
              <g ref={spin}>
                <Petals
                  count={6}
                  length={cell * 0.48}
                  width={cell * 0.18}
                  ink={ink}
                  family={family}
                />
              </g>
              <circle
                r={cell * 0.18}
                strokeWidth={ink}
                className={cn("stroke-fx-ink", family.coreFill)}
              />
            </g>
          </g>
        </g>
      )}
      <Embers embers={fx.embers} family={family} groupRef={embersRef} />
      <ImpactFrame width={plane.width} height={plane.height} frameRef={frame} />
    </svg>
  );
}
