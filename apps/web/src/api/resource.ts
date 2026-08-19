import type { Effect } from "effect";
import { Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useState } from "react";
import { useCredential } from "../auth/credential";
import { runApiResult } from "./client";
import type { TavernsClient } from "./client";
import type { Resource } from "./failure";

/**
 * **The retiring read hook. Do not write a new screen on it.**
 *
 * `api/atoms.ts` is what replaces it — `@effect/atom-react`, with the client
 * still derived from the same `TavernsApi` declaration — and the port is
 * running one call site at a time. `AGENTS.md` records which have moved. Two
 * loading idioms in one codebase is a real cost against this repo's culture of
 * not having second answers to one question, and the only thing that bounds it
 * is finishing; copying this hook into a new screen because its neighbour uses
 * it is what stops that happening.
 *
 * What is wrong with it, concretely, and why the replacement is not a matter of
 * taste: it sets `{state: "loading"}` at the top of **every** run, including
 * the one `reload()` triggers, so the last good value is thrown away before the
 * new request is even sent. On a screen whose writes end in `reload()` that is
 * a blank page, a lost scroll position and a campaign row that flickers — about
 * half a second of it on a real connection. An atom keeps the value it has
 * while it re-reads. `Resource.refreshing` is therefore always `false` here:
 * this hook has no state in which it is true.
 *
 * `Effect.result` keeps the *typed* error the contract went to the trouble of
 * declaring, which is the part that survives the port unchanged — see
 * `api/failure.ts`, which owns the taxonomy for both idioms.
 */

/**
 * Loads one Effect and tracks the three states every screen has.
 *
 * `use` must be stable — wrap it in `useCallback` keyed on whatever it closes
 * over — because its identity is what says "load again". The returned `reload`
 * is for a Try-again button, and re-runs the same call with a freshly fetched
 * credential.
 *
 * Compose *within* the Effect rather than calling this several times: one
 * `Effect.all` over four endpoints gives a screen one loading state and one
 * error, where four hooks give it sixteen combinations to render.
 */
export function useApiResource<A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
): readonly [Resource<A>, () => void] {
  const fetchCredential = useCredential();
  const [resource, setResource] = useState<Resource<A>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setResource({ state: "loading" });

    void (async () => {
      // Fetched here, per load, never held: see `auth/credential.ts`.
      const token = await fetchCredential();
      const result = await runApiResult(use, token);
      if (!live) return;
      setResource(
        Result.isSuccess(result)
          ? { state: "ready", value: result.success, refreshing: false }
          : { state: "failed", failure: result.failure },
      );
    })();

    return () => {
      live = false;
    };
  }, [use, fetchCredential, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return [resource, reload] as const;
}
