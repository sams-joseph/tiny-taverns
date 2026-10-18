import { battleMapPlane, cellRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { DrawnBoard } from "../BoardTools";
import { percentOf } from "../tokens";
import type { Playing } from "../useBoardEffects";
import { animates, choreo } from "./motion";
import { fling } from "./moves";
import { HEAL } from "./palette";
import { Embers } from "./parts";
import { embers as scatter, seeded } from "./shapes";
import type { BoardStage } from "./stage";

type Change = Extract<Playing, { kind: "hurt" | "heal" }>;

/** Up the square's 40-unit box by `units`. */
const rise = (units: number): string => `translateY(${String(-units)}px)`;

/** `−5`, `+4`, with a true minus. */
const said = (change: Change): string =>
  `${change.kind === "hurt" ? "−" : "+"}${String(change.amount)}`;

/**
 * A hit or a heal on a token, drawn in the square's own 40-unit box as the
 * token face is: it waits for any blow coming at that square to land
 * (`BoardStage.landing`), then a hit flashes the token white and pops its
 * number in blood with an ink outline, overshooting and floating off; a heal
 * rises in green motes with its number. A reader who does not know the hit
 * points gets the flash, or the motes, and no number.
 */
export function NumberFx({
  board,
  change,
  stage,
  seed,
  onEnd,
}: {
  readonly board: DrawnBoard;
  readonly change: Change;
  readonly stage: BoardStage;
  readonly seed: number;
  readonly onEnd: () => void;
}) {
  const plane = battleMapPlane(board, board.image);
  const hurt = change.kind === "hurt";
  const motes = useMemo(
    () => scatter({ x: 20, y: 26 }, hurt ? 0 : 8, 22, 1.6, seeded(seed), -Math.PI / 2, 1.2),
    [seed, hurt],
  );
  const root = useRef<HTMLDivElement>(null);
  const number = useRef<SVGTextElement>(null);
  const glow = useRef<SVGCircleElement>(null);
  const moteRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    if (!animates(root.current)) return;
    const c = choreo();
    void (async () => {
      await stage.landing(change.at);
      if (!c.live()) return;
      const b = stage.beats();
      if (b.effect === 0) {
        onEnd();
        return;
      }
      stage.recoil([change.id], { x: 0, y: 0 }, 0);
      void c.play(
        glow.current,
        [
          { transform: "scale(0.6)", opacity: 0.8 },
          { transform: "scale(1.3)", opacity: 0 },
        ],
        { duration: b.slower, easing: "ease-out" },
      );
      if (!hurt) void fling(c, moteRef.current, motes, b.effect);
      await c.play(
        number.current,
        [
          { transform: `${rise(-4)} scale(0.2)`, opacity: 0 },
          { transform: `${rise(6)} scale(1.4)`, opacity: 1, offset: 0.16 },
          { transform: `${rise(9)} scale(1)`, opacity: 1, offset: 0.32 },
          { transform: `${rise(13)} scale(1)`, opacity: 1, offset: 0.8 },
          { transform: `${rise(11)} scale(0.9)`, opacity: 0 },
        ],
        { duration: b.effect * 1.2, easing: b.out },
      );
      onEnd();
    })();
    return () => c.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one effect, played once from its mount.

  return (
    <div
      ref={root}
      data-effect={change.kind}
      data-token={change.id}
      className="absolute"
      // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
      style={percentOf(cellRect(board, change.at), plane)}
    >
      <svg viewBox="0 0 40 40" className="size-full overflow-visible">
        <circle
          ref={glow}
          cx={20}
          cy={20}
          r={17}
          opacity={0}
          className={cn(
            "origin-center mix-blend-screen transform-fill",
            hurt ? "fill-fx-blood/50" : HEAL.glowFill,
          )}
        />
        {!hurt && <Embers embers={motes} family={HEAL} groupRef={moteRef} />}
        {change.amount !== undefined && (
          <text
            ref={number}
            data-slot="effect-amount"
            x={20}
            y={2}
            textAnchor="middle"
            fontSize={16}
            strokeWidth={3}
            paintOrder="stroke"
            strokeLinejoin="round"
            className={cn(
              "origin-center font-display font-bold italic transform-fill stroke-fx-ink",
              hurt ? "fill-fx-blood" : HEAL.bodyFill,
            )}
          >
            {said(change)}
          </text>
        )}
      </svg>
    </div>
  );
}
