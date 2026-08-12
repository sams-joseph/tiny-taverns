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
  /** A uniqueness rule said no — the declared `Conflict`, with the server's own sentence. */
  | { readonly kind: "conflict"; readonly message: string }
  /**
   * The server is missing a part it needs — today, a model behind Hob.
   *
   * Distinct from `unreachable` on purpose: the server answered, and it
   * answered that an *opt-in* dependency is not configured. Carrying the
   * server's own sentence rather than composing one here keeps the instructions
   * ("set HOB_API_URL…") in the process that knows them.
   */
  | { readonly kind: "unavailable"; readonly message: string }
  /** The payload does not satisfy the contract. See `classifyFailure` — it never left. */
  | { readonly kind: "invalid"; readonly detail: string }
  /** Nothing answered: the API is not running, or the browser is offline. */
  | { readonly kind: "unreachable" }
  | { readonly kind: "unknown"; readonly detail: string };

const tagOf = (error: unknown): string | undefined => {
  const tag: unknown = (error as { readonly _tag?: unknown } | null)?._tag;
  return typeof tag === "string" ? tag : undefined;
};

const stringField = (error: unknown, key: string): string | undefined => {
  const value: unknown = (error as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : undefined;
};

/**
 * `SchemaError(…)` reads as a stack frame. Unwrap it to the sentence inside,
 * which is the half a DM staring at a form has any use for.
 */
const schemaDetail = (error: unknown): string => {
  const text = String(error);
  const inner = /^SchemaError\(([\s\S]*)\)$/.exec(text);
  return (inner?.[1] ?? text).trim();
};

/**
 * Names a failure. Structural rather than status-code sniffing: `Unauthorized`,
 * `NotFound` and `Conflict` arrive decoded from `packages/api`, so this reads
 * the same tag the server threw.
 */
export const classifyFailure = (error: unknown): ApiFailure => {
  switch (tagOf(error)) {
    case "Unauthorized":
      return { kind: "unauthorized" };
    case "NotFound":
      return { kind: "missing", resource: stringField(error, "resource") ?? "row" };
    case "Conflict":
      return {
        kind: "conflict",
        message: stringField(error, "message") ?? "That is already there.",
      };
    case "HobUnavailable":
      return {
        kind: "unavailable",
        message: stringField(error, "message") ?? "That part of the server is not switched on.",
      };
    /**
     * A payload the contract rejects **never reaches the network**: the derived
     * client encodes through the same schema the handler decodes with, so
     * `client.encounters.create({ payload: { name: "" } })` fails locally with a
     * `SchemaError` rather than earning a 400. Which is the good outcome — the
     * one declaration checks both ends — but it means a validation failure is
     * *this* tag and not a status code, and a screen that only classified
     * responses would render it as "unknown".
     */
    case "SchemaError":
      return { kind: "invalid", detail: schemaDetail(error) };
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
