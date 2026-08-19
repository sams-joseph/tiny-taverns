import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TavernsApi } from "./Api.js";
import { CreatureSort } from "./Creature.js";
import { CreatedOrder, MAX_PAGE_SIZE, pageCursor, pageFilter } from "./Page.js";

const cursor = pageCursor(CreatureSort);
const decodeCursor = Schema.decodeUnknownSync(cursor);
const encodeCursor = Schema.encodeUnknownSync(cursor);

const filter = Schema.Struct(pageFilter(CreatureSort));
const decodeFilter = Schema.decodeUnknownSync(filter);

describe("a page cursor", () => {
  it("round-trips through one opaque parameter", () => {
    const value = { o: "cr", k: [0.25, "Goblin Boss", "5f4e"] } as const;
    const wire = encodeCursor(value);
    expect(typeof wire).toBe("string");
    // base64url, so it survives a query string untouched.
    expect(wire).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(wire)).toEqual(value);
  });

  // A forged or truncated cursor is a schema failure, which is a 400 — no
  // endpoint carries an error member for it and no repository checks one.
  it("refuses one that is not base64url", () => {
    expect(() => decodeCursor("not a cursor!!")).toThrow();
  });

  it("refuses one that does not carry the shape", () => {
    expect(() => decodeCursor(Buffer.from('"hello"').toString("base64url"))).toThrow();
  });

  // The ordering is part of the cursor and part of the schema, which is what
  // keeps a repository's lookup total: it never has to answer "what do I do with
  // an ordering I do not have".
  it("refuses an ordering this list does not offer", () => {
    const forged = Buffer.from(JSON.stringify({ o: "created", k: [] })).toString("base64url");
    expect(() => decodeCursor(forged)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(pageCursor(CreatedOrder))(
        Buffer.from(JSON.stringify({ o: "cr", k: [] })).toString("base64url"),
      ),
    ).toThrow();
  });
});

describe("the page filter", () => {
  it("is absent by default — the first page, at the list's own size", () => {
    expect(decodeFilter({})).toEqual({});
  });

  it("bounds what a caller may ask for in one answer", () => {
    expect(decodeFilter({ limit: MAX_PAGE_SIZE })).toEqual({ limit: MAX_PAGE_SIZE });
    expect(() => decodeFilter({ limit: MAX_PAGE_SIZE + 1 })).toThrow();
    expect(() => decodeFilter({ limit: 0 })).toThrow();
  });

  // The endpoint's own query schema, which is the one a request meets: a URL
  // carries strings, and `HttpApiEndpoint` wraps the declaration in
  // `Schema.toCodecStringTree` so every leaf accepts one. Worth asserting on the
  // real thing rather than on the declaration, because that wrapping is exactly
  // where the array defect lived.
  it("reads a limit and a cursor off a real query string", () => {
    const groups = TavernsApi.groups as unknown as Record<
      string,
      { readonly endpoints: Record<string, { readonly query: unknown }> } | undefined
    >;
    const query = groups.creatures?.endpoints.list?.query as Schema.Codec<unknown, unknown>;
    const wire = Schema.decodeUnknownSync(query)({
      limit: "25",
      cursor: encodeCursor({ o: "name", k: ["Goblin Boss", "5f4e"] }),
      environments: "Cave",
    });
    expect(wire).toEqual({
      limit: 25,
      cursor: { o: "name", k: ["Goblin Boss", "5f4e"] },
      environments: ["Cave"],
    });
  });
});
