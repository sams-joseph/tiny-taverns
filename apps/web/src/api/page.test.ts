import type { Page, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { collectPages, WHOLE_LIST } from "./page";

/**
 * Following a cursor to the end.
 *
 * Worth its own test rather than leaving it to a screen: the callers are the
 * lists a screen needs **whole** — the campaign frame filters its notes and its
 * encounters in the browser — so a loop that stopped one page early would show
 * a DM a shorter list with nothing saying so, which is the failure mode that
 * looks exactly like working software.
 */

/** A list of `total` rows, served `size` at a time, counting the requests. */
const paged = (total: number, size: number) => {
  const rows = Array.from({ length: total }, (_, index) => index);
  const cursors: Array<ReadonlyArray<string | number | null>> = [];
  const read = (cursor: PageCursor<"created"> | undefined) => {
    const from = cursor === undefined ? 0 : Number(cursor.k[0]);
    cursors.push(cursor?.k ?? []);
    const items = rows.slice(from, from + size);
    const next = from + size;
    return Effect.succeed<Page<number, "created">>({
      items,
      nextCursor: next < total ? { o: "created", k: [next] } : null,
    });
  };
  return { read, cursors };
};

describe("collecting a paged list", () => {
  it("follows the cursor to the end and returns every row once", async () => {
    const { read, cursors } = paged(11, 4);
    const rows = await Effect.runPromise(collectPages(read));

    expect(rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Four requests: the last page is short and carries a null cursor, so there
    // is no wasted round trip after it.
    expect(cursors).toEqual([[], [4], [8]]);
  });

  it("is one request when the list fits in one page", async () => {
    const { read, cursors } = paged(3, 200);
    expect(await Effect.runPromise(collectPages(read))).toEqual([0, 1, 2]);
    expect(cursors).toEqual([[]]);
  });

  it("asks for as few round trips as the contract allows", () => {
    // A whole-list read is not a page size choice; it is the ceiling, because
    // the caller genuinely wants everything and the wire bounds the answer.
    expect(WHOLE_LIST).toBe(200);
  });

  it("stops rather than looping forever on a cursor that does not advance", async () => {
    // A guard rather than `while (true)`: a server bug that returned the same
    // cursor would otherwise hang a screen with nothing on it saying why.
    let calls = 0;
    const rows = await Effect.runPromise(
      collectPages((_cursor: PageCursor<"created"> | undefined) => {
        calls += 1;
        return Effect.succeed<Page<number, "created">>({
          items: [calls],
          nextCursor: { o: "created", k: [0] },
        });
      }),
    );

    expect(calls).toBe(100);
    expect(rows).toHaveLength(100);
  });

  it("fails with the read's own failure, so a screen still classifies it", async () => {
    const failure = await Effect.runPromise(
      Effect.result(
        collectPages((_cursor: PageCursor<"created"> | undefined) =>
          Effect.fail({ _tag: "NotFound" as const }),
        ),
      ),
    );

    expect(failure._tag).toBe("Failure");
  });
});
