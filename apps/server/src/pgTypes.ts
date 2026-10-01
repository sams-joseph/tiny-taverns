import { PgTypes } from "@effect/sql-pg";
import { Result } from "effect";

/**
 * The binary codecs the server's Postgres client adds to `@effect/sql-pg`'s
 * built-in catalogue. Every client that reads the schema takes it: the server's
 * pool (`Database.layerClient`) and each test file's (`test/support/database.ts`).
 *
 * The native client (effect 4.0.0-rc.113 onward) asks for every result column
 * in binary and decodes an OID it has no codec for as UTF-8 text. That is right
 * for an enum and wrong for anything with a binary layout of its own, and a
 * decode failure closes the connection. The schema's one such type is
 * `tsvector`: the generated `search` columns, which every `select *` or
 * `table.*` over a searchable table returns.
 */
export const types: PgTypes.Registry = PgTypes.makeRegistry();

const TSVECTOR = 3614;
const TSVECTOR_ARRAY = 3643;

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** `tsvectorout`'s weight letters by the two high bits of a position; `D` is not written. */
const WEIGHTS = ["", "C", "B", "A"] as const;

/**
 * A `tsvector` in its binary form (`tsvectorsend`), as the text Postgres prints
 * for it (`tsvectorout`): the value the `pg` driver handed back. Nothing here
 * reads one, but a `select *` that cannot decode its row fails, so the column
 * still has to read as what it is.
 *
 * The layout is a lexeme count, then per lexeme its UTF-8 bytes and a NUL, a
 * position count, and that many 16-bit positions whose two high bits are the
 * weight.
 */
export const decodeTsvector = (bytes: Uint8Array): string => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getInt32(0);
  let offset = 4;
  const lexemes: Array<string> = [];
  for (let index = 0; index < count; index++) {
    const end = bytes.indexOf(0, offset);
    if (end < 0) throw new PgTypes.CodecError({ message: "tsvector lexeme is not terminated" });
    const lexeme = utf8.decode(bytes.subarray(offset, end));
    offset = end + 1;
    const positions = view.getUint16(offset);
    offset += 2;
    const written: Array<string> = [];
    for (let position = 0; position < positions; position++) {
      const entry = view.getUint16(offset);
      offset += 2;
      written.push(`${entry & 0x3fff}${WEIGHTS[entry >> 14]}`);
    }
    const quoted = `'${lexeme.replaceAll("'", "''").replaceAll("\\", "\\\\")}'`;
    lexemes.push(written.length === 0 ? quoted : `${quoted}:${written.join(",")}`);
  }
  return lexemes.join(" ");
};

types.register(
  TSVECTOR,
  {
    decode: (bytes) => {
      try {
        return Result.succeed(decodeTsvector(bytes));
      } catch (error) {
        return Result.fail(
          error instanceof PgTypes.CodecError
            ? error
            : new PgTypes.CodecError({ message: `Invalid tsvector: ${String(error)}` }),
        );
      }
    },
    // Never a parameter: the columns are generated, and a search is written
    // with `to_tsquery` over text.
    encode: () => Result.fail(new PgTypes.CodecError({ message: "tsvector is read, never sent" })),
  },
  { arrayOid: TSVECTOR_ARRAY },
);
