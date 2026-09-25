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
  /** As the card draws it: the sheet's own words for speed and DC. */
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

const statsOf = (character: NonNullable<PartySeat["character"]>): ReadonlyArray<StatTile> => {
  const speed = present(character.sheet.identity?.speed);
  const spellDc = present(character.sheet.spellcasting?.save);
  const passive = passivePerceptionOf(character.sheet);
  return [
    ...(character.ac === null
      ? []
      : [{ key: "ac", label: "AC", value: String(character.ac) } as const]),
    ...(speed === undefined ? [] : [{ key: "speed", label: "Speed", value: speed } as const]),
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
