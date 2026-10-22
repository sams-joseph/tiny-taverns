/**
 * The editor's undo and redo, over whole documents. Every edit makes a new
 * immutable document sharing what it did not change (`edits.ts`), so keeping
 * the old ones is cheap and an undo is a pointer move.
 *
 * A drag (painting a floor, moving a prop) is one step however many edits it
 * makes: `begin` marks where it started, `update` replaces the present while
 * it runs, and `commit` records the start as one step, or nothing when the
 * drag changed nothing.
 */
export interface History<T> {
  readonly past: ReadonlyArray<T>;
  readonly present: T;
  readonly future: ReadonlyArray<T>;
  /** The present when the running drag began, or `null` outside one. */
  readonly pending: T | null;
}

/** How many steps back an undo can reach. */
export const HISTORY_LIMIT = 200;

export const historyOf = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
  pending: null,
});

const capped = <T>(past: ReadonlyArray<T>): ReadonlyArray<T> =>
  past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;

/** One edit as one step. An edit that changed nothing records nothing. */
export const push = <T>(history: History<T>, next: T): History<T> => {
  if (history.pending !== null) return { ...history, present: next };
  if (next === history.present) return history;
  return {
    past: capped([...history.past, history.present]),
    present: next,
    future: [],
    pending: null,
  };
};

/** Start a drag: the edits until `commit` are one step. */
export const begin = <T>(history: History<T>): History<T> =>
  history.pending !== null ? history : { ...history, pending: history.present };

/** An edit inside a drag. */
export const update = <T>(history: History<T>, next: T): History<T> =>
  history.pending === null ? push(history, next) : { ...history, present: next };

/** End a drag, recording it as one step if it changed anything. */
export const commit = <T>(history: History<T>): History<T> => {
  const start = history.pending;
  if (start === null) return history;
  if (start === history.present) return { ...history, pending: null };
  return {
    past: capped([...history.past, start]),
    present: history.present,
    future: [],
    pending: null,
  };
};

export const canUndo = <T>(history: History<T>): boolean =>
  history.pending === null && history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean =>
  history.pending === null && history.future.length > 0;

export const undo = <T>(history: History<T>): History<T> => {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1] as T;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    pending: null,
  };
};

export const redo = <T>(history: History<T>): History<T> => {
  if (!canRedo(history)) return history;
  const [next, ...rest] = history.future as [T, ...Array<T>];
  return {
    past: capped([...history.past, history.present]),
    present: next,
    future: rest,
    pending: null,
  };
};

/**
 * Change every recorded document without making a step: the server's new
 * `version` after a save reaches the present and every document an undo or
 * redo could return to, so a later save never carries a stale one.
 */
export const mapAll = <T>(history: History<T>, change: (doc: T) => T): History<T> => ({
  past: history.past.map(change),
  present: change(history.present),
  future: history.future.map(change),
  pending: history.pending === null ? null : change(history.pending),
});
