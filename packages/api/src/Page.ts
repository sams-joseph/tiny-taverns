import { Effect, Option, Schema, SchemaGetter, SchemaIssue } from "effect";

/**
 * Pagination, and the one shape every list endpoint that has it uses.
 *
 * ### Keyset, not offset — and why
 *
 * A cursor names **the last row of the page it ends**, and the next page is
 * "everything ordered after that row". `LIMIT/OFFSET` names a *count*, and a
 * count is wrong the moment anything is inserted or deleted underneath a reader:
 * page 2 of an offset walk silently repeats a row or skips one, and a bestiary
 * is a list somebody adds to while somebody else is reading it. A keyset also
 * costs the same at page 40 as at page 1, where an offset re-reads and discards
 * everything before it.
 *
 * The decisive one here is neither: **a keyset is one more `where` clause.** It
 * narrows inside the same predicate the visibility seam contributes, in the same
 * query, so a paged read cannot be a leak and cannot produce a short page. An
 * offset that were applied outside the predicate would do both. See
 * `AGENTS.md`'s actor and visibility contract, which this is a direct
 * consequence of.
 *
 * ### How a caller learns there is more
 *
 * `nextCursor`. It is `null` when the page just returned is the last one, and
 * the server knows which by asking for one row more than it will return and
 * throwing the extra away. There is **no total count**: counting a
 * visibility-predicated corpus costs a second full scan, no screen draws one,
 * and a number that is expensive and unused is the shape this contract refuses
 * everywhere else.
 *
 * ### The rules a caller has to know
 *
 * - **The cursor decides the ordering.** It carries the ordering it was minted
 *   for, so page two of a CR-sorted bestiary is CR-sorted whatever `sort` says
 *   alongside it. Anything else would mean comparing a key taken in one order
 *   against columns read in another, which is a coherent-looking answer that is
 *   simply wrong. Changing the sort means starting again, with no cursor.
 * - **Filters are the caller's to resend.** A cursor is a position, not a saved
 *   query. Sending it with different filters is legal and gives the page of
 *   *that* query starting after that position.
 * - **A malformed cursor is a 400, from the schema.** It decodes through
 *   base64url and JSON here, so no endpoint needs an error member for it and no
 *   repository has to check one.
 */

/**
 * One component of an ordering key, as it survives a round trip through JSON.
 *
 * Two kinds carry the orderings this product has — a name is a string, and a
 * rating or a truncated timestamp is a number — and `null` is here because JSON
 * has one and a hand-written cursor may contain one. **No ordering column is
 * nullable**, deliberately: a null sorts by Postgres's own nulls-first/last rule
 * while `=` and `>` against it are neither true nor false, so it could not name
 * a position. See `repo/paging.ts`.
 */
export const CursorKey = Schema.Union([Schema.String, Schema.Finite, Schema.Null]);
export type CursorKey = typeof CursorKey.Type;

/**
 * Where a page ended: which ordering, and the key of its last row.
 *
 * Opaque on the wire — base64url of a small JSON object — and deliberately not
 * secret. Everything in it (a name, a rating, a creation time, an id) is on the
 * row the caller was just sent. What the encoding buys is that nobody builds one
 * by hand and then depends on the shape.
 */
export interface PageCursor<Ordering extends string = string> {
  /** The ordering this cursor was minted for. */
  readonly o: Ordering;
  /** The last row's ordering key, most significant column first, ending in its id. */
  readonly k: ReadonlyArray<CursorKey>;
}

/**
 * The cursor for a list whose orderings are `ordering`.
 *
 * Parametrised rather than universal so that an ordering name this list does not
 * offer is refused **by the schema**, which is what keeps the repository's
 * lookup total and keeps a bad cursor a 400 rather than a new error member on
 * five endpoints.
 */
export const pageCursor = <Ordering extends Schema.Codec<string, string>>(ordering: Ordering) => {
  const payload = Schema.Struct({ o: ordering, k: Schema.Array(CursorKey) });
  type Encoded = (typeof payload)["Encoded"];
  return Schema.String.pipe(
    Schema.decodeTo(Schema.String, {
      decode: SchemaGetter.decodeBase64UrlString(),
      encode: SchemaGetter.encodeBase64Url(),
    }),
    Schema.decodeTo(payload, {
      // `SchemaGetter.parseJson` would do this and types as `unknown`, which the
      // target's encoded type will not accept. Spelled out so the failure stays
      // a schema issue — a forged cursor is a 400 with a message, not a 500.
      decode: SchemaGetter.transformOrFail((text: string) =>
        Effect.try({
          try: () => JSON.parse(text) as Encoded,
          catch: (error) =>
            new SchemaIssue.InvalidValue(Option.some(text), { message: String(error) }),
        }),
      ),
      encode: SchemaGetter.transform((value: Encoded) => JSON.stringify(value)),
    }),
  );
};

/**
 * How many rows a list returns when the caller does not say.
 *
 * Big enough that the campaign screens' lists are one request in practice, small
 * enough that the first paint of a grown bestiary is not the whole corpus.
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * The most any list will return in one answer.
 *
 * A ceiling rather than a suggestion: it is the number that makes "the corpus
 * grows fastest here" a bounded cost instead of a growing one, and a client that
 * genuinely needs everything follows `nextCursor` rather than asking for more at
 * once.
 */
export const MAX_PAGE_SIZE = 200;

/** The two query parameters every paged list takes. */
export const pageFilter = <Ordering extends Schema.Codec<string, string>>(ordering: Ordering) =>
  ({
    limit: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE })),
    ),
    /** Where to carry on from. Absent means the first page. */
    cursor: Schema.optional(pageCursor(ordering)),
  }) as const;

/** One page of a list, and whether there is another. */
export interface Page<A, Ordering extends string = string> {
  readonly items: ReadonlyArray<A>;
  /** `null` when this page is the last one. */
  readonly nextCursor: PageCursor<Ordering> | null;
}

/** The wire shape of {@link Page}. */
export const pageOf = <Item extends Schema.Top, Ordering extends Schema.Codec<string, string>>(
  item: Item,
  ordering: Ordering,
) =>
  Schema.Struct({
    items: Schema.Array(item),
    nextCursor: Schema.NullOr(pageCursor(ordering)),
  });

/**
 * The ordering of a list that has exactly one — oldest first, which is what a
 * campaign's notes, its encounters and a night's beats are.
 *
 * A literal rather than an absent field, so that a cursor for one of these lists
 * is the same shape as a cursor for the bestiary and the machinery is one
 * mechanism rather than two.
 */
export const CreatedOrder = Schema.Literal("created");
export type CreatedOrder = typeof CreatedOrder.Type;

/** The paged list of a thing ordered oldest first. */
export const createdPageOf = <Item extends Schema.Top>(item: Item) => pageOf(item, CreatedOrder);

/** The query parameters of a list ordered oldest first. */
export const createdPageFilter = pageFilter(CreatedOrder);

/** The decoded filter, as a repository sees it. */
export type CreatedPageFilterValues = typeof CreatedPageFilterValues.Type;
const CreatedPageFilterValues = Schema.Struct(createdPageFilter);
