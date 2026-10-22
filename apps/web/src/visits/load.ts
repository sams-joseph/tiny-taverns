import type { CampaignId, LevelVisit, LevelVisitId } from "@taverns/api";
import type { Effect } from "effect";
import { Atom } from "effect/reactivity";
import { apiAtom, writableApiAtom } from "../api/atoms";
import { type Invalidation, reads } from "../api/keys";

/**
 * A table's level visits (`LevelVisit.ts`), as atoms: the list its Levels
 * screen draws, and one visit whole, which its stage reads and writes into.
 * Both are the creator's alone, as every endpoint behind them is.
 */

/** The campaign's visits, by name, with which is on the table. */
export const levelVisitsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.levelVisits.list({ params: { campaignId } }),
    [reads.levelVisits(campaignId)],
  ),
);

/** Where a visit is: its campaign and its id. */
export interface VisitPath {
  readonly campaignId: CampaignId;
  readonly visitId: LevelVisitId;
}

/**
 * One visit, whole, as its stage reads it: **writable**, as the runner's board
 * is (`run/load.ts`'s `runBoardAtom`), because every exploring write answers
 * with the visit, newer than any read, and the stage draws that answer at once
 * (`VisitScreen.tsx`). Another of the DM's tabs is heard through the visit's
 * stream while a night is open.
 */
export const levelVisitAtom = Atom.family((path: VisitPath) =>
  writableApiAtom(
    (client): Effect.Effect<LevelVisit, unknown> => client.levelVisits.findById({ params: path }),
    [reads.levelVisit(path.visitId)],
  ),
);

/**
 * What putting a visit on the table, taking it off, or resetting it changes:
 * the list's *On the table*, and each visit named, whose `onTable` moves (the
 * one put on, and whichever it took the place of, which the list knows).
 */
export const tableVisitWrites = (
  campaignId: CampaignId,
  visitIds: ReadonlyArray<LevelVisitId>,
): Invalidation => [reads.levelVisits(campaignId), ...visitIds.map(reads.levelVisit)];
