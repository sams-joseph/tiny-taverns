import { describe, expect, it } from "vitest";
import { SENTENCE } from "./logSentence";

const door = (over: Record<string, unknown>) => ({
  wallId: "w",
  wallKind: "door",
  doorState: "closed",
  revealed: false,
  wasDoorState: "closed",
  wasRevealed: false,
  ...over,
});

describe("a level's log lines", () => {
  const doorLine = (payload: unknown) =>
    SENTENCE["board-door-updated"](undefined, "fight", payload);
  const lightLine = (payload: unknown) =>
    SENTENCE["board-light-updated"](undefined, "fight", payload);

  it("say what happened to which kind of door", () => {
    expect(doorLine(door({ doorState: "locked" }))).toBe("A door was locked");
    expect(doorLine(door({ doorState: "open" }))).toBe("A door was opened");
    expect(doorLine(door({ wasDoorState: "locked" }))).toBe("A door was unlocked");
    expect(doorLine(door({ wallKind: "secretDoor", revealed: true }))).toBe(
      "A secret door was found",
    );
    expect(doorLine(door({ wallKind: "secretDoor", wasRevealed: true }))).toBe(
      "A secret door was hidden again",
    );
    expect(doorLine(door({ wallKind: "secretDoor", doorState: "open" }))).toBe(
      "A secret door was opened",
    );
  });

  it("name a light by its preset, or say a light", () => {
    expect(lightLine({ lightId: "l", lit: true, preset: "torch" })).toBe("A torch was lit");
    expect(lightLine({ lightId: "l", lit: false, preset: "lamp" })).toBe("A lamp was snuffed");
    expect(lightLine({ lightId: "l", lit: false, preset: null })).toBe("A light was snuffed");
  });

  it("fall back to the general line for one logged before they said which", () => {
    expect(doorLine({ wallId: "w", doorState: "open", revealed: false })).toBe(
      "A door on the level changed",
    );
    expect(lightLine({ lightId: "l", lit: true })).toBe("A light on the level was lit or snuffed");
  });
});
