import type { CombatantId } from "@taverns/api";
import { describe, expect, it } from "vitest";
import {
  actingOf,
  legendaryDue,
  type Loop,
  type PilotCreature,
  type PilotEvent,
  type PilotFight,
  START,
  statusOf,
  step,
} from "./autopilotLoop";

/**
 * Hob's autopilot as a state machine: each transition, each reason it hands
 * the fight back, and the rule for when a legendary creature acts.
 */
const id = (name: string) => `2b1f2a1e-0000-4000-8000-${name.padStart(12, "0")}` as CombatantId;
const PC = id("1");
const GOBLIN = id("2");
const DRAGON = id("3");
const WOLF = id("4");

const creature = (overrides: Partial<PilotCreature> = {}): PilotCreature => ({
  canTakeTurn: true,
  canActLegendary: false,
  legendaryLeft: 0,
  recharging: [],
  ...overrides,
});

/** Brannoc, a goblin, a dragon with three legendary actions, a wolf; `activeId` up. */
const fight = (
  activeId: CombatantId | null,
  overrides: {
    readonly round?: number;
    readonly takingTurns?: boolean;
    readonly goblin?: Partial<PilotCreature>;
    readonly dragon?: Partial<PilotCreature>;
    readonly wolf?: Partial<PilotCreature>;
    readonly out?: ReadonlyArray<CombatantId>;
  } = {},
): PilotFight => ({
  round: overrides.round ?? 1,
  activeId,
  takingTurns: overrides.takingTurns ?? true,
  order: [
    { id: PC, name: "Brannoc", kind: "pc", out: false },
    { id: GOBLIN, name: "Goblin", kind: "npc", out: overrides.out?.includes(GOBLIN) ?? false },
    { id: DRAGON, name: "Dragon", kind: "npc", out: overrides.out?.includes(DRAGON) ?? false },
    { id: WOLF, name: "Wolf", kind: "npc", out: overrides.out?.includes(WOLF) ?? false },
  ],
  creatures: new Map([
    [GOBLIN, creature(overrides.goblin)],
    [DRAGON, creature({ canActLegendary: true, legendaryLeft: 3, ...overrides.dragon })],
    [WOLF, creature(overrides.wolf)],
  ]),
});

const run = (from: Loop, ...events: ReadonlyArray<PilotEvent>): Loop =>
  events.reduce((loop, event) => step(loop, event), from);

const sees = (
  activeId: CombatantId | null,
  overrides?: Parameters<typeof fight>[1],
): PilotEvent => ({
  kind: "fight",
  fight: fight(activeId, overrides),
});

describe("the autopilot's loop", () => {
  it("waits on a party member's turn", () => {
    const loop = run(START, sees(PC));
    expect(loop).toEqual({ phase: "idle", turn: `1:${PC}` });
    // The same marker seen again changes nothing.
    expect(step(loop, sees(PC))).toBe(loop);
  });

  it("does nothing while the fight is not taking turns", () => {
    expect(run(START, sees(GOBLIN, { takingTurns: false }))).toEqual({
      phase: "idle",
      turn: undefined,
    });
  });

  it("takes a monster's turn: ask, keep, a countdown, then the next turn", () => {
    const asking = run(START, sees(GOBLIN));
    expect(asking).toMatchObject({ phase: "asking", act: { combatantId: GOBLIN, moment: "turn" } });
    expect(actingOf(asking)).toBe(GOBLIN);

    const keeping = step(asking, { kind: "offered", turnId: "t1" });
    expect(keeping).toMatchObject({ phase: "keeping", turnId: "t1" });

    const counting = step(keeping, { kind: "kept", pendingSaves: 0 });
    expect(counting).toMatchObject({ phase: "counting", act: { combatantId: GOBLIN } });

    // The dragon has spent its legendary actions, so the marker moves on, from the goblin.
    const advancing = step(counting, {
      kind: "countdownDone",
      fight: fight(GOBLIN, { dragon: { legendaryLeft: 0 } }),
    });
    expect(advancing).toEqual({ phase: "advancing", turn: `1:${GOBLIN}`, from: GOBLIN });

    const idle = step(advancing, { kind: "advanced" });
    expect(idle.phase).toBe("idle");
    // The next creature up is the dragon: its own turn starts.
    expect(step(idle, sees(DRAGON))).toMatchObject({
      phase: "asking",
      act: { combatantId: DRAGON, moment: "turn" },
    });
  });

  it("rolls a spent recharge before it asks", () => {
    const recharging = run(START, sees(GOBLIN, { goblin: { recharging: ["actions/Breath"] } }));
    expect(recharging).toMatchObject({ phase: "recharging", act: { combatantId: GOBLIN } });
    expect(step(recharging, { kind: "recharged", fight: fight(GOBLIN) })).toMatchObject({
      phase: "asking",
    });
  });

  it("counts down without asking for a creature that can do nothing", () => {
    const loop = run(START, sees(GOBLIN, { goblin: { canTakeTurn: false } }));
    expect(loop).toMatchObject({ phase: "counting", note: "Goblin can do nothing this turn." });
  });

  it("waits on pending saves, and goes on once they are settled", () => {
    const waiting = run(
      START,
      sees(GOBLIN),
      { kind: "offered", turnId: "t1" },
      {
        kind: "kept",
        pendingSaves: 2,
      },
    );
    expect(waiting).toMatchObject({ phase: "saves", turnId: "t1" });
    expect(statusOf(waiting, () => "")).toMatch(/saves/);
    expect(step(waiting, { kind: "savesSettled" })).toMatchObject({ phase: "counting" });
  });

  it("takes a legendary action at the end of a party member's turn, then advances", () => {
    const idle = run(START, sees(PC));
    const asking = step(idle, { kind: "endTurn", fight: fight(PC) });
    expect(asking).toMatchObject({
      phase: "asking",
      act: { combatantId: DRAGON, moment: "legendary" },
      queue: [],
    });
    expect(actingOf(asking)).toBe(DRAGON);
    const counting = run(
      asking,
      { kind: "offered", turnId: "l1" },
      { kind: "kept", pendingSaves: 0 },
    );
    expect(step(counting, { kind: "countdownDone", fight: fight(PC) })).toEqual({
      phase: "advancing",
      turn: `1:${PC}`,
      from: PC,
    });
  });

  it("advances at once from a party member's turn when no legendary action is due", () => {
    const idle = run(START, sees(PC));
    expect(
      step(idle, { kind: "endTurn", fight: fight(PC, { dragon: { legendaryLeft: 0 } }) }),
    ).toEqual({ phase: "advancing", turn: `1:${PC}`, from: PC });
  });

  it("pauses when Hob offers nothing, and holds the turn until the marker moves", () => {
    const paused = run(START, sees(GOBLIN), {
      kind: "noOffer",
      sentence: "Hob could not answer: the server did not respond.",
      unavailable: false,
    });
    expect(paused).toMatchObject({ phase: "paused", reason: { kind: "hob" } });
    expect(statusOf(paused, () => "")).toBe(
      "Autopilot is paused: Hob could not answer: the server did not respond.",
    );
    expect(step(paused, sees(GOBLIN))).toBe(paused);
    // The DM took the turn by hand and moved on: the next monster is the loop's.
    expect(step(paused, sees(DRAGON))).toMatchObject({
      phase: "asking",
      act: { combatantId: DRAGON },
    });
  });

  it("pauses as unavailable when Hob is off, and holds past the turn", () => {
    const paused = run(START, sees(GOBLIN), {
      kind: "noOffer",
      sentence: "Hob is not configured.",
      unavailable: true,
    });
    expect(paused).toMatchObject({ phase: "paused", reason: { kind: "unavailable" } });
    expect(step(paused, sees(DRAGON))).toBe(paused);
  });

  it("pauses on a Conflict at the keep, and Resume asks again", () => {
    const paused = run(
      START,
      sees(GOBLIN),
      { kind: "offered", turnId: "t1" },
      {
        kind: "keepFailed",
        sentence: "Nothing was kept: the fight has moved since Hob read it; ask Hob again.",
        conflict: true,
      },
    );
    expect(paused).toMatchObject({ phase: "paused", reason: { kind: "conflict" } });
    expect(step(paused, { kind: "resume", fight: fight(GOBLIN) })).toMatchObject({
      phase: "asking",
      act: { combatantId: GOBLIN },
    });
  });

  it("pauses when the advance is refused", () => {
    const advancing = run(
      START,
      sees(GOBLIN),
      { kind: "offered", turnId: "t1" },
      {
        kind: "kept",
        pendingSaves: 0,
      },
      { kind: "countdownDone", fight: fight(GOBLIN, { dragon: { legendaryLeft: 0 } }) },
    );
    expect(
      step(advancing, { kind: "advanceFailed", sentence: "the turn has already moved on." }),
    ).toMatchObject({ phase: "paused", reason: { kind: "conflict" } });
  });

  it("pauses on the DM's hand mid-turn, never on a party member's turn", () => {
    expect(step(run(START, sees(GOBLIN)), { kind: "hand" })).toMatchObject({
      phase: "paused",
      reason: { kind: "hand" },
    });
    const idle = run(START, sees(PC));
    expect(step(idle, { kind: "hand" })).toBe(idle);
  });

  it("pauses when the marker is moved elsewhere mid-turn", () => {
    expect(step(run(START, sees(GOBLIN)), sees(WOLF))).toMatchObject({
      phase: "paused",
      reason: { kind: "hand" },
    });
  });

  it("pauses when the live connection drops, and holds until Resume", () => {
    const paused = step(run(START, sees(GOBLIN)), { kind: "streamLost" });
    expect(paused).toMatchObject({ phase: "paused", reason: { kind: "stream" } });
    expect(step(paused, sees(DRAGON))).toBe(paused);
    expect(step(paused, { kind: "resume", fight: fight(DRAGON) })).toMatchObject({
      phase: "asking",
      act: { combatantId: DRAGON },
    });
  });

  it("stops on Stop, keeps an answer that lands, and Resume carries on from it", () => {
    const stopped = step(run(START, sees(GOBLIN), { kind: "offered", turnId: "t1" }), {
      kind: "stop",
    });
    expect(stopped).toMatchObject({ phase: "paused", reason: { kind: "stopped" } });
    const landed = step(stopped, { kind: "kept", pendingSaves: 0 });
    expect(landed).toMatchObject({ phase: "paused", back: { phase: "counting" } });
    expect(step(landed, { kind: "resume", fight: fight(GOBLIN) })).toMatchObject({
      phase: "counting",
    });
  });

  it("keeps an offer that lands after Stop for Resume to keep", () => {
    const stopped = step(run(START, sees(GOBLIN)), { kind: "stop" });
    const offered = step(stopped, { kind: "offered", turnId: "t1" });
    expect(step(offered, { kind: "resume", fight: fight(GOBLIN) })).toMatchObject({
      phase: "keeping",
      turnId: "t1",
    });
  });

  it("pauses on Undo, and Resume asks for the same act again", () => {
    const counting = run(
      START,
      sees(GOBLIN),
      { kind: "offered", turnId: "t1" },
      {
        kind: "kept",
        pendingSaves: 0,
      },
    );
    const undone = step(counting, { kind: "undone" });
    expect(undone).toMatchObject({ phase: "paused", reason: { kind: "undone" } });
    expect(step(undone, { kind: "resume", fight: fight(GOBLIN) })).toMatchObject({
      phase: "asking",
      act: { combatantId: GOBLIN, moment: "turn" },
    });
  });

  it("starts from whoever is up when the marker moved while it was paused", () => {
    const stopped = step(run(START, sees(GOBLIN)), { kind: "stop" });
    expect(step(stopped, { kind: "resume", fight: fight(PC) })).toEqual({
      phase: "idle",
      turn: `1:${PC}`,
    });
  });

  it("treats Next turn during the countdown as Next now", () => {
    const counting = run(
      START,
      sees(GOBLIN),
      { kind: "offered", turnId: "t1" },
      {
        kind: "kept",
        pendingSaves: 0,
      },
    );
    expect(
      step(counting, { kind: "endTurn", fight: fight(GOBLIN, { dragon: { legendaryLeft: 0 } }) }),
    ).toMatchObject({
      phase: "advancing",
    });
  });
});

describe("when a legendary creature acts", () => {
  it("answers the party: after every party member's turn while it has actions", () => {
    expect(legendaryDue(fight(PC), PC)).toEqual([DRAGON]);
    expect(legendaryDue(fight(PC, { dragon: { legendaryLeft: 0 } }), PC)).toEqual([]);
    expect(legendaryDue(fight(PC, { dragon: { canActLegendary: false } }), PC)).toEqual([]);
  });

  it("spends what would otherwise be wasted before its own turn", () => {
    // After the wolf, three turn ends are left before the dragon's own (the wolf's,
    // Brannoc's and the goblin's): three for three actions.
    expect(legendaryDue(fight(WOLF), WOLF)).toEqual([DRAGON]);
    // After the goblin, its own turn is next: one end left, and three actions.
    expect(legendaryDue(fight(GOBLIN), GOBLIN)).toEqual([DRAGON]);
    // After the goblin with none to spare.
    expect(legendaryDue(fight(GOBLIN, { dragon: { legendaryLeft: 0 } }), GOBLIN)).toEqual([]);
  });

  it("waits while it has fewer actions than turn ends left", () => {
    // After its own turn, the dragon is not asked; after the wolf with one action, it is
    // three ends from its turn and waits.
    expect(legendaryDue(fight(DRAGON), DRAGON)).toEqual([]);
    expect(legendaryDue(fight(WOLF, { dragon: { legendaryLeft: 1 } }), WOLF)).toEqual([]);
  });

  it("does not count a creature at zero as a turn end", () => {
    // With the goblin down, after the wolf: the wolf's end and Brannoc's are all that is
    // left before the dragon, so two actions are due, not three.
    expect(
      legendaryDue(fight(WOLF, { out: [GOBLIN], dragon: { legendaryLeft: 2 } }), WOLF),
    ).toEqual([DRAGON]);
  });
});
