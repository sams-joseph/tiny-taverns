import type { CampaignCharacterId, CampaignMember, CharacterSheet, PartySeat } from "@taverns/api";
import { partyLevel } from "../campaign/overview";
import {
  hitPoints,
  hpBand,
  hpFraction,
  lineageLine,
  passiveOf,
  passivePerceptionOf,
  type HpBand,
} from "../characters/sheet";

/**
 * What the Party screen works out before it draws a card, the header or the
 * passives table.
 *
 * Pure and separately tested, for `characters/sheet.ts`'s reason: a stat tile
 * stubbed with a dash, a header that calls a character *low* while the bar
 * calls them *down*, and a highlight that picks one of two tied bests all
 * render perfectly well. Every figure comes from `party.list`'s whole
 * `Character` (and, for the player's name, the creator's `members.list`), and
 * each is absent when the character does not answer it — never a dash.
 */

/** One of the four tiles under a card's hit points, in the drawn order. */
export interface StatTile {
  readonly key: "ac" | "speed" | "spellDc" | "passive";
  readonly label: string;
  /** As the card draws it: the DC as written, the speed as its figure in feet. */
  readonly value: string;
}

/**
 * A card: a seat with a character behind it, or a seat whose character has
 * been deleted.
 *
 * Discriminated rather than one shape with nullable numbers, for `RosterRow`'s
 * reason: a deleted character has no hit points to draw, and a union says so
 * where a nullable field only hopes.
 */
export type SeatCard =
  | {
      readonly kind: "character";
      readonly seatId: CampaignCharacterId;
      readonly name: string;
      /** `"Half-orc Paladin 5 · Oath of Devotion"` */
      readonly lineage: string | undefined;
      readonly player: string | undefined;
      /** `hitPoints`' words: `"44 / 52"`, `"52"`, or absent. */
      readonly hp: string | undefined;
      /** The bar's fill and its band, when there is a max to fill against. */
      readonly fraction: number | undefined;
      readonly band: HpBand | undefined;
      readonly tempHp: number;
      readonly stats: ReadonlyArray<StatTile>;
      /** The DM's own words, in their order; nothing branches on them. */
      readonly conditions: ReadonlyArray<string>;
    }
  | {
      readonly kind: "deleted";
      readonly seatId: CampaignCharacterId;
      /** The seat's snapshot: what the table called them. */
      readonly name: string;
      readonly player: string | undefined;
    };

const present = (text: string | null | undefined): string | undefined => {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

/**
 * Who plays the seat: the name the table gave the player, else the name the
 * character's owner wrote, else — for the creator, who alone reads
 * `members.list` — the account's own name.
 */
const playerOf = (row: PartySeat, member: CampaignMember | undefined): string | undefined =>
  present(row.seat.playerDisplayName) ??
  present(row.character?.playerName) ??
  present(member?.name);

/**
 * `"Half-orc Paladin 5 · Oath of Devotion"`: the lineage, the level, then the
 * subclass. Each part is left out when unwritten; a character with none of
 * them has no line.
 */
const lineageOf = (character: NonNullable<PartySeat["character"]>): string | undefined => {
  const lineage = lineageLine(character);
  const level = character.level === null ? undefined : String(character.level);
  // No lineage leaves a bare number meaning nothing, so the level says what it is.
  const head =
    lineage === undefined
      ? level === undefined
        ? undefined
        : `Level ${level}`
      : [lineage, level].filter((part) => part !== undefined).join(" ");
  const subclass = present(character.sheet.identity?.subclass);
  return [head, subclass].filter((part) => part !== undefined).join(" · ") || undefined;
};

/**
 * `"30 ft."` → 30: a speed written as one walking figure in feet. Anything more
 * (`"30 ft., fly 60 ft."`) or anything else has no single figure and is
 * undefined, so the tile says it as written.
 */
export const feetOf = (speed: string | undefined): number | undefined => {
  const match = speed?.trim().match(/^(\d+)\s*(?:ft\.?|feet)$/i);
  return match === null || match === undefined ? undefined : Number(match[1]);
};

const statsOf = (character: NonNullable<PartySeat["character"]>): ReadonlyArray<StatTile> => {
  const speed = present(character.sheet.identity?.speed);
  const spellDc = present(character.sheet.spellcasting?.save);
  const passive = passivePerceptionOf(character.sheet);
  return [
    ...(character.ac === null
      ? []
      : [{ key: "ac", label: "AC", value: String(character.ac) } as const]),
    // The bare figure where the sheet wrote one, as the drawing's tile does: a
    // quarter of a card has no room for the unit, and every speed here is feet.
    ...(speed === undefined
      ? []
      : [{ key: "speed", label: "Speed", value: String(feetOf(speed) ?? speed) } as const]),
    ...(spellDc === undefined
      ? []
      : [{ key: "spellDc", label: "Spell DC", value: spellDc } as const]),
    ...(passive === undefined
      ? []
      : [{ key: "passive", label: "Passive", value: String(passive) } as const]),
  ];
};

/**
 * The card for one seat. `member` is the seat's account from `members.list`,
 * which only the creator reads; without it the player falls back to the seat
 * and the character.
 */
export const seatCard = (row: PartySeat, member?: CampaignMember): SeatCard => {
  const player = playerOf(row, member);
  const character = row.character;
  if (character === null) {
    return { kind: "deleted", seatId: row.seat.id, name: row.seat.displayName, player };
  }
  const fraction = hpFraction(character.hpCurrent, character.hpMax);
  return {
    kind: "character",
    seatId: row.seat.id,
    name: character.name,
    lineage: lineageOf(character),
    player,
    hp: hitPoints(character.hpCurrent, character.hpMax),
    fraction,
    band: fraction === undefined ? undefined : hpBand(fraction),
    tempHp: character.tempHp,
    stats: statsOf(character),
    conditions: character.conditions,
  };
};

/** The header's line: how many, what level, the hit points and who is hurting. */
export interface PartySummary {
  /** Seats with a character behind them; a deleted character is not in the party. */
  readonly characters: number;
  /** `partyLevel`'s answer — one level, or the span. */
  readonly level: string | undefined;
  /**
   * The summed hit points of the seats that have a max. A null current counts
   * as the max, the rule `hpFraction` draws the bar by. Absent when no seat has
   * a max at all.
   */
  readonly hp: { readonly current: number; readonly max: number } | undefined;
  /** Names in the `low` band, and in the `down` band — the bar's own rule. */
  readonly low: ReadonlyArray<string>;
  readonly down: ReadonlyArray<string>;
}

export const partySummary = (party: ReadonlyArray<PartySeat>): PartySummary => {
  const characters = party.flatMap((row) => (row.character === null ? [] : [row.character]));
  const counted = characters.flatMap((character) =>
    character.hpMax === null || character.hpMax <= 0
      ? []
      : [{ current: character.hpCurrent ?? character.hpMax, max: character.hpMax }],
  );
  const inBand = (band: HpBand) =>
    characters.flatMap((character) => {
      const fraction = hpFraction(character.hpCurrent, character.hpMax);
      return fraction !== undefined && hpBand(fraction) === band ? [character.name] : [];
    });
  return {
    characters: characters.length,
    level: partyLevel(party),
    hp:
      counted.length === 0
        ? undefined
        : {
            current: counted.reduce((sum, hp) => sum + hp.current, 0),
            max: counted.reduce((sum, hp) => sum + hp.max, 0),
          },
    low: inBand("low"),
    down: inBand("down"),
  };
};

/**
 * The header's line, as one string: `"4 characters · Lvl 5 · 125 / 159 hp ·
 * Tamsin is low"`. Each part is left out when the party cannot answer it, and
 * the last says who is hurting by the bar's own bands, so the header and the
 * cards cannot disagree about who is low. A party with no characters has no
 * line: the empty state under it is already saying so.
 */
export const summaryLine = (summary: PartySummary): string | undefined => {
  if (summary.characters === 0) return undefined;
  const hurting = [
    ...(summary.down.length === 0 ? [] : [`${names(summary.down)} ${isAre(summary.down)} down`]),
    ...(summary.low.length === 0 ? [] : [`${names(summary.low)} ${isAre(summary.low)} low`]),
  ];
  return [
    `${String(summary.characters)} character${summary.characters === 1 ? "" : "s"}`,
    ...(summary.level === undefined ? [] : [summary.level]),
    ...(summary.hp === undefined
      ? []
      : [`${String(summary.hp.current)} / ${String(summary.hp.max)} hp`]),
    // Said only when there is a bar to have read it off.
    ...(summary.hp === undefined
      ? []
      : [hurting.length === 0 ? "Everyone's on their feet" : hurting.join(", ")]),
  ].join(" · ");
};

/** `"Tamsin"`, `"Tamsin and Odo"`, `"Tamsin, Odo and Wren"`. */
const names = (list: ReadonlyArray<string>): string =>
  list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)!}`;

const isAre = (list: ReadonlyArray<string>): string => (list.length === 1 ? "is" : "are");

/**
 * Where a character's current hit points land after a signed delta — positive
 * damages, negative heals — by the server's own clamp (`clampedCharacterHp`,
 * `apps/server/src/repo/vitals.ts`): a null current counts down from the max,
 * and the result stays within zero and the max. Temporary hit points are not
 * spent by it, because the server does not spend them.
 *
 * It is what lets a card show a press before the write returns, and show
 * exactly the number the write will produce.
 */
export const hpAfter = (
  character: { readonly hpCurrent: number | null; readonly hpMax: number | null },
  amount: number,
): number =>
  Math.max(
    0,
    Math.min(character.hpMax ?? MAX_HP, (character.hpCurrent ?? character.hpMax ?? 0) - amount),
  );

/** The column's own bound, the ceiling the server clamps to when there is no max. */
const MAX_HP = 10_000;

/**
 * The delta a card owes the server after one more press of − or +.
 *
 * Presses add up into one delta, sent once the DM pauses. A press that would
 * move nothing (a heal at full, a hit at zero) leaves the delta alone, so the
 * delta always says what the screen shows: + at full then − is one hit point
 * down, as it looks, not a net zero.
 */
export const pressed = (
  character: { readonly hpCurrent: number | null; readonly hpMax: number | null },
  owed: number,
  press: "damage" | "heal",
): number => {
  const next = owed + (press === "damage" ? 1 : -1);
  return hpAfter(character, next) === hpAfter(character, owed) ? owed : next;
};

/** The three passives the table draws, each absent when the sheet cannot make it. */
export interface Passives {
  readonly perception: number | undefined;
  readonly insight: number | undefined;
  readonly investigation: number | undefined;
}

export const passivesOf = (sheet: CharacterSheet): Passives => ({
  perception: passiveOf(sheet, "Perception", "WIS"),
  insight: passiveOf(sheet, "Insight", "WIS"),
  investigation: passiveOf(sheet, "Investigation", "INT"),
});

/** The saves columns, in the sheet's order; `savesOf` answers them by label. */
export const SAVE_ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/**
 * Which entries of one column are the party's best: every index holding the
 * highest answered value, so a tie highlights all of them. An unanswered cell
 * is never best, and a column with no answers has none.
 */
export const bestInParty = (values: ReadonlyArray<number | undefined>): ReadonlySet<number> => {
  const answered = values.filter((value): value is number => value !== undefined);
  if (answered.length === 0) return new Set();
  const best = Math.max(...answered);
  return new Set(values.flatMap((value, index) => (value === best ? [index] : [])));
};
