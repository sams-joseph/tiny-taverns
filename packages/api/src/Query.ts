import { Schema, SchemaGetter } from "effect";

/**
 * A query parameter that may be given more than once — and, crucially, that
 * still means a list when it is given **once**.
 *
 * ### The defect this exists to close
 *
 * A URL carries a repeated key, not an array: `?environments=Cave&environments=River`.
 * `UrlParams.toRecord` — what `HttpApiBuilder` hands the query decoder — folds
 * that into a `Record<string, string | NonEmptyArray<string>>`, so **one
 * occurrence arrives as a scalar and two arrive as an array**. A bare
 * `Schema.Array(...)` therefore refuses exactly the common case: the derived
 * client encodes `["Cave"]` as a single `?environments=Cave`, and the server
 * answers `400 Expected array | undefined, got "Cave"`. Two chips worked; one
 * did not, and single selection is the shape a real user meets first.
 *
 * It is not a client bug to route around — `UrlParams.fromInput` is *right* to
 * emit one occurrence for a one-element array, because that is what the wire
 * format is. The asymmetry is that a scalar and a one-element list are the same
 * URL, so the schema is the only place the two can be reconciled.
 *
 * ### The rule
 *
 * **Every array-valued query parameter in this contract goes through this
 * helper.** A bare `Schema.Array` in a `query:` position is the bug, wherever it
 * appears; `Query.test.ts` is what says so out loud, and the sweep across every
 * list endpoint is recorded in `AGENTS.md`.
 *
 * The encoding direction is deliberately the identity: the client hands an array
 * to `UrlParams.fromInput`, which emits one occurrence per element and **no key
 * at all for an empty array**. So an empty filter is an absent parameter rather
 * than an empty string, which is what makes "no chips pressed" and "chips
 * pressed that match nothing" different questions at the repository.
 */
export const queryArray = <S extends Schema.Codec<string, string>>(item: S) =>
  Schema.Union([Schema.Array(item), item]).pipe(
    Schema.decodeTo(Schema.Array(item), {
      decode: SchemaGetter.transform((value: string | ReadonlyArray<string>) =>
        typeof value === "string" ? [value] : value,
      ),
      encode: SchemaGetter.transform((value: ReadonlyArray<string>) => value),
    }),
  );
