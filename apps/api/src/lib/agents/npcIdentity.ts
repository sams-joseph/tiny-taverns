import type { Character, NpcMetadata } from "@repo/domain";
import type { NpcAgentConfig } from "./NpcAgent.js";

const defaultNpcConfig: NpcAgentConfig = {
  role: "tavern regular",
  location: "a warm, bustling tavern",
  traits: ["curious", "plainspoken", "observant"],
  constraints: [
    "Stay within what the NPC would reasonably know.",
    "If uncertain, admit it in character instead of inventing facts.",
  ],
};

export const buildNpcIdentity = (character?: Character): NpcAgentConfig => {
  if (!character) {
    return defaultNpcConfig;
  }

  const metadata: NpcMetadata = character.npcMetadata ?? {};
  const constraints = [
    ...(defaultNpcConfig.constraints ?? []),
    ...(metadata.constraints ?? []),
  ];

  return {
    ...defaultNpcConfig,
    ...metadata,
    traits: metadata.traits ?? defaultNpcConfig.traits,
    constraints,
    name: character.name,
  };
};
