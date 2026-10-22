import { Kbd } from "@taverns/ui";
import { lightSources } from "@taverns/api";
import { useMemo, type ReactNode } from "react";
import { describeHover } from "./overlay";
import type { EditorState, EditorStore } from "./store";
import { toolSpec } from "./tools";
import { usePointer } from "./useEditor";

/** A `[key]` in a hint; `[[]` and `[]]` are the bracket keys themselves. */
const KEY_SPLIT = /(\[(?:[^\]]+|\])\])/;
const KEY = /^\[(?:[^\]]+|\])\]$/;

/** A hint with its `[keys]` drawn as keys. */
const withKeys = (text: string): ReactNode =>
  text.split(KEY_SPLIT).map((part, k) =>
    KEY.test(part) ? (
      <Kbd key={k} className="mx-0.5">
        {part.slice(1, -1)}
      </Kbd>
    ) : (
      part
    ),
  );

/**
 * The line at the foot of the canvas: what the tool does, or what the pointer
 * would do where it is (a wall's length, a room's size, the cover a square has
 * from the party); and the level's counts with the square under the pointer.
 */
export function Hud({
  store,
  state,
}: {
  readonly store: EditorStore;
  readonly state: EditorState;
}) {
  const pointer = usePointer(store);
  const doc = state.history.present;
  const hint = describeHover(state, pointer).hint ?? toolSpec(state.tool).hint;
  const shining = useMemo(() => lightSources(doc).length, [doc]);
  const square =
    pointer === null
      ? null
      : `${String(Math.floor(pointer.point.x))}, ${String(Math.floor(pointer.point.y))}`;
  return (
    <div className="flex items-end justify-between gap-3">
      <p
        aria-live="polite"
        className="max-w-md rounded-control bg-surface-sunken/80 px-2.5 py-1.5 text-label-s leading-body text-muted-foreground"
      >
        {withKeys(hint)}
      </p>
      <p className="rounded-control bg-surface-sunken/80 px-2.5 py-1.5 text-right font-mono text-micro whitespace-pre text-faint">
        {`${String(doc.columns)}×${String(doc.rows)} squares · ${String(doc.walls.length)} walls · ${String(doc.props.length)} props · ${String(shining)} lights`}
        {square === null ? "" : `\nsquare ${square}`}
      </p>
    </div>
  );
}
