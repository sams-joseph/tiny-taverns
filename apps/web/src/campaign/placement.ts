import {
  type BoardSquare,
  type EncounterCreature,
  type EncounterCreatureId,
  type EncounterLevelPlacement,
  type LevelLayout,
  standable,
} from "@taverns/api";

/**
 * The encounter page's placement draft (`EncounterPlacement.tsx`): where each
 * creature instance stands on the encounter's level, and the trigger area,
 * before the DM saves it through `encounters.place`, which replaces both
 * whole. Pure, so the rules the page holds a square to are tested without a
 * board: a square on the level that a token may stand on (`standable`, the
 * server's own check), one creature a square.
 */

/** One instance of a roster line: `Goblin 2`, which the DM places. */
export interface Instance {
  readonly key: string;
  readonly encounterCreatureId: EncounterCreatureId;
  readonly ordinal: number;
  readonly name: string;
}

export interface PlacementDraft {
  /** By `Instance.key`. */
  readonly spots: ReadonlyMap<string, BoardSquare>;
  /** Squares of the level, `row * columns + column`. */
  readonly trigger: ReadonlySet<number>;
}

export const instanceKey = (encounterCreatureId: EncounterCreatureId, ordinal: number): string =>
  `${encounterCreatureId}:${String(ordinal)}`;

/** Every instance on the roster, in its order: a line of one is its name, of more numbered. */
export const instancesOf = (
  roster: ReadonlyArray<Pick<EncounterCreature, "id" | "name" | "count" | "npc">>,
): ReadonlyArray<Instance> =>
  roster.flatMap((line) => {
    const name = line.npc?.name ?? line.name;
    return Array.from({ length: line.count }, (_, ordinal) => ({
      key: instanceKey(line.id, ordinal),
      encounterCreatureId: line.id,
      ordinal,
      name: line.count === 1 ? name : `${name} ${String(ordinal + 1)}`,
    }));
  });

/** The saved placement as a draft, keeping only the instances the roster still has. */
export const draftOf = (
  placement: EncounterLevelPlacement,
  instances: ReadonlyArray<Instance>,
): PlacementDraft => {
  const known = new Set(instances.map((instance) => instance.key));
  return {
    spots: new Map(
      placement.spots
        .map((spot) => [instanceKey(spot.encounterCreatureId, spot.ordinal), spot] as const)
        .filter(([key]) => known.has(key))
        .map(([key, spot]) => [key, { column: spot.column, row: spot.row }]),
    ),
    trigger: new Set(placement.trigger ?? []),
  };
};

/** The draft as the write sends it, in roster order, the trigger ascending, an empty one none. */
export const payloadOf = (
  draft: PlacementDraft,
  instances: ReadonlyArray<Instance>,
): EncounterLevelPlacement => {
  const trigger = [...draft.trigger].sort((a, b) => a - b);
  return {
    spots: instances.flatMap((instance) => {
      const square = draft.spots.get(instance.key);
      return square === undefined
        ? []
        : [
            {
              encounterCreatureId: instance.encounterCreatureId,
              ordinal: instance.ordinal,
              column: square.column,
              row: square.row,
            },
          ];
    }),
    trigger: trigger.length === 0 ? null : trigger,
  };
};

/** Whether the draft says what the saved placement says. */
export const sameAs = (
  draft: PlacementDraft,
  saved: EncounterLevelPlacement,
  instances: ReadonlyArray<Instance>,
): boolean => {
  const now = payloadOf(draft, instances);
  const was = payloadOf(draftOf(saved, instances), instances);
  return JSON.stringify(now) === JSON.stringify(was);
};

/**
 * Stand an instance on a square, or say why not: the level's own rule, and
 * another creature already there. Moving one onto its own square is no
 * change.
 */
export const placeOn = (
  draft: PlacementDraft,
  layout: Pick<LevelLayout, "columns" | "rows" | "floor" | "props">,
  key: string,
  square: BoardSquare,
): PlacementDraft | { readonly refused: string } => {
  if (!standable(layout, square)) return { refused: "Nothing can stand on that square." };
  for (const [other, at] of draft.spots) {
    if (other !== key && at.column === square.column && at.row === square.row) {
      return { refused: "Another creature already stands there." };
    }
  }
  const spots = new Map(draft.spots);
  spots.set(key, square);
  return { ...draft, spots };
};

export const takeOff = (draft: PlacementDraft, key: string): PlacementDraft => {
  const spots = new Map(draft.spots);
  spots.delete(key);
  return { ...draft, spots };
};

/** Paint a square of the trigger area on (`true`) or off. */
export const paintTrigger = (
  draft: PlacementDraft,
  square: number,
  on: boolean,
): PlacementDraft => {
  if (draft.trigger.has(square) === on) return draft;
  const trigger = new Set(draft.trigger);
  if (on) trigger.add(square);
  else trigger.delete(square);
  return { ...draft, trigger };
};
