import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SRD_FIXTURE_PATH, srdFixture } from "./support/srdFixture.js";

describe("the SRD stat blocks the NPC turn options are tested on", () => {
  it("are what the import writes today", () => {
    // Out of date: `pnpm -F server exec tsx test/support/srdFixture.ts`.
    // Compared as data, so the formatter's layout of the file is not a difference.
    expect(JSON.parse(readFileSync(SRD_FIXTURE_PATH, "utf8"))).toEqual(
      JSON.parse(JSON.stringify(srdFixture())),
    );
  });
});
