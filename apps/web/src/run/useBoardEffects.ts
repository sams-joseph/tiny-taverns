import type { BoardSquare, CombatantId } from "@taverns/api";
import { useEffect, useRef, useState } from "react";
import { type BoardEffect, type EffectToken, type Strike, effectsBetween } from "./effects";

/** A strike as the board plays it: from the attacker's square to the target's. */
export interface StrikePlay extends Omit<Strike, "key" | "from" | "to"> {
  readonly kind: "strike";
  readonly from: BoardSquare;
  readonly to: BoardSquare;
}

/** A playing effect, with the key that tells two on one token apart. */
export type Playing = (Extract<BoardEffect, { kind: "hurt" | "heal" }> | StrikePlay) & {
  readonly key: number;
};

/** More than this at once and the oldest go, so a board that never sees `animationend` stays bounded. */
const MOST = 24;

/**
 * What the board plays as `tokens` change: the bursts, and each token's hop;
 * and each of `strikes` that arrives after the board first drew them, from
 * where its attacker stands to where its target does. A reload or a
 * reconnect replays none of the night's attacks; one whose attacker or target
 * is off the board plays nothing.
 *
 * `settled` names the token the board itself just put down (a drop holds its
 * square until the server answers), whose move arriving from the server is no
 * news to anyone watching it and so does not hop.
 */
export function useBoardEffects(
  tokens: ReadonlyArray<EffectToken>,
  settled: (id: CombatantId, to: BoardSquare) => boolean,
  strikes: ReadonlyArray<Strike> = [],
): {
  readonly playing: ReadonlyArray<Playing>;
  readonly hopOf: (id: CombatantId) => "a" | "b" | undefined;
  readonly ended: (key: number) => void;
} {
  const last = useRef<ReadonlyArray<EffectToken> | undefined>(undefined);
  const next = useRef(0);
  const [playing, setPlaying] = useState<ReadonlyArray<Playing>>([]);
  const [hops, setHops] = useState<ReadonlyMap<CombatantId, number>>(new Map());
  const settledRef = useRef(settled);
  settledRef.current = settled;
  const squares = useRef(new Map<CombatantId, BoardSquare>());
  squares.current = new Map(tokens.map((token) => [token.id, token.square]));
  const seen = useRef<Set<string> | undefined>(undefined);

  const strikesRead = JSON.stringify(strikes);
  useEffect(() => {
    const now = JSON.parse(strikesRead) as ReadonlyArray<Strike>;
    if (seen.current === undefined) {
      seen.current = new Set(now.map((strike) => strike.key));
      return;
    }
    const fresh = now.filter((strike) => !seen.current!.has(strike.key));
    for (const strike of fresh) seen.current.add(strike.key);
    const plays = fresh.flatMap((strike): ReadonlyArray<Playing> => {
      const from = squares.current.get(strike.from);
      const to = squares.current.get(strike.to);
      if (from === undefined || to === undefined) return [];
      const { key: _key, ...what } = strike;
      return [{ ...what, kind: "strike", from, to, key: next.current++ }];
    });
    if (plays.length > 0) setPlaying((current) => [...current, ...plays].slice(-MOST));
  }, [strikesRead]);

  // One string for what the effects read, so a render that changed nothing they read plays nothing.
  const reading = JSON.stringify(tokens);
  useEffect(() => {
    const now = JSON.parse(reading) as ReadonlyArray<EffectToken>;
    const before = last.current;
    last.current = now;
    if (before === undefined) return;
    const effects = effectsBetween(before, now);
    const bursts = effects.flatMap((effect): ReadonlyArray<Playing> =>
      effect.kind === "moved" ? [] : [{ ...effect, key: next.current++ }],
    );
    const moved = effects.filter(
      (effect) => effect.kind === "moved" && !settledRef.current(effect.id, effect.to),
    );
    if (bursts.length > 0) setPlaying((current) => [...current, ...bursts].slice(-MOST));
    if (moved.length > 0) {
      setHops((current) => {
        const counts = new Map(current);
        for (const { id } of moved) counts.set(id, (counts.get(id) ?? 0) + 1);
        return counts;
      });
    }
  }, [reading]);

  return {
    playing,
    hopOf: (id) => {
      const count = hops.get(id);
      return count === undefined ? undefined : count % 2 === 0 ? "a" : "b";
    },
    ended: (key) => setPlaying((current) => current.filter((effect) => effect.key !== key)),
  };
}
