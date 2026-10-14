import { describe, expect, it } from "@effect/vitest";
import { FIGHT_PERSONA_MAX, fightPersonaText } from "../src/assistant/fightPersona.js";

/**
 * The persona a member of the Cast is played with in a fight: what it says,
 * what it leaves out, and how long it may grow. That no secret can reach it is
 * its signature's (`FightPersona` has no field for one); the request bytes are
 * `hob-cast-npc-turn.test.ts`'s.
 */
describe("a member of the Cast's fight persona", () => {
  it("says only what was written, under labels the model can read", () => {
    const text = fightPersonaText({
      name: "Sildar",
      role: "",
      persona: { voice: { manner: "Clipped." } },
      attitude: null,
      instructions: undefined,
    });
    expect(text.split("\n")).toEqual([
      expect.stringMatching(/^This creature is Sildar, a member of the campaign's cast, fighting/),
      "How they talk: Clipped.",
    ]);
  });

  it("joins the DM's attitude to the persona's, and keeps a long persona to a turn's size", () => {
    const long = "word ".repeat(2000);
    const text = fightPersonaText({
      name: "Sildar",
      role: long,
      persona: {
        identity: { summary: long },
        voice: {
          manner: long,
          phrases: [long, long, long, long],
          exampleLines: [long, long, long],
        },
        intent: { wants: long, fears: long, loyalties: long, attitude: "Wary of mages." },
      },
      attitude: "friendly",
      instructions: long,
    });
    expect(text.length).toBeLessThanOrEqual(FIGHT_PERSONA_MAX);
    expect(
      fightPersonaText({
        name: "Sildar",
        role: "",
        persona: { intent: { attitude: "Wary of mages." } },
        attitude: "friendly",
        instructions: undefined,
      }),
    ).toContain("Toward the party: friendly; Wary of mages.");
  });
});
