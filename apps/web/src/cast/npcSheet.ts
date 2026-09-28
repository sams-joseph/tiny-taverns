import {
  type CampaignId,
  type ChallengeRating,
  creatureXp,
  type NpcId,
  type NpcSheet,
  type NpcSheetPut,
  type NpcSheetSummary,
  type NpcSheetUpdate,
  type SheetBody,
} from "@taverns/api";
import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { reads, type Invalidation } from "../api/keys";
import type { TavernsClient } from "../api/client";
import { parseOptional } from "../characters/create";

/**
 * An NPC's sheet as the Cast draws and writes it — the drawer's one line, the
 * Stats header's challenge line, and the identity dialog's payloads — in one
 * place, so the drawer and the Stats tab cannot disagree about a word.
 *
 * Nothing here guesses: a column nobody set draws no part, and the descriptor
 * is the server's generated column, never assembled here.
 */

/**
 * *"Level 5 Human Fighter · AC 17 · HP 44 · CR 3"* — the drawer's line, from
 * the columns alone, because the shelf read carries no document. A sheet
 * whose columns are all blank still exists, and says so rather than drawing
 * nothing.
 */
export const sheetSummaryLine = (sheet: NpcSheetSummary): string => {
  const parts = [
    sheet.descriptor,
    sheet.ac === null ? null : `AC ${String(sheet.ac)}`,
    sheet.hpMax === null ? null : `HP ${String(sheet.hpMax)}`,
    sheet.cr === null ? null : `CR ${sheet.cr}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "A sheet with nothing on it yet" : parts.join(" · ");
};

/**
 * *"CR 3 · 700 XP"*. The rating is closed to the ones the XP table knows
 * (`ChallengeRating`), so it always has XP; the XP is `creatureXp`'s, the one
 * table the difficulty meter reads.
 */
export const challengeLine = (cr: ChallengeRating): string => {
  const xp = creatureXp({ cr, statBlockXp: null });
  return xp === null ? `CR ${cr}` : `CR ${cr} · ${xp.toLocaleString("en")} XP`;
};

/** What the identity dialog's boxes hold, as typed. */
export interface IdentityBoxes {
  readonly level: string;
  readonly race: string;
  readonly subrace: string;
  readonly className: string;
  readonly ac: string;
  readonly hpMax: string;
  /** `""` is *no rating*. */
  readonly cr: ChallengeRating | "";
}

const numberBox = (value: number | null): string => (value === null ? "" : String(value));

/** The boxes filled from the sheet, or all blank for *Write one*. */
export const boxesOf = (sheet: NpcSheet | null): IdentityBoxes =>
  sheet === null
    ? { level: "", race: "", subrace: "", className: "", ac: "", hpMax: "", cr: "" }
    : {
        level: numberBox(sheet.level),
        race: sheet.race ?? "",
        subrace: sheet.subrace ?? "",
        className: sheet.className ?? "",
        ac: numberBox(sheet.ac),
        hpMax: numberBox(sheet.hpMax),
        cr: sheet.cr ?? "",
      };

/** The columns as the boxes say them: a blank box is `null`, never a zero. */
interface Columns {
  readonly level: number | null;
  readonly race: string | null;
  readonly subrace: string | null;
  readonly className: string | null;
  readonly ac: number | null;
  readonly hpMax: number | null;
  readonly cr: ChallengeRating | null;
}

const label = (raw: string): string | null => (raw.trim() === "" ? null : raw.trim());

/** Call only once `identityNumberProblems` has passed the boxes: an unparseable one is `null` here. */
const columnsOf = (boxes: IdentityBoxes): Columns => ({
  level: parseOptional(boxes.level) ?? null,
  race: label(boxes.race),
  subrace: label(boxes.subrace),
  className: label(boxes.className),
  ac: parseOptional(boxes.ac) ?? null,
  hpMax: parseOptional(boxes.hpMax) ?? null,
  cr: boxes.cr === "" ? null : boxes.cr,
});

/** The column default: a sheet with no abilities and no features, and none of the optional keys. */
const BLANK_BODY: SheetBody = { abilities: [], traits: [] };

/**
 * *Write one*: the identity alone over a blank document, the PUT that starts a
 * sheet. It names no `expectedVersion`, because there is no sheet to have
 * read; if one was started meanwhile, the server says so as a `Conflict`.
 */
export const writeOnePayload = (boxes: IdentityBoxes): NpcSheetPut => ({
  ...columnsOf(boxes),
  sheet: BLANK_BODY,
});

/**
 * *Edit identity*: a PATCH of **only the columns that changed**, with the
 * version it read. Only what moved, because a `level` or `className` in the
 * PATCH recomputes the document's derived lines on the server, and a race
 * re-checks its subrace — neither is a reason to send an unchanged box.
 * `undefined` when nothing changed, so the dialog sends nothing.
 */
export const identityPatch = (
  sheet: NpcSheet,
  boxes: IdentityBoxes,
): NpcSheetUpdate | undefined => {
  const next = columnsOf(boxes);
  const changed = (Object.keys(next) as Array<keyof Columns>).filter(
    (key) => next[key] !== sheet[key],
  );
  if (changed.length === 0) return undefined;
  return {
    expectedVersion: sheet.version,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  };
};

type SheetWrite<A> = Effect.Effect<A, unknown, HttpClient.HttpClient>;

/**
 * Where an NPC's sheet is read and written, so the Stats panel draws one sheet
 * whichever NPC it is: a campaign NPC's through the creator's endpoints. (A
 * Library NPC's is the owner's, under `/library`; that target arrives with its
 * endpoints.)
 */
export interface NpcSheetTarget {
  readonly put: (client: TavernsClient, payload: NpcSheetPut) => SheetWrite<NpcSheet>;
  readonly update: (client: TavernsClient, patch: NpcSheetUpdate) => SheetWrite<NpcSheet>;
  readonly remove: (client: TavernsClient) => SheetWrite<void>;
  /**
   * What every write of the sheet changed: the sheet, and the shelf the
   * drawer's line reads.
   */
  readonly writes: Invalidation;
}

export const campaignSheetTarget = (campaignId: CampaignId, npcId: NpcId): NpcSheetTarget => {
  const params = { campaignId, npcId };
  return {
    put: (client, payload) => client.npcs.putSheet({ params, payload }),
    update: (client, patch) => client.npcs.updateSheet({ params, payload: patch }),
    remove: (client) => client.npcs.removeSheet({ params }),
    writes: [reads.npcSheet(npcId), reads.npcSheets(campaignId)],
  };
};
