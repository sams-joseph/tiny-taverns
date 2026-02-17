import { describe, expect, it } from "vitest";
import { ChatRpc } from "./ChatApi.js";

describe("ChatApi", () => {
  it("exposes ChatRpc toLayer", () => {
    expect(typeof ChatRpc.toLayer).toBe("function");
  });
});
