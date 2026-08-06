import { TavernsApi } from "@taverns/api";
import { Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

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
