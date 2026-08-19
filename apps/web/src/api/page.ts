import { MAX_PAGE_SIZE, type Page, type PageCursor } from "@taverns/api";
import { Effect } from "effect";

/**
 * Reading a paged list to the end.
 *
 * **Not every screen wants a page.** The bestiary does — it is the corpus that
 * grows fastest, and its grid pages as the DM asks for more (see
 * `bestiary/corpus.ts`). The rest of the lists here are things a screen needs
 * *whole*: the campaign frame filters its encounters and its notes in the
 * browser, deliberately, and a creature picker turns a roster's ids into names.
 * A filter applied to one page is not a filter on the list, so those callers
 * follow the cursor rather than pretending the first page is the answer.
 *
 * The cost is stated rather than hidden: a campaign with three hundred notes is
 * two requests where it was one. What it buys is that the *endpoint* is bounded
 * — no single answer is ever the whole corpus, however large it grows — and
 * that a screen which does start paging incrementally is changing how it reads,
 * not what the server offers.
 *
 * `LIMIT` is the contract's ceiling, so this is as few round trips as the wire
 * allows.
 */
export const collectPages = <A, Ordering extends string, E, R>(
  read: (cursor: PageCursor<Ordering> | undefined) => Effect.Effect<Page<A, Ordering>, E, R>,
): Effect.Effect<ReadonlyArray<A>, E, R> =>
  Effect.gen(function* () {
    const rows: Array<A> = [];
    let cursor: PageCursor<Ordering> | undefined = undefined;
    // Bounded rather than `while (true)`: a cursor that stopped advancing would
    // otherwise hang a screen with nothing on it saying why. At the contract's
    // page size this is a corpus of twenty thousand, well past anything a
    // screen that wants a whole list should be reading in one go.
    for (let guard = 0; guard < 100; guard++) {
      const page: Page<A, Ordering> = yield* read(cursor);
      rows.push(...page.items);
      if (page.nextCursor === null) return rows;
      cursor = page.nextCursor;
    }
    return rows;
  });

/** The page size a whole-list read asks for: the largest the contract allows. */
export const WHOLE_LIST = MAX_PAGE_SIZE;
