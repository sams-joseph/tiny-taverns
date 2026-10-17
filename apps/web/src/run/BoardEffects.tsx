import type { DrawnBoard } from "./BoardTools";
import { BlastFx } from "./fx/Blast";
import { NumberFx } from "./fx/Number";
import type { BoardStage } from "./fx/stage";
import { StrikeFx } from "./fx/Strike";
import type { Playing } from "./useBoardEffects";

/**
 * The board's combat effects, over its tokens, on the DM's board and a
 * player's alike (`TokenLayer`, `run/RunTokens.tsx`), in the inked, firelit
 * direction the maintainer chose (2026-10-17): every shape outlined in ink
 * over a saturated body and a white-hot core, and every blow given weight —
 * anticipation, a hit-stop, shake, knock-back and an overshooting number.
 *
 * What plays is what this reader may already see: a hit or a heal from the
 * tokens it re-reads (`effectsBetween`), and the night's attacks and areas
 * (`actsOf`) — an attack from the attacker's square to the target's
 * (`fx/Strike.tsx`), an area over its own squares (`fx/Blast.tsx`), a number
 * on a token (`fx/Number.tsx`). Each is its own element, choreographed from
 * its mount by the Web Animations API (`fx/motion.ts`) and removed when it
 * ends; under reduced motion every beat is zero and it ends at once. Attacks
 * and areas are drawn first, so a number knows a blow is coming at its square
 * and waits for it to land. Every colour is the effects palette
 * (`local-tokens.css`), a prototype until the designers' delivery answers it.
 */
export function BoardEffects({
  board,
  playing,
  stage,
  ended,
}: {
  readonly board: DrawnBoard;
  readonly playing: ReadonlyArray<Playing>;
  readonly stage: BoardStage;
  readonly ended: (key: number) => void;
}) {
  if (playing.length === 0) return null;
  const blows = playing.filter((effect) => effect.kind === "strike" || effect.kind === "blast");
  const changes = playing.filter((effect) => effect.kind === "hurt" || effect.kind === "heal");
  return (
    <div
      data-slot="board-effects"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-lifted"
    >
      {blows.map((effect) =>
        effect.kind === "blast" ? (
          <BlastFx
            key={effect.key}
            board={board}
            blast={effect}
            stage={stage}
            seed={effect.key}
            onEnd={() => ended(effect.key)}
          />
        ) : effect.kind === "strike" ? (
          <StrikeFx
            key={effect.key}
            board={board}
            strike={effect}
            stage={stage}
            seed={effect.key}
            onEnd={() => ended(effect.key)}
          />
        ) : null,
      )}
      {changes.map((effect) =>
        effect.kind === "hurt" || effect.kind === "heal" ? (
          <NumberFx
            key={effect.key}
            board={board}
            change={effect}
            stage={stage}
            seed={effect.key}
            onEnd={() => ended(effect.key)}
          />
        ) : null,
      )}
    </div>
  );
}
