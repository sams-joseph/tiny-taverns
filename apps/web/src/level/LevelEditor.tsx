import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LevelDocument } from "./document";
import { Hud } from "./Hud";
import { Inspector } from "./Inspector";
import { keyAction, typingInto } from "./keymap";
import { LevelCanvas } from "./LevelCanvas";
import { EditorStore, type SaveLevel } from "./store";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
import { Tray } from "./Tray";
import { useEditorState } from "./useEditor";

export interface LevelEditorProps {
  /**
   * The level to edit, as the wire carries it. The editor keeps its own
   * working copy from here on; key the editor by the level's id so another
   * level gets a fresh one.
   */
  readonly level: LevelDocument;
  /**
   * Save the whole document (it carries the `version` it was read at). Called
   * a moment after the last edit, and at once on Save or Ctrl+S. Resolve with
   * the level as saved, whose `version` the editor carries into its next save;
   * reject (a stale version is refused) and the editor says it is not saved
   * and offers to try again.
   */
  readonly onSave: SaveLevel;
  /** The owner's save is in flight, for the status in the top bar. */
  readonly saving?: boolean;
  /** The way out of the editor, leading its top bar. */
  readonly back?: ReactNode;
}

/**
 * The full-screen level editor: the level drawn by three.js under floating
 * panels (the top bar, the tool rail, the tray for the tool in hand, the
 * inspector for the selection, and the hint line), with the prototype's keys.
 * Edits go to a local working copy under an undo stack and save themselves.
 *
 * It fills the viewport and never scrolls the window: the second named
 * exception to "pages scroll with the window", beside the live runner's canvas.
 */
export function LevelEditor({ level, onSave, saving = false, back }: LevelEditorProps) {
  const save = useRef(onSave);
  save.current = onSave;
  const [store] = useState(() => new EditorStore(level, (next) => save.current(next)));
  const state = useEditorState(store);
  const [floorThumbs, setFloorThumbs] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || typingInto(event.target)) return;
      const action = keyAction(event);
      if (action === null) return;
      event.preventDefault();
      store.key(action);
    };
    const leaving = () => store.flush();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", leaving);
      store.flush();
    };
  }, [store]);

  return (
    <div
      data-slot="level-editor"
      className="relative h-dvh w-full overflow-clip bg-surface-sunken text-foreground"
    >
      <LevelCanvas store={store} onThumbnails={setFloorThumbs} />
      <div className="pointer-events-none absolute inset-3 z-hud flex flex-col gap-3">
        <TopBar store={store} state={state} saving={saving} back={back} />
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <ToolRail store={store} tool={state.tool} />
          <Inspector store={store} state={state} />
        </div>
        <div className="flex justify-center empty:hidden">
          <Tray store={store} state={state} floorThumbs={floorThumbs} />
        </div>
        <Hud store={store} state={state} />
      </div>
    </div>
  );
}
