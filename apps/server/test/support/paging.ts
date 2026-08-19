import type { Page } from "@taverns/api";
import { Effect } from "effect";

/**
 * A paged read's rows, for the assertions that are about *which* rows.
 *
 * Most of this suite predates pagination and asks a list what it contains, not
 * where it stops; wrapping those reads keeps them saying what they always said.
 * The page boundaries themselves are `paging.test.ts`, which reads the cursor
 * rather than dropping it.
 */
export const items = <A, E, R>(
  effect: Effect.Effect<Page<A, string>, E, R>,
): Effect.Effect<ReadonlyArray<A>, E, R> => Effect.map(effect, (page) => page.items);
