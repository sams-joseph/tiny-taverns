import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { TerminalResponse, TransientResponse, toolkit } from "./Toolkit.js";

const decodeSync = Schema.decodeUnknownSync;
const encodeSync = Schema.encodeUnknownSync;

describe("Toolkit", () => {
  it("wraps terminal responses", () => {
    const schema = TerminalResponse(Schema.String);
    const decoded = decodeSync(schema)("ok");

    expect(decoded).toEqual({ _tag: "Terminal", value: "ok" });
    expect(encodeSync(schema)(decoded)).toBe("ok");
  });

  it("wraps transient responses", () => {
    const schema = TransientResponse(Schema.Struct({ count: Schema.Int }));
    const decoded = decodeSync(schema)({ count: 2 });

    expect(decoded).toEqual({ _tag: "Transient", value: { count: 2 } });
    expect(encodeSync(schema)(decoded)).toEqual({ count: 2 });
  });

  it("exposes toolkit tools", () => {
    const toolNames = Object.keys(toolkit.tools);

    expect(toolNames).toContain("SearchMonsters");
    expect(toolNames).toContain("CreateMonster");
    expect(toolNames).toContain("CreateCampaign");
    expect(toolNames).toContain("SearchCampaigns");
    expect(toolNames).toContain("CreateEncounter");
  });
});
