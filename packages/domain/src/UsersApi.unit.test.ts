import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { CreateUserPayload, User, UserIdFromString } from "./UsersApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("UsersApi", () => {
  it("decodes UserId from UUID", () => {
    const value = decodeSync(UserIdFromString)(
      "f2c6e3f4-2f20-4f05-9a08-6d4d7a0b9a90",
    );

    expect(value).toBeDefined();
  });

  it("rejects invalid UserId", () => {
    expect(() => decodeSync(UserIdFromString)("bad-id")).toThrow();
  });

  it("decodes CreateUserPayload", () => {
    const payload = decodeSync(CreateUserPayload)({
      name: "Test User",
    });

    expect(payload.name).toBe("Test User");
  });

  it("rejects empty user name", () => {
    expect(() => decodeSync(CreateUserPayload)({ name: " " })).toThrow();
  });

  it("decodes User", () => {
    const user = decodeSync(User)({
      id: "f2c6e3f4-2f20-4f05-9a08-6d4d7a0b9a90",
      name: "Test User",
    });

    expect(user.name).toBe("Test User");
  });
});
