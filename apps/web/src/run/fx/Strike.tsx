import { battleMapPlane, cellRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { DrawnBoard } from "../BoardTools";
import type { StrikePlay } from "../useBoardEffects";
import { animates, choreo } from "./motion";
import { bloom, flicker, fling } from "./moves";
import { crackles, familyOf } from "./palette";
import { Crackle, Embers, GlowFilter, ImpactFrame, Petals, Spark } from "./parts";
import { embers as scatter, seeded } from "./shapes";
import type { BoardStage } from "./stage";

/**
 * One attack, from the attacker's square to the target's, in three beats:
 *
 * 1. **Anticipation.** The attacker draws back; a spell gathers at its hands.
 * 2. **Flight.** A ranged weapon's arrow arcs over its own ground shadow; a
 *    spell's orb of flame petals flies straight, or, for lightning or thunder,
 *    a jagged bolt crackles across; a melee weapon swings an inked arc across
 *    the target's near side.
 * 3. **Impact.** A hit freezes the board for a beat (`hitStop`), shakes it,
 *    knocks the target back with a white flash, and throws a spark and embers;
 *    a critical adds the impact frame, the whole board flashing white. A miss
 *    flies on a square aside and lands in a puff with nothing more.
 *
 * It tells the stage a blow is coming at the target's square, so a damage
 * number there waits for it to land.
 */
export function StrikeFx({
  board,
  strike,
  stage,
  seed,
  onEnd,
}: {
  readonly board: DrawnBoard;
  readonly strike: StrikePlay;
  readonly stage: BoardStage;
  readonly seed: number;
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
  const ink = cell * 0.05;
  const missed = strike.outcome === "miss" || strike.outcome === "fumble";
  const critical = strike.outcome === "crit";
  const span = Math.hypot(at.x - from.x, at.y - from.y) || 1;
  const along = { x: (at.x - from.x) / span, y: (at.y - from.y) / span };
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
  const melee = strike.delivery === "melee-weapon";
  const spell = strike.delivery === "ranged-spell" || strike.delivery === "melee-spell";
  const bolt = spell && crackles(strike.damageType);
  const family = familyOf(strike.damageType, spell ? "force" : "piercing");
  const glow = `fx-glow-${String(seed)}`;
  const fx = useMemo(() => {
    const random = seeded(seed);
    return {
      random,
      sparks: scatter(
        to,
        critical ? 16 : 9,
        cell * (critical ? 1.6 : 1.1),
        cell * 0.06,
        random,
        Math.atan2(-along.y, -along.x),
        Math.PI * 1.1,
      ),
      gather: scatter(from, 8, cell * 0.9, cell * 0.05, random),
    };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps -- one effect's shapes, fixed for its life.

  const travel = useRef<SVGGElement>(null);
  const lift = useRef<SVGGElement>(null);
  const shadow = useRef<SVGGElement>(null);
  const petals = useRef<SVGGElement>(null);
  const burst = useRef<SVGGElement>(null);
  const charge = useRef<SVGGElement>(null);
  const gather = useRef<SVGGElement>(null);
  const swing = useRef<SVGPathElement>(null);
  const swingCore = useRef<SVGPathElement>(null);
  const crackle = useRef<SVGGElement>(null);
  const sparkRef = useRef<SVGGElement>(null);
  const embersRef = useRef<SVGGElement>(null);
  const puff = useRef<SVGCircleElement>(null);
  const frame = useRef<SVGRectElement>(null);
  const root = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (!animates(root.current)) return;
    const c = choreo();
    stage.expect(strike.to);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      stage.landed(strike.to);
    };
    const b = stage.beats();
    void (async () => {
      if (b.effect === 0) {
        land();
        onEnd();
        return;
      }
      // 1. Anticipation.
      stage.recoil([strike.fromId], { x: -along.x, y: -along.y }, 3, false);
      if (spell && !bolt) {
        void fling(
          c,
          gather.current,
          fx.gather.map((e) => ({ ...e, dx: -e.dx, dy: -e.dy })),
          b.slow,
        );
        await c.play(
          charge.current,
          [
            { transform: "scale(0.1)", opacity: 0.4 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: b.slow, easing: "ease-in" },
        );
        void c.play(charge.current, [{ opacity: 1 }, { opacity: 0 }], { duration: b.fast });
      } else {
        await c.play(root.current, [{ opacity: 1 }, { opacity: 1 }], { duration: b.fast });
      }
      // 2. Flight.
      const flight = Math.min(5, Math.max(2, squares * (spell ? 0.45 : 0.35))) * b.fast;
      if (melee) {
        void c.play(
          swingCore.current,
          [
            { strokeDashoffset: 1, opacity: 1 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.5 },
            { strokeDashoffset: 0, opacity: 0 },
          ],
          { duration: b.slower, easing: b.out },
        );
        await c
          .play(
            swing.current,
            [
              { strokeDashoffset: 1, opacity: 1 },
              { strokeDashoffset: 0, opacity: 1, offset: 0.4 },
              { strokeDashoffset: 0, opacity: 0 },
            ],
            { duration: b.slower, easing: b.out },
          )
          .then(() => undefined);
      } else if (bolt) {
        void flicker(c, crackle.current, b.slower);
        await c.play(root.current, [{ opacity: 1 }, { opacity: 1 }], { duration: b.instant });
      } else {
        const moving = [
          { transform: "translate(0, 0)" },
          { transform: `translate(${String(dx)}px, ${String(dy)}px)` },
        ];
        void c.play(shadow.current, moving, { duration: flight, easing: "linear" });
        void c.play(
          petals.current,
          [{ transform: "rotate(0deg)" }, { transform: "rotate(540deg)" }],
          { duration: flight, easing: "linear" },
        );
        if (!spell) {
          const arc = Math.min(cell * 1.2, squares * cell * 0.25);
          void c.play(
            lift.current,
            [
              { transform: "translateY(0)", easing: b.out },
              { transform: `translateY(${String(-arc)}px)`, offset: 0.5, easing: "ease-in" },
              { transform: "translateY(0)" },
            ],
            { duration: flight },
          );
        }
        await c.play(
          travel.current,
          [
            { ...moving[0], opacity: 1 },
            { ...moving[1], opacity: 1 },
          ],
          { duration: flight, easing: spell ? "ease-in" : "linear" },
        );
        void c.play(travel.current, [{ opacity: 1 }, { opacity: 0 }], { duration: b.instant });
      }
      // 3. Impact.
      if (missed) {
        land();
        await c.play(
          puff.current,
          [
            { transform: "scale(0.3)", opacity: 0.8 },
            { transform: "scale(1.2)", opacity: 0 },
          ],
          { duration: b.slow, easing: "ease-out" },
        );
        onEnd();
        return;
      }
      land();
      stage.shake(critical ? 6 : 3, critical ? b.slower : b.slow);
      stage.recoil([strike.toId], along, critical ? 6 : 4);
      if (critical)
        void c.play(frame.current, [{ opacity: 0.4 }, { opacity: 0 }], {
          duration: b.fast,
          easing: "ease-out",
        });
      void c.play(
        sparkRef.current,
        [
          { transform: "scale(0.2) rotate(0deg)", opacity: 1 },
          { transform: `scale(${critical ? "1.6" : "1"}) rotate(20deg)`, opacity: 1, offset: 0.3 },
          { transform: `scale(${critical ? "1.9" : "1.2"}) rotate(35deg)`, opacity: 0 },
        ],
        { duration: b.slow + b.fast, easing: "ease-out" },
      );
      if (spell && !bolt) void bloom(c, burst.current, b.slower, b.overshoot);
      const thrown = fling(c, embersRef.current, fx.sparks, b.slower + b.fast);
      await stage.hitStop(critical ? b.instant * 1.5 : b.instant * 0.75);
      await thrown;
      onEnd();
    })();
    return () => {
      c.stop();
      land();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one effect, played once from its mount.

  // The melee swing: a 130° arc across the target's near side, facing the attacker.
  const facing = Math.atan2(from.y - at.y, from.x - at.x);
  const radius = cell * (missed ? 0.75 : 0.55);
  const point = (turn: number) => ({
    x: at.x + Math.cos(facing + turn) * radius,
    y: at.y + Math.sin(facing + turn) * radius,
  });
  const start = point(-(65 * Math.PI) / 180);
  const end = point((65 * Math.PI) / 180);
  const swingPath = `M ${String(start.x)} ${String(start.y)} A ${String(radius)} ${String(radius)} 0 0 1 ${String(end.x)} ${String(end.y)}`;

  return (
    <svg
      ref={root}
      data-effect="strike"
      data-delivery={strike.delivery}
      data-outcome={strike.outcome ?? undefined}
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
    >
      <GlowFilter id={glow} blur={cell * 0.12} />
      {spell && !bolt && (
        <g transform={`translate(${String(from.x)} ${String(from.y)})`}>
          <g ref={charge} opacity={0}>
            <circle
              r={cell * 0.45}
              filter={`url(#${glow})`}
              className={cn("mix-blend-screen", family.glowFill)}
            />
            <circle r={cell * 0.16} className={family.coreFill} />
          </g>
        </g>
      )}
      {spell && !bolt && <Embers embers={fx.gather} family={family} groupRef={gather} />}
      {strike.delivery === "ranged-weapon" && (
        <g transform={`translate(${String(from.x)} ${String(from.y)})`}>
          {/* The shadow keeps to the ground while the arrow arcs over it. */}
          <g ref={shadow} data-slot="fx-shadow">
            <ellipse rx={cell * 0.22} ry={cell * 0.06} className="fill-fx-ink opacity-60" />
          </g>
          <g ref={travel} opacity={0}>
            <g ref={lift}>
              <g data-slot="fx-arrow" transform={`rotate(${String(angle)}) scale(1.5)`}>
                <line
                  x1={-cell * 1.1}
                  x2={-cell * 0.2}
                  strokeWidth={cell * 0.05}
                  strokeLinecap="round"
                  className={cn("mix-blend-screen opacity-70", family.coreStroke)}
                />
                <line
                  x1={-cell * 0.45}
                  x2={cell * 0.3}
                  strokeWidth={cell * 0.11}
                  strokeLinecap="round"
                  className="stroke-fx-ink"
                />
                <line
                  x1={-cell * 0.45}
                  x2={cell * 0.3}
                  strokeWidth={cell * 0.05}
                  strokeLinecap="round"
                  className={family.bodyStroke}
                />
                <polygon
                  points={`${String(cell * 0.5)},0 ${String(cell * 0.28)},${String(-cell * 0.1)} ${String(cell * 0.28)},${String(cell * 0.1)}`}
                  strokeWidth={ink * 0.8}
                  strokeLinejoin="round"
                  className={cn("stroke-fx-ink", family.coreFill)}
                />
              </g>
            </g>
          </g>
        </g>
      )}
      {spell && !bolt && (
        <g transform={`translate(${String(from.x)} ${String(from.y)})`}>
          <g ref={travel} data-slot="fx-bolt" opacity={0}>
            <circle
              r={cell * 0.5}
              filter={`url(#${glow})`}
              className={cn("mix-blend-screen", family.glowFill)}
            />
            <Petals
              count={6}
              length={cell * 0.6}
              width={cell * 0.22}
              ink={ink}
              family={family}
              groupRef={petals}
            />
            <circle
              r={cell * 0.16}
              strokeWidth={ink}
              className={cn("stroke-fx-ink", family.coreFill)}
            />
          </g>
        </g>
      )}
      {bolt && (
        <Crackle
          a={from}
          b={to}
          cell={cell}
          family={family}
          random={fx.random}
          glow={glow}
          groupRef={crackle}
        />
      )}
      {melee && (
        <g data-slot="fx-swing-arc">
          <path
            ref={swing}
            data-slot="fx-swing"
            d={swingPath}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * (critical ? 0.26 : 0.2)}
            strokeLinecap="round"
            fill="none"
            className="stroke-fx-ink"
          />
          <path
            ref={swingCore}
            d={swingPath}
            pathLength={1}
            strokeDasharray={1}
            strokeWidth={cell * (critical ? 0.14 : 0.1)}
            strokeLinecap="round"
            fill="none"
            className={family.coreStroke}
          />
        </g>
      )}
      <circle
        ref={puff}
        data-slot="fx-puff"
        cx={to.x}
        cy={to.y}
        r={cell * 0.3}
        opacity={0}
        className="origin-center fill-fx-ink/40 transform-fill"
      />
      {spell && !bolt && (
        <g transform={`translate(${String(to.x)} ${String(to.y)})`}>
          <Petals
            count={8}
            length={cell * 1.05}
            width={cell * 0.3}
            ink={ink}
            family={family}
            groupRef={burst}
            hidden
          />
        </g>
      )}
      <Spark at={to} size={cell * 0.8} ink={ink} family={family} sparkRef={sparkRef} />
      <Embers embers={fx.sparks} family={family} groupRef={embersRef} />
      <ImpactFrame width={plane.width} height={plane.height} frameRef={frame} />
    </svg>
  );
}
