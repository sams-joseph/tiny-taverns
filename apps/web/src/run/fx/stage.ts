import type { BoardSquare, CombatantId } from "@taverns/api";
import { animates, beatsAt, type Beats } from "./motion";

/**
 * What an effect may do to the board it plays on, beyond its own layer
 * (`TokenLayer`, `run/RunTokens.tsx`, makes one per board):
 *
 * - **shake** the whole map box, map and tokens together;
 * - **hit-stop**: freeze every finite animation on the board for a beat, the
 *   moment a blow lands, then let it all run on;
 * - **recoil** a token: knock its disc back from the blow and flash it white;
 * - hold a damage number until the blow that caused it lands: a strike says
 *   it is coming at a square (`expect`) and when it lands (`landed`), and a
 *   number on that square waits for it (`landing`). A number with nothing
 *   coming plays at once.
 *
 * Every one does nothing in a browser that animates nothing, and every
 * duration is a beat of the theme, so all of it is still under reduced motion.
 */
export interface BoardStage {
  readonly beats: () => Beats;
  readonly shake: (strength: number, duration: number) => void;
  readonly hitStop: (duration: number) => Promise<void>;
  /** `flash: false` for an attacker drawing back, which no blow has touched. */
  readonly recoil: (
    tokens: ReadonlyArray<CombatantId>,
    away: { readonly x: number; readonly y: number },
    strength: number,
    flash?: boolean,
  ) => void;
  /** Who stands on these squares, and where, for an area's knock-back. */
  readonly standing: (
    squares: ReadonlyArray<BoardSquare>,
  ) => ReadonlyArray<{ readonly id: CombatantId; readonly square: BoardSquare }>;
  readonly expect: (at: BoardSquare) => void;
  readonly landed: (at: BoardSquare) => void;
  readonly landing: (at: BoardSquare) => Promise<void>;
}

const keyOf = (at: BoardSquare): string => `${String(at.column)}:${String(at.row)}`;

export const boardStage = ({
  box,
  standing,
}: {
  /** The board's box (`[data-slot=board]`), when it is drawn. */
  readonly box: () => Element | null;
  readonly standing: BoardStage["standing"];
}): BoardStage => {
  const coming = new Map<string, { count: number; waiting: Array<() => void> }>();
  const beats = () => {
    const at = box();
    return beatsAt(at ?? document.documentElement);
  };
  return {
    beats,
    shake: (strength, duration) => {
      const at = box();
      if (!animates(at) || duration <= 0) return;
      const frames: Array<Keyframe> = [];
      for (let i = 0; i < 7; i++) {
        const fade = 1 - i / 7;
        const x = (i % 2 === 0 ? 1 : -1) * strength * fade;
        const y = ((i * 7) % 3) - 1;
        frames.push({ translate: `${String(x)}px ${String(y * strength * fade)}px` });
      }
      frames.push({ translate: "0 0" });
      at.animate(frames, { duration, easing: "linear" });
    },
    hitStop: async (duration) => {
      const at = box();
      if (!animates(at) || duration <= 0) return;
      const frozen = at
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
        );
      for (const animation of frozen) animation.pause();
      await new Promise((resolve) => setTimeout(resolve, duration));
      for (const animation of frozen) if (animation.playState === "paused") animation.play();
    },
    recoil: (tokens, away, strength, flash = true) => {
      const at = box();
      if (at === null) return;
      const { fast, slow, overshoot } = beatsAt(at);
      for (const id of tokens) {
        for (const disc of at.querySelectorAll(`[data-token="${id}"] [data-slot=token-recoil]`)) {
          if (!animates(disc)) continue;
          disc.animate(
            [
              { transform: "none" },
              {
                transform: `translate(${String(away.x * strength)}px, ${String(away.y * strength)}px) scale(1.08)`,
                offset: 0.25,
              },
              { transform: "none" },
            ],
            { duration: slow + fast, easing: overshoot },
          );
        }
        if (!flash) continue;
        for (const white of at.querySelectorAll(`[data-token="${id}"] [data-slot=token-flash]`)) {
          if (!animates(white)) continue;
          white.animate([{ opacity: 0.95 }, { opacity: 0 }], {
            duration: slow,
            easing: "ease-out",
          });
        }
      }
    },
    standing,
    expect: (square) => {
      const entry = coming.get(keyOf(square)) ?? { count: 0, waiting: [] };
      entry.count += 1;
      coming.set(keyOf(square), entry);
    },
    landed: (square) => {
      const entry = coming.get(keyOf(square));
      if (entry === undefined) return;
      entry.count -= 1;
      if (entry.count > 0) return;
      coming.delete(keyOf(square));
      for (const resolve of entry.waiting) resolve();
    },
    landing: (square) => {
      const entry = coming.get(keyOf(square));
      if (entry === undefined) return Promise.resolve();
      return new Promise((resolve) => entry.waiting.push(resolve));
    },
  };
};
