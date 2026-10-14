import type { NpcAttitude, NpcPersona } from "@taverns/api";

/**
 * What the fight's Hob is told of a member of the Cast it plays: who they
 * are, how they talk, what they want, how they stand toward the party, and how
 * the DM wants them played.
 *
 * **The public persona, the DM's attitude, and the DM's playing instructions,
 * and nothing else.** The NPC's `secrets`, its knowledge and its memories are
 * not parameters, so no caller can hand them in: what this prompt yields is a
 * narration and a spoken line the players hear, kept under autopilot after a
 * countdown nobody has to read. Leaving a secret out is the structural answer
 * (`npcPrompt.ts` makes the same choice for the NPC agent). The instructions
 * are the creator's own words about play, and the DM keeps every turn or lets
 * their own switch keep it.
 *
 * Bounded so the per-turn prompt stays a turn's: each field is cut to a line
 * or two and the whole to {@link FIGHT_PERSONA_MAX}.
 */
export interface FightPersona {
  readonly name: string;
  readonly role: string;
  readonly persona: NpcPersona;
  /** The DM's prep: how they stand toward the party now (`npc_prep.attitude`). */
  readonly attitude: NpcAttitude | null;
  /** `NpcPrivateMaterial.instructions`, alone: how the creator wants them played. */
  readonly instructions: string | undefined;
}

/** The most the persona adds to a turn's prompt, in characters. */
export const FIGHT_PERSONA_MAX = 1200;

const clip = (text: string | undefined, max: number): string | undefined => {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (trimmed === undefined || trimmed === "") return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

const listed = (lines: ReadonlyArray<string> | undefined, count: number, max: number) =>
  (lines ?? [])
    .slice(0, count)
    .map((line) => clip(line, max))
    .filter((line): line is string => line !== undefined);

export const fightPersonaText = (cast: FightPersona): string => {
  const { identity, voice, intent } = cast.persona;
  const phrases = listed(voice?.phrases, 3, 80);
  const examples = listed(voice?.exampleLines, 2, 160);
  const role = clip(cast.role, 120);
  const lines = [
    `This creature is ${cast.name}, a member of the campaign's cast${
      role === undefined ? "" : ` (${role})`
    }, fighting as themselves. Play them as the person they are: narrate what they do the ` +
      "way they would do it, and give them a line to say aloud when they would speak, in " +
      "their own voice. The stat block is how they fight, not who they are.",
    ...[
      ["Pronouns", clip(identity?.pronouns, 40)],
      ["Who they are", clip(identity?.summary, 300)],
      ["How they talk", clip(voice?.manner, 200)],
      ["Phrases", phrases.length === 0 ? undefined : phrases.map((line) => `"${line}"`).join(", ")],
      [
        "Lines they would say",
        examples.length === 0 ? undefined : examples.map((line) => `"${line}"`).join(" "),
      ],
      ["Wants", clip(intent?.wants, 160)],
      ["Fears", clip(intent?.fears, 160)],
      ["Loyal to", clip(intent?.loyalties, 160)],
      [
        "Toward the party",
        [cast.attitude ?? undefined, clip(intent?.attitude, 160)]
          .filter((part) => part !== undefined)
          .join("; ") || undefined,
      ],
      ["The DM says to play them", clip(cast.instructions, 300)],
    ].flatMap(([label, value]) => (value === undefined ? [] : [`${label}: ${value}`])),
  ];
  const text = lines.join("\n");
  return text.length <= FIGHT_PERSONA_MAX ? text : `${text.slice(0, FIGHT_PERSONA_MAX - 1)}…`;
};
