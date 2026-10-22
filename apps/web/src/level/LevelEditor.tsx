import { type ReactNode, useEffect, useRef, useState } from "react";
import type { LevelDocument } from "./document";
import { Hud } from "./Hud";
import { Inspector } from "./Inspector";
import { keyAction, typingInto } from "./keymap";
import { LevelCanvas } from "./LevelCanvas";
import { EditorStore, type LoadLevel, type SaveLevel } from "./store";
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
   * reject and the editor says it is not saved and offers to try again; reject
   * with a `LevelSaveConflict` (a stale version is refused) and it says the
   * level was saved elsewhere and offers `onLoad`'s two ways out.
   */
  readonly onSave: SaveLevel;
  /**
   * Read the level as the server holds it now: after a conflict, the editor
   * either loads it in place of its own copy or saves its copy over it at its
   * version. Without it a conflict can only be left as it is.
   */
  readonly onLoad?: LoadLevel;
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
export function LevelEditor({ level, onSave, onLoad, saving = false, back }: LevelEditorProps) {
  const save = useRef(onSave);
  save.current = onSave;
  const load = useRef(onLoad);
  load.current = onLoad;
  const [store] = useState(
    () =>
      new EditorStore(
        level,
        (next) => save.current(next),
        () => (load.current === undefined ? Promise.resolve(level) : load.current()),
      ),
  );
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
    // Leaving the page with edits the server has not kept asks first. The
    // save on `pagehide` is a best try, not a promise: it waits on a fresh
    // credential, which a closing page does not live to see, and a large
    // level is past what a `keepalive` request may carry. So the browser's
    // own "leave this page?" is what keeps the edits.
    const unload = (event: BeforeUnloadEvent) => {
      if (!store.unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const leaving = () => store.flush();
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", unload);
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
