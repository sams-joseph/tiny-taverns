import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { FetchHttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useState } from "react";
import { useCredential } from "../auth/credential";
import { makeClient, type TavernsClient } from "./client";

/**
 * How a screen loads from the API: one call, one loading state, one failure.
 *
 * `runApi` in `client.ts` rejects its promise, which is right for the Server
 * panel's one-shot buttons and wrong for a screen — a rejected promise loses
 * the *typed* error the contract went to the trouble of declaring, and every
 * caller ends up rendering `String(cause)`. `Effect.result` keeps it: the
 * failure arrives as the declared `Unauthorized` / `NotFound`, and this module
 * narrows it to the handful of things a screen can actually say something
 * useful about.
 *
 * Screens that come next (bestiary, the runner) should load through
 * `useApiResource` rather than growing their own `useEffect` + `catch`.
 */

/** What went wrong, in the only terms a screen needs to distinguish. */
export type ApiFailure =
  /** No credential, or one the server does not know. The 401 from `Authorization`. */
  | { readonly kind: "unauthorized" }
  /** Gone, or never visible to this actor — the server says the same for both, on purpose. */
  | { readonly kind: "missing"; readonly resource: string }
  /** Nothing answered: the API is not running, or the browser is offline. */
  | { readonly kind: "unreachable" }
  | { readonly kind: "unknown"; readonly detail: string };

const tagOf = (error: unknown): string | undefined => {
  const tag: unknown = (error as { readonly _tag?: unknown } | null)?._tag;
  return typeof tag === "string" ? tag : undefined;
};

/**
 * Names a failure. Structural rather than status-code sniffing: `Unauthorized`
 * and `NotFound` arrive decoded from `packages/api`, so this reads the same tag
 * the server threw.
 */
export const classifyFailure = (error: unknown): ApiFailure => {
  switch (tagOf(error)) {
    case "Unauthorized":
      return { kind: "unauthorized" };
    case "NotFound": {
      const resource: unknown = (error as { readonly resource?: unknown }).resource;
      return { kind: "missing", resource: typeof resource === "string" ? resource : "row" };
    }
    case "HttpClientError": {
      // A transport error is "the server did not answer" — a different thing to
      // tell a DM than "the server said no".
      const reason: unknown = (error as { readonly reason?: unknown }).reason;
      return tagOf(reason) === "TransportError"
        ? { kind: "unreachable" }
        : { kind: "unknown", detail: String(error) };
    }
    default:
      // `fetch` itself rejecting — jsdom and some browsers surface a bare
      // TypeError rather than anything Effect wrapped.
      return error instanceof TypeError
        ? { kind: "unreachable" }
        : { kind: "unknown", detail: String(error) };
  }
};

/** Runs a client call and returns its outcome, never rejecting for a declared error. */
export const runApiResult = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
  token?: string,
): Promise<Result.Result<A, ApiFailure>> =>
  Effect.runPromise(
    Effect.flatMap(makeClient(token), use).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.result,
      Effect.map(Result.mapError(classifyFailure)),
    ),
    // A defect (a schema the server broke, say) still rejects; catching it here
    // is what keeps a screen from being stuck on "Loading…" forever.
  ).catch((cause: unknown) => Result.fail(classifyFailure(cause)));

export type Resource<A> =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly value: A }
  | { readonly state: "failed"; readonly failure: ApiFailure };

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
          ? { state: "ready", value: result.success }
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
