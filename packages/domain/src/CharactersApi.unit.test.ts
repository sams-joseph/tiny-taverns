import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  Character,
  CharacterIdFromString,
  CreateCharacterPayload,
  NpcMetadataJson,
} from "./CharactersApi.js";

const decodeSync = Schema.decodeUnknownSync;

describe("CharactersApi", () => {
  it("decodes CharacterId from UUID", () => {
    const value = decodeSync(CharacterIdFromString)(
      "0b7f3b8a-10cc-4ba4-8c6f-2e0a1f1a4a11",
    );

    expect(value).toBeDefined();
  });

  it("rejects non-UUID CharacterId", () => {
    expect(() => decodeSync(CharacterIdFromString)("not-a-uuid")).toThrow();
  });

  it("decodes NpcMetadataJson", () => {
    const metadata = decodeSync(NpcMetadataJson)(
      JSON.stringify({
        role: "bartender",
        location: "taproom",
        traits: ["friendly"],
        voice: "gravelly",
        constraints: ["no spoilers"],
      }),
    );

    expect(metadata).toEqual({
      role: "bartender",
      location: "taproom",
      traits: ["friendly"],
      voice: "gravelly",
      constraints: ["no spoilers"],
    });
  });

  it("decodes CreateCharacterPayload with npc metadata", () => {
    const payload = decodeSync(CreateCharacterPayload)({
      name: "Test NPC",
      kind: "npc",
      npcMetadata: JSON.stringify({
        role: "guard",
      }),
    });

    expect(payload.name).toBe("Test NPC");
    expect(payload.kind).toBe("npc");
  });

  it("decodes Character", () => {
    const character = decodeSync(Character)({
      id: "0b7f3b8a-10cc-4ba4-8c6f-2e0a1f1a4a11",
      name: "Test Character",
      kind: "npc",
      userId: null,
      npcMetadata: {
        role: "innkeeper",
      },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    expect(character.name).toBe("Test Character");
  });
});
