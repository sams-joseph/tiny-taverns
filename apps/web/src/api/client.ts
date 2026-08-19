import { TavernsApi } from "@taverns/api";
import { Effect, Result } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { classifyFailure, type ApiFailure } from "./failure";

/**
 * The typed client, derived from the same `TavernsApi` declaration the server
 * implements.
 *
 * There is no codegen step and no second description of the wire format: the
 * request payloads, path params and response schemas here *are* the ones the
 * handlers are checked against. A field renamed on the server stops this file
 * compiling, which is the reason `HttpApi` was chosen over a hand-rolled router.
 */

/** Where the API lives. Vite inlines this at build time; defaults to dev. */
const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

export const makeClient = (token?: string) =>
  HttpApiClient.make(TavernsApi, {
    baseUrl,
    transformClient:
      token === undefined || token === ""
        ? undefined
        : HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Success<T> = T extends Effect.Effect<infer A, unknown, unknown> ? A : never;

/** Every endpoint, typed, as `client.notes.create({ params, payload })`. */
export type TavernsClient = Success<ReturnType<typeof makeClient>>;

/** Runs a client call in the browser, on `fetch`. */
export const runApi = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
  token?: string,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(makeClient(token), use).pipe(Effect.provide(FetchHttpClient.layer)),
  );

/**
 * Runs a client call and returns its outcome, never rejecting for a declared
 * error.
 *
 * The promise-shaped half of the API surface: `api/mutation.ts` writes through
 * it, the runner's stream and optimistic layers drive it directly, and the
 * retiring `useApiResource` reads through it. The atom path in `api/atoms.ts`
 * does not — an atom carries a `Cause` rather than a `Result`, and
 * `failureFromCause` is its adapter — but both end at the same
 * `classifyFailure`, which is the point of keeping the taxonomy in one module.
 */
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
