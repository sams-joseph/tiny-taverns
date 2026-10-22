import { useSyncExternalStore } from "react";
import type { Pointer } from "./overlay";
import type { EditorState, EditorStore } from "./store";

/** The editor's state, re-rendering when it changes. */
export const useEditorState = (store: EditorStore): EditorState =>
  useSyncExternalStore(store.subscribe, store.getState);

/** Where the pointer is over the level, re-rendering as it moves. */
export const usePointer = (store: EditorStore): Pointer | null =>
  useSyncExternalStore(store.subscribeHover, store.getPointer);
