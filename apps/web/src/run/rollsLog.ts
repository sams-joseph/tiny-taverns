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
import type { DmEntry, DmLine } from "./dice";
import { SENTENCE } from "./logSentence";

/**
 * The fight's *Rolls* dock as one list (`Encounter Runner.dc.html`): the DM's
 * own dice and attacks (`dice.ts`, this tab's alone), the players' tray
 * (`rolls.list`, durable) and the night's log off the stream, newest first.
 *
 * The log's hit-point, death-save and condition lines print their numbers —
 * "31 → 19 hp", "Con save DC 10", "Unconscious added" — from the payload shapes
 * `packages/api` declares for them (`SessionEventPayload.ts`); a line that does
 * not decode, and every other kind, is the sentence its `kind` says
 * (`logSentence.ts`). A `roll-made` line is the doorbell for a tray roll that
 * is already here as itself, so it is not printed twice.
 *
 * Lines are ordered by when they happened: the DM's by this browser's clock,
 * the server's by its own. The two agree to well within a turn.
 */

/** One line of the dock, wherever it came from. */
export interface DockLine extends DmLine {
  readonly key: string;
  /** Epoch milliseconds. */
  readonly at: number;
}

/** The drawing keeps forty. */
export const DOCK_KEPT = 40;

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
          ? Option.flatMap(decodeUpdated(event.payload), (payload) => {
              const lines = conditionsLine(key, at, who, payload);
              return lines.length === 0 ? Option.none() : Option.some(lines);
            })
          : Option.none();
  return Option.getOrElse(printed, () => [
    { key, at, label: SENTENCE[event.kind](named, noun), detail: "", tone: "muted" as const },
  ]);
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

const dmLine = (entry: DmEntry): DockLine => ({ ...entry, key: `dm:${String(entry.id)}` });

export const dockLines = ({
  dm,
  tray,
  events,
  combatants,
  noun,
}: {
  readonly dm: ReadonlyArray<DmEntry>;
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
    ...dm.map(dmLine),
    ...tray.map(trayLine),
    ...events.flatMap((event) => eventLines(event, names, noun)),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, DOCK_KEPT);
};
