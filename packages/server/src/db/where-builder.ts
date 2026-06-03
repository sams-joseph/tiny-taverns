import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type { Constructor, Fragment } from "effect/unstable/sql/Statement";

type FilterFunction = (() => Fragment) | ((value: never) => Fragment);

export type FilterRegistry = Record<string, FilterFunction>;

type FilterLeaf<Filters extends FilterRegistry> = {
  readonly [Name in keyof Filters]: Parameters<Filters[Name]> extends []
    ? { readonly [Key in Name]: true; }
    : Parameters<Filters[Name]> extends [infer Value] ? { readonly [Key in Name]: Value; }
    : never;
}[keyof Filters];

type NonEmptyArray<A> = readonly [A, ...Array<A>];

export type WhereExpression<Filters extends FilterRegistry> =
  | FilterLeaf<Filters>
  | { readonly and: NonEmptyArray<WhereExpression<Filters>>; }
  | { readonly or: NonEmptyArray<WhereExpression<Filters>>; };

export const makeWhereBuilder = <Filters extends FilterRegistry>(
  sql: Constructor,
  filters: Filters,
) => {
  const buildPredicate = (where: WhereExpression<Filters>): Effect.Effect<Fragment, Error> => {
    if (Object.hasOwn(where, "and")) {
      const group = where as { readonly and: NonEmptyArray<WhereExpression<Filters>>; };
      return group.and.length > 0
        ? Effect.map(Effect.all(Array.map(group.and, buildPredicate)), sql.and)
        : Effect.fail(new Error("where-builder: empty and group"));
    }

    if (Object.hasOwn(where, "or")) {
      const group = where as { readonly or: NonEmptyArray<WhereExpression<Filters>>; };
      return group.or.length > 0
        ? Effect.map(Effect.all(Array.map(group.or, buildPredicate)), sql.or)
        : Effect.fail(new Error("where-builder: empty or group"));
    }

    const entries = Object.entries(where);
    if (entries.length !== 1) {
      return Effect.fail(new Error("where-builder: leaf nodes must contain exactly one filter"));
    }

    const [name, value] = entries[0]!;
    const filter = filters[name];
    if (filter === undefined) {
      return Effect.fail(new Error(`where-builder: unknown filter ${name}`));
    }

    return Effect.succeed(
      filter.length === 0
        ? sql`(${(filter as () => Fragment)()})`
        : sql`(${filter(value as never)})`,
    );
  };

  return (where: WhereExpression<Filters> | undefined): Fragment =>
    where === undefined ? sql`` : sql`WHERE ${Effect.runSync(buildPredicate(where))}`;
};
