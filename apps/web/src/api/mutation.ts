import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useState } from "react";
import { useCredential } from "../auth/credential";
import { runApiResult, type TavernsClient } from "./client";
import type { ApiFailure } from "./failure";

/**
 * How a screen *writes*: one call, one busy flag, one failure.
 *
 * The read side is `api/atoms.ts`, and the two are deliberately shaped
 * differently. A read runs because its inputs changed, so it is an *atom* —
 * identified by the key it was built from, and re-read when that key changes.
 * A write runs because the DM clicked, so there is nothing to key on: the
 * Effect is handed over at `submit` time and no memoisation rule applies to
 * it. Getting that backwards is how a form ends up saving on every render.
 *
 * **Writes have not been ported and are the next piece of work.** Reads moved
 * to atoms so a screen stops blanking on every re-read; a write's own
 * invalidation — which key a save should refresh, rather than the caller
 * hand-wiring `onSaved → reload()` — is the change after that.
 *
 * What it does *not* do is decide anything about the screen. It returns the
 * saved row (or `undefined` when the call failed) and leaves closing the
 * dialog, reloading the view and clearing the fields to the caller, because
 * those differ per form and a hook that guessed would be wrong in one of them.
 *
 * ### Compose several writes into one submit
 *
 * A form that saves an encounter *and* its roster passes one `Effect.gen` doing
 * all of it, exactly as `campaign/load.ts` composes six reads into one. Two
 * `submit` calls in a row would give the form two busy flags, two failures and
 * a half-saved state to explain; one gives it the three states it has.
 */
export interface Mutation {
  /** A save is in flight. Disable the button; do not unmount the form. */
  readonly busy: boolean;
  /** The last failure, until the next `submit` or an explicit `clear`. */
  readonly failure: ApiFailure | undefined;
  readonly clear: () => void;
  /**
   * Runs the write with a freshly resolved credential and reports what happened.
   *
   * A `Result` rather than `A | undefined` because a `delete` succeeds with
   * `void`: "the row is gone" and "the call failed" would otherwise be the same
   * value, and a form would close on a failure it never noticed. `failure` is
   * set to the same thing on the way out, for rendering.
   */
  readonly submit: <A, E>(
    use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
  ) => Promise<Result.Result<A, ApiFailure>>;
}

export function useMutation(): Mutation {
  const fetchCredential = useCredential();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const clear = useCallback(() => setFailure(undefined), []);

  const submit = useCallback(
    async <A, E>(use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>) => {
      setBusy(true);
      setFailure(undefined);
      // Fetched here, per submit, never held: a hosted session token lives 60
      // seconds and a dialog can sit open longer than that. Same rule as
      // the atom client, and `auth/credential.ts` says why.
      const token = await fetchCredential();
      const result = await runApiResult(use, token);
      setBusy(false);
      if (Result.isFailure(result)) setFailure(result.failure);
      return result;
    },
    [fetchCredential],
  );

  return { busy, failure, clear, submit };
}
