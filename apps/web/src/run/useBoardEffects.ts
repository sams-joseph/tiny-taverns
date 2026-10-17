import type { BoardSquare, CombatantId } from "@taverns/api";
import { useEffect, useRef, useState } from "react";
import {
  type Act,
  type Blast,
  type BoardEffect,
  type EffectToken,
  type Strike,
  effectsBetween,
} from "./effects";

/** A strike as the board plays it: from the attacker's square to the target's. */
export interface StrikePlay extends Omit<Strike, "key" | "from" | "to"> {
  readonly fromId: CombatantId;
  readonly toId: CombatantId;
  readonly from: BoardSquare;
  readonly to: BoardSquare;
}

/** An area as the board plays it: from where its creature stands, if it stands on the board. */
export interface BlastPlay extends Omit<Blast, "key" | "from"> {
  readonly fromId: CombatantId | undefined;
  readonly from: BoardSquare | undefined;
}

/** A playing effect, with the key that tells two on one token apart. */
export type Playing = (Extract<BoardEffect, { kind: "hurt" | "heal" }> | StrikePlay | BlastPlay) & {
  readonly key: number;
};

/** More than this at once and the oldest go, so a board that never sees `animationend` stays bounded. */
const MOST = 24;

/**
 * What the board plays as `tokens` change: the bursts, and each token's hop;
 * and each of `acts` that arrives after the board first drew them: an attack
 * from where its attacker stands to where its target does, an area over its
 * squares from where its creature stands. A reload or a reconnect replays
 * none of the night's; an attack whose attacker or target is off the board
 * plays nothing.
 *
 * `settled` names the token the board itself just put down (a drop holds its
 * square until the server answers), whose move arriving from the server is no
 * news to anyone watching it and so does not hop.
 */
export function useBoardEffects(
  tokens: ReadonlyArray<EffectToken>,
  settled: (id: CombatantId, to: BoardSquare) => boolean,
  acts: ReadonlyArray<Act> = [],
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

  const actsRead = JSON.stringify(acts);
  useEffect(() => {
    const now = JSON.parse(actsRead) as ReadonlyArray<Act>;
    if (seen.current === undefined) {
      seen.current = new Set(now.map((act) => act.key));
      return;
    }
    const fresh = now.filter((act) => !seen.current!.has(act.key));
    for (const act of fresh) seen.current.add(act.key);
    const plays = fresh.flatMap((act) => playOf(act, squares.current));
    if (plays.length > 0) {
      setPlaying((current) =>
        [...current, ...plays.map((play) => ({ ...play, key: next.current++ }))].slice(-MOST),
      );
    }
  }, [actsRead]);

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

/** One act as the board plays it, from the squares its creatures stand on now. */
const playOf = (
  act: Act,
  squares: ReadonlyMap<CombatantId, BoardSquare>,
): ReadonlyArray<StrikePlay | BlastPlay> => {
  if (act.kind === "blast") {
    const { key: _key, from, ...what } = act;
    return [
      {
        ...what,
        fromId: from ?? undefined,
        from: from === null ? undefined : squares.get(from),
      },
    ];
  }
  const from = squares.get(act.from);
  const to = squares.get(act.to);
  if (from === undefined || to === undefined) return [];
  const { key: _key, from: fromId, to: toId, ...what } = act;
  return [{ ...what, fromId, toId, from, to }];
};
