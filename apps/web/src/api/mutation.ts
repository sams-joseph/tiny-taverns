import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useState } from "react";
import { useCredential } from "../auth/credential";
import { useInvalidate } from "./atoms";
import { runApiResult, type TavernsClient } from "./client";
import type { ApiFailure } from "./failure";
import type { Invalidation } from "./keys";

/**
 * How a screen *writes*: one call, one busy flag, one failure — and a list of
 * the reads it changed.
 *
 * The read side is `api/atoms.ts`, and the two are deliberately shaped
 * differently. A read runs because its inputs changed, so it is an *atom* —
 * identified by the key it was built from, and re-read when that key changes.
 * A write runs because the DM clicked, so there is nothing to key on: the
 * Effect is handed over at `submit` time and no memoisation rule applies to
 * it. Getting that backwards is how a form ends up saving on every render.
 *
 * What it does *not* do is decide anything about the screen. It returns the
 * saved row (or a failure) and leaves closing the dialog and clearing the
 * fields to the caller, because those differ per form and a hook that guessed
 * would be wrong in one of them.
 *
 * ### The write says what it changed, and that is what replaced `reload()`
 *
 * Every caller used to end with `onSaved → reload()`, and on the campaign's
 * five screens `reload()` meant re-reading the whole campaign — one write and
 * eight reads to add a line to a checklist. It named nothing, so nothing could
 * be narrowed: this hook had **no concept of what a write invalidates**.
 *
 * It has one now. `submit` takes the reads the write changed, in the vocabulary
 * of `api/keys.ts`, and every atom that named the same resource reads itself
 * again — including atoms on screens this component has never heard of, which
 * is what *"components own their own invalidation"* means in practice.
 *
 * **The argument is required, and that is the whole guard.** `api/keys.ts` says
 * why at length: a key is still a name somebody has to remember, so the one
 * thing that can be made structural is that the question gets asked. A write
 * that genuinely changes nothing anybody reads passes `[]`.
 *
 * ### Why the busy flag is React state and not an atom
 *
 * The result of a *read* is shared — that is the point of a registry. The state
 * of a **form** is not: two dialogs that happen to write the same table must
 * not share a spinner or each other's error, and two writes in one component
 * (mint and withdraw, next-turn and share) must not interrupt each other.
 * `Atom.fn` is one atom per declaration and would give them exactly that.
 * `useAtomSet(atom, {mode: "promise"})` cannot express it either: with a shared
 * atom, two `submit`s in flight resolve to one another's answer.
 *
 * So the transport and the invalidation are the atom runtime's, and the three
 * things that belong to one open form — busy, failure, and the promise the
 * caller awaits — stay where the form is.
 *
 * ### Compose several writes into one submit
 *
 * A form that saves an encounter *and* its roster passes one `Effect.gen` doing
 * all of it, exactly as `campaign/load.ts` composes reads. Two `submit` calls
 * in a row would give the form two busy flags, two failures and a half-saved
 * state to explain; one gives it the three states it has. It is also why the
 * write side is not `AtomHttpApi`'s own `mutation`, which is one endpoint per
 * atom and cannot express a save that touches two tables.
 */
export interface Mutation {
  /** A save is in flight. Disable the button; do not unmount the form. */
  readonly busy: boolean;
  /** The last failure, until the next `submit` or an explicit `clear`. */
  readonly failure: ApiFailure | undefined;
  readonly clear: () => void;
  /**
   * Runs the write with a freshly resolved credential, refreshes the reads it
   * changed, and reports what happened.
   *
   * A `Result` rather than `A | undefined` because a `delete` succeeds with
   * `void`: "the row is gone" and "the call failed" would otherwise be the same
   * value, and a form would close on a failure it never noticed. `failure` is
   * set to the same thing on the way out, for rendering.
   *
   * **`invalidates` fires only on success**, which is the one behaviour worth
   * stating: a refused write leaves every screen showing what the server still
   * holds, rather than re-reading to prove nothing moved.
   */
  readonly submit: <A, E>(
    use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
    invalidates: Invalidation,
  ) => Promise<Result.Result<A, ApiFailure>>;
}

export function useMutation(): Mutation {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const clear = useCallback(() => setFailure(undefined), []);

  const submit = useCallback(
    async <A, E>(
      use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
      invalidates: Invalidation,
    ) => {
      setBusy(true);
      setFailure(undefined);
      // Fetched here, per submit, never held: a hosted session token lives 60
      // seconds and a dialog can sit open longer than that. Same rule as
      // the atom client, and `auth/credential.ts` says why.
      const token = await fetchCredential();
      const result = await runApiResult(use, token);
      setBusy(false);
      if (Result.isFailure(result)) setFailure(result.failure);
      else if (invalidates.length > 0) invalidate(invalidates);
      return result;
    },
    [fetchCredential, invalidate],
  );

  return { busy, failure, clear, submit };
}
