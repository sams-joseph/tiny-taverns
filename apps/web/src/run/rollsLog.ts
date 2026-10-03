import {
  CombatantDamagedPayload,
  CombatantUpdatedPayload,
  DeathSavePayload,
  type Combatant,
  type CombatantId,
  type Roll,
  type SessionEvent,
} from "@taverns/api";
import { DateTime, Option, Schema } from "effect";
import { signed } from "../characters/rolls";
import type { DmLine, DmRoll, Tone } from "./dice";
import { SENTENCE } from "./logSentence";

/**
 * The fight's *Rolls* dock as one list (`Encounter Runner.dc.html`): the DM's
 * own dice, attacks and saves (`dice.ts`), the players' tray (both off
 * `rolls.list`) and the night's log off the stream, newest first.
 *
 * The log's hit-point, death-save and condition lines print their numbers —
 * "31 → 19 hp", "Con save DC 10", "Unconscious added" — from the payload shapes
 * `packages/api` declares for them (`SessionEventPayload.ts`); a line that does
 * not decode, and every other kind, is the sentence its `kind` says
 * (`logSentence.ts`). A `roll-made` line is the doorbell for a roll that is
 * already here as itself, so it is not printed twice.
 *
 * Lines are ordered by when they happened: a DM roll still on its way by this
 * browser's clock, everything else by the server's. The two agree to well
 * within a turn.
 */

/** One line of the dock, wherever it came from. */
export interface DockLine extends DmLine {
  readonly key: string;
  /** Epoch milliseconds. */
  readonly at: number;
}

/** The drawing keeps forty. */
export const DOCK_KEPT = 40;

/**
 * The act a DM roll belongs to: the throws of one act — an attack's to-hit and
 * its damage — are filed as `<stem>:0`, `<stem>:1` (`dice.ts`).
 */
export const stemOf = (requestId: string): string => requestId.split(":")[0] ?? requestId;

const decodeDamaged = Schema.decodeUnknownOption(CombatantDamagedPayload);
const decodeDeathSave = Schema.decodeUnknownOption(DeathSavePayload);
const decodeUpdated = Schema.decodeUnknownOption(CombatantUpdatedPayload);

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** `Unconscious added · Concentrating removed`, or nothing when nothing moved. */
const conditionsLine = (
  key: string,
  at: number,
  who: string,
  crossed: {
    readonly conditionsAdded?: ReadonlyArray<string> | undefined;
    readonly conditionsRemoved?: ReadonlyArray<string> | undefined;
  },
): ReadonlyArray<DockLine> => {
  const parts = [
    ...(crossed.conditionsAdded ?? []).map((condition) => `${condition} added`),
    ...(crossed.conditionsRemoved ?? []).map((condition) => `${condition} removed`),
  ];
  return parts.length === 0
    ? []
    : [
        {
          key: `${key}:conditions`,
          at,
          label: `${who} · Conditions`,
          detail: parts.join(" · "),
          tone: "magic",
        },
      ];
};

/** `31 → 19 hp`, or the after alone on a line logged before `hpBefore` was. */
const hpLine = (payload: CombatantDamagedPayload): string =>
  payload.hpBefore === undefined
    ? `${String(payload.hpCurrent)}/${String(payload.hpMax)} hp`
    : `${String(payload.hpBefore)} → ${String(payload.hpCurrent)} hp`;

const damagedLines = (
  key: string,
  at: number,
  who: string,
  payload: CombatantDamagedPayload,
): ReadonlyArray<DockLine> => {
  // Newest first within the line too: the save the hit set up is the latest
  // thing the DM has to say out loud.
  const lines: Array<DockLine> = [];
  if (payload.concentrationDc !== undefined) {
    lines.push({
      key: `${key}:concentration`,
      at,
      label: `${who} · Concentration check`,
      detail: `Con save DC ${String(payload.concentrationDc)}`,
      total: `DC ${String(payload.concentrationDc)}`,
      tone: "magic",
    });
  }
  lines.push(...conditionsLine(key, at, who, payload));
  if (payload.amount > 0) {
    lines.push({
      key,
      at,
      label: `${who} takes damage`,
      detail: payload.critical === true ? `${hpLine(payload)} · critical` : hpLine(payload),
      total: `−${String(payload.amount)}`,
      tone: "danger",
    });
  } else if (payload.amount < 0) {
    lines.push({
      key,
      at,
      label: `${who} is healed`,
      detail: hpLine(payload),
      total: `+${String(-payload.amount)}`,
      tone: "success",
    });
  }
  return lines;
};

const deathSaveLines = (
  key: string,
  at: number,
  who: string,
  payload: DeathSavePayload,
): ReadonlyArray<DockLine> => {
  const counts = `${plural(payload.successes, "success", "successes")} · ${plural(payload.failures, "failure", "failures")}`;
  const saves: DockLine =
    payload.face === undefined
      ? {
          key,
          at,
          label: `${who} · Death saves`,
          detail: payload.by === "player" ? `${counts} · marked on their sheet` : counts,
          tone: "muted",
        }
      : {
          key,
          at,
          label: `${who} · Death save`,
          detail:
            payload.face === 20
              ? "1d20 = 20 · back up with 1 hp"
              : payload.face === 1
                ? `1d20 = 1 · two failures · ${counts}`
                : `1d20 = ${String(payload.face)} · ${counts}`,
          total: String(payload.face),
          tone: payload.face >= 10 ? "success" : "danger",
        };
  return [...conditionsLine(key, at, who, payload), saves];
};

/** A log line as the dock prints it: its numbers when it has some, else its sentence. */
const eventLines = (
  event: SessionEvent,
  names: ReadonlyMap<CombatantId, string>,
  noun: string,
): ReadonlyArray<DockLine> => {
  if (event.kind === "roll-made") return [];
  const key = `event:${event.id}`;
  const at = DateTime.toEpochMillis(event.createdAt);
  const named = event.combatantId === null ? undefined : names.get(event.combatantId);
  const who = named ?? "Someone";
  const printed =
    event.kind === "combatant-damaged"
      ? Option.map(decodeDamaged(event.payload), (payload) => damagedLines(key, at, who, payload))
      : event.kind === "death-save"
        ? Option.map(decodeDeathSave(event.payload), (payload) =>
            deathSaveLines(key, at, who, payload),
          )
        : event.kind === "combatant-updated"
          ? Option.map(decodeUpdated(event.payload), (payload) =>
              conditionsLine(key, at, who, payload),
            )
          : Option.none();
  return Option.getOrElse(
    Option.filter(printed, (lines) => lines.length > 0),
    () => [
      { key, at, label: SENTENCE[event.kind](named, noun), detail: "", tone: "muted" as const },
    ],
  );
};

/** `Mara Voss · Brannoc Duskharrow`. */
const byline = (roll: Roll): string =>
  [roll.accountName, roll.characterName].filter((part) => part !== null && part !== "").join(" · ");

const trayLine = (roll: Roll): DockLine => ({
  key: `roll:${roll.id}`,
  at: DateTime.toEpochMillis(roll.createdAt),
  label: roll.label,
  detail: [
    byline(roll),
    `${roll.notation} [${roll.dice.join(", ")}]`,
    roll.mode === "normal" ? "" : roll.mode,
  ]
    .filter((part) => part !== "")
    .join(" · "),
  total: String(roll.total),
  tone: roll.critical === "hit" ? "success" : roll.critical === "miss" ? "danger" : "accent",
});

/** `d20 19 +7 = 26`, and `vs AC 17` (or `vs no AC`) when it was swung at someone. */
const hitDetail = (roll: DmRoll): string => {
  const thrown = `d20 ${String(roll.kept[0] ?? roll.total - roll.modifier)} ${signed(roll.modifier)} = ${String(roll.total)}`;
  if (roll.targetCombatantId === null) return thrown;
  return `${thrown} vs ${roll.targetAc === null ? "no AC" : `AC ${String(roll.targetAc)}`}`;
};

/** The verdict word, or the total for a swing with nothing to beat. */
const hitTotal = (roll: DmRoll): string =>
  roll.outcome === "crit"
    ? "Crit"
    : roll.outcome === "hit"
      ? "Hit"
      : roll.outcome === "miss" || roll.outcome === "fumble"
        ? "Miss"
        : String(roll.total);

const naturalTone = (roll: DmRoll): Tone =>
  roll.critical === "hit" ? "success" : roll.critical === "miss" ? "danger" : "accent";

const hitTone = (roll: DmRoll): Tone =>
  roll.outcome === "crit"
    ? "success"
    : roll.outcome === "hit"
      ? "accent"
      : roll.outcome === "fumble"
        ? "danger"
        : roll.outcome === "miss"
          ? "muted"
          : naturalTone(roll);

/** `1d20+4 [10]`: the notation and the faces, which is what a DM checks a total against. */
const faces = (roll: DmRoll): string => `${roll.notation} [${roll.dice.join(", ")}]`;

/**
 * One act the DM rolled, as one line: an attack's to-hit with the damage it
 * threw (`d20 19 +7 = 26 vs AC 17 · 1d8+4 = 9`), damage alone, or a die or a
 * save on its own. Its throws share a request stem (`stemOf`).
 */
const dmLine = (key: string, act: ReadonlyArray<DmRoll>): DockLine | undefined => {
  const [first] = act;
  if (first === undefined) return undefined;
  const at = Math.max(...act.map((roll) => roll.at));
  const hit = act.find((roll) => roll.kind === "attack");
  const damage = act.filter((roll) => roll.kind === "damage");
  const thrown = damage.map((roll) => `${roll.notation} = ${String(roll.total)}`);
  if (hit !== undefined) {
    return {
      key,
      at,
      label: hit.label,
      detail: [hitDetail(hit), ...thrown].join(" · "),
      total: hitTotal(hit),
      tone: hitTone(hit),
    };
  }
  if (damage.length > 0 && damage.length === act.length) {
    return {
      key,
      at,
      label: first.label,
      detail: thrown.join(" · "),
      total: String(damage.reduce((sum, roll) => sum + roll.total, 0)),
      tone: "accent",
    };
  }
  return {
    key,
    at,
    label: first.label,
    detail: faces(first),
    total: String(first.total),
    tone: first.kind === "concentration" ? "magic" : naturalTone(first),
  };
};

/** The DM's rolls as lines, each act's throws together. */
export const dmLines = (rolls: ReadonlyArray<DmRoll>): ReadonlyArray<DockLine> => {
  const acts = new Map<string, Array<DmRoll>>();
  rolls.forEach((roll, index) => {
    const key = roll.requestId === null ? `dm:#${String(index)}` : `dm:${stemOf(roll.requestId)}`;
    acts.set(key, [...(acts.get(key) ?? []), roll]);
  });
  return [...acts].flatMap(([key, act]) => dmLine(key, act) ?? []);
};

export const dockLines = ({
  dm,
  tray,
  events,
  combatants,
  noun,
}: {
  /** The DM's own rolls (`useDmDice`). */
  readonly dm: ReadonlyArray<DmRoll>;
  /** The players' rolls: the night's, less the DM's (`isDmRoll`). */
  readonly tray: ReadonlyArray<Roll>;
  /** Newest first, as the stream delivered them. */
  readonly events: ReadonlyArray<SessionEvent>;
  readonly combatants: ReadonlyArray<Combatant>;
  /** What the run is played as (`sceneNoun`), for a sentence that names it. */
  readonly noun: string;
}): ReadonlyArray<DockLine> => {
  const names = new Map<CombatantId, string>(
    combatants.map((combatant) => [combatant.id, combatant.displayName]),
  );
  return [
    ...dmLines(dm),
    ...tray.map(trayLine),
    ...events.flatMap((event) => eventLines(event, names, noun)),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, DOCK_KEPT);
};
