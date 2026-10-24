import { Effect } from "effect";
import { type Atom, type AsyncResult, AtomRegistry } from "effect/reactivity";

/** How long a screen waits on the next screen's reads before going to it regardless. */
const READ_AHEAD_MS = 3_000;

/**
 * Read the next screen's first answers before going to it, so it mounts on
 * them rather than on a loader: the reads it draws nothing without, held in
 * the registry across the navigation and let go once it holds them itself.
 * What a level visit's stage and the fight that borrows it do before going
 * one to the other, which, with the stage they hand over
 * (`run/stageHandoff.ts`), makes the switch one frame.
 *
 * Never fails: a read that does not answer in time, or fails, is the next
 * screen's to say so.
 */
export const readAhead = async (
  registry: AtomRegistry.AtomRegistry,
  atoms: ReadonlyArray<Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>>,
): Promise<void> => {
  const held = atoms.map((atom) => registry.mount(atom));
  setTimeout(() => {
    for (const release of held) release();
  }, READ_AHEAD_MS * 2);
  await Promise.race([
    Promise.all(
      atoms.map((atom) =>
        Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).catch(
          () => undefined,
        ),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, READ_AHEAD_MS)),
  ]);
};
