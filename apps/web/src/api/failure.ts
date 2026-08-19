import { Cause } from "effect";

/**
 * What a failed read or write *is*, in the only terms a screen needs to
 * distinguish — and the three states every data-backed screen has.
 *
 * This is the vocabulary, and it is deliberately in a module of its own rather
 * than in whichever hook happens to fetch. **Reads go through `api/atoms.ts`
 * and writes through `api/mutation.ts`**, and the whole point of the taxonomy
 * is that a screen says the same thing about a 401 whichever of them fetched
 * it. `ui/states.tsx` is the one place its copy is written.
 *
 * `runApi` in `client.ts` rejects its promise, which is right for the Server
 * panel's one-shot buttons and wrong for a screen — a rejected promise loses
 * the *typed* error the contract went to the trouble of declaring, and every
 * caller ends up rendering `String(cause)`. Both hooks keep it: the failure
 * arrives as the declared `Unauthorized` / `NotFound`, and this module narrows
 * it to the handful of things a screen can actually say something useful about.
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

/**
 * The same taxonomy, over an atom's `Cause`.
 *
 * **`classifyFailure` survives the port as a function rather than as a hook**,
 * and this is the whole of the adapter: `AsyncResult.Failure` carries a
 * `Cause<E>` where the promise path carried a bare `unknown`, and
 * `Cause.squash` is the one step between them — it yields the first `Fail`'s
 * error, or failing that the first `Die`'s defect.
 *
 * **Reading the defects is not optional here, and it is easy to miss.**
 * `AtomHttpApi` deliberately `Effect.die`s a `SchemaError` and an
 * `HttpClientError` (`catchErrors`, in its own source) so that only an
 * endpoint's *declared* errors stay in the atom's `E`. So `invalid` and
 * `unreachable` — a payload the contract rejected before it left the browser,
 * and a server that never answered — arrive here as **defects**, and a
 * classifier that only read `Cause.failures` would render both as "unknown"
 * with a stack frame in them. `Cause.squash` reads both, which is exactly why
 * it is the right destructor and a `filterError` would not be.
 */
export const failureFromCause = <E>(cause: Cause.Cause<E>): ApiFailure =>
  classifyFailure(Cause.squash(cause));

/**
 * The three states a data-backed screen renders, and the one flag that says
 * which idiom fetched it.
 *
 * `refreshing` is what `@effect/atom-react` supplies and the hand-rolled hook
 * it replaced could not: an atom keeps the value it has while it re-reads
 * (`AsyncResult.waiting`), where `useApiResource` set `{state: "loading"}` at
 * the top of every run and painted "Loading…" over a screen the DM was
 * reading. That is the blank this port was for, and the flag is the state that
 * used to be unrepresentable.
 */
export type Resource<A> =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly value: A; readonly refreshing: boolean }
  | { readonly state: "failed"; readonly failure: ApiFailure };
