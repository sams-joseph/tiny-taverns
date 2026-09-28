import {
  type CampaignId,
  type Npc,
  type NpcAttitude,
  type NpcId,
  type NpcPrep,
  type NpcPrepUpdate,
  type NpcStatus,
  type NpcUpdate,
  type SessionId,
  UNNAMED_NPC,
  type Visibility,
} from "@taverns/api";
import { Result } from "effect";
import type { ApiFailure } from "../api/failure";
import { reads } from "../api/keys";
import { AUTOSAVE_DELAY_MS, AutoSaver, useAutoSavers } from "../ui/autosave";
import { draftOf, personaFrom, privateMaterialFrom } from "./persona";

/**
 * The Cast's NPC drawer saves as you type, as the Notes pane does: the timing
 * is the shared `AutoSaver` (`ui/autosave.ts`), and this is what an NPC adds.
 *
 * - **The role is sent settled, never on the debounce.** The server draws an
 *   NPC's one portrait from the first write that gives it a subject — a role,
 *   an appearance or a summary (`npcImageHasSubject`) — and never redraws. A
 *   role saved mid-word would be drawn as the fragment, so it waits for the
 *   blur, *Done* or the drawer closing.
 * - **The name is held back while it is empty**, as a note's title is: the
 *   contract requires one. An NPC *Add NPC* made blank is stored under
 *   `UNNAMED_NPC`; the drawer shows that as an empty field, so it keeps that
 *   name until one is typed.
 * - **Each document is rebuilt whole, from the row the server last answered.**
 *   `NpcUpdate` replaces `persona` and `privateMaterial` outright, so a change
 *   to the manner or the wants rebuilds the persona from that row's full draft
 *   (`persona.ts`) with only the edited lines replaced — pronouns, phrases and
 *   boundaries written on the NPC's page survive. A secret goes only to
 *   `privateMaterial`.
 * - **Every request names the version it was built on** (`expectedVersion`),
 *   so an edit made elsewhere since is a `Conflict` to reload over, never a
 *   silent overwrite.
 * - **The prep goes to its own endpoint** (`updatePrep`): attitude, status,
 *   where and first met live on the DM's `npc_prep`, not the row, and carry no
 *   version. One save sends the row's changes, then the prep's, so the drawer
 *   has one *Saving…* for both.
 */

/** What the drawer edits. The persona lines are strings, as the form holds them. */
export interface NpcFields {
  readonly name: string;
  readonly role: string;
  readonly manner: string;
  readonly wants: string;
  readonly secrets: string;
  readonly visibility: Visibility;
  /** The prep: `null` is not set, and no toggle is lit. */
  readonly attitude: NpcAttitude | null;
  readonly status: NpcStatus | null;
  /** Empty is not set. */
  readonly whereabouts: string;
  /** `null` is "Not met yet". */
  readonly metSessionId: SessionId | null;
}

/**
 * The drawer's fields for `npc`. An NPC with no prep yet — one *Add NPC* made
 * before the prep list re-read — has nothing set.
 */
export const npcFieldsOf = (npc: Npc, prep: NpcPrep | undefined): NpcFields => {
  const draft = draftOf(npc);
  return {
    name: npc.name === UNNAMED_NPC ? "" : npc.name,
    role: draft.role,
    manner: draft.manner,
    wants: draft.wants,
    secrets: draft.secrets,
    visibility: npc.visibility,
    attitude: prep?.attitude ?? null,
    status: prep?.status ?? null,
    whereabouts: prep?.whereabouts ?? "",
    metSessionId: prep?.metSessionId ?? null,
  };
};

/** The lines that live in a document rather than a column, each compared as it will be written. */
const LINES = ["manner", "wants", "secrets"] as const;

/** The prep's picks, each a value or `null`. */
const PICKS = ["attitude", "status", "metSessionId"] as const;

/**
 * What differs between the draft and what the server holds. `settled` is
 * false when only the debounce is asking, and then the role is not named.
 */
export const npcChangesOf = (
  draft: NpcFields,
  saved: NpcFields,
  settled: boolean,
): Partial<NpcFields> => {
  const name = draft.name.trim();
  const role = draft.role.trim();
  return {
    ...(name !== "" && name !== saved.name ? { name } : {}),
    ...(settled && role !== saved.role.trim() ? { role } : {}),
    ...Object.fromEntries(
      LINES.filter((key) => draft[key].trim() !== saved[key].trim()).map((key) => [
        key,
        draft[key],
      ]),
    ),
    ...(draft.visibility !== saved.visibility ? { visibility: draft.visibility } : {}),
    ...Object.fromEntries(
      PICKS.filter((key) => draft[key] !== saved[key]).map((key) => [key, draft[key]]),
    ),
    ...(draft.whereabouts.trim() !== saved.whereabouts.trim()
      ? { whereabouts: draft.whereabouts }
      : {}),
  };
};

/**
 * The PATCH for `changes`, over `row`: the columns as they are, and each
 * document rebuilt whole only when one of its lines changed.
 */
export const npcUpdateOf = (row: Npc, changes: Partial<NpcFields>): NpcUpdate => {
  const { visibility, manner, wants, secrets } = changes;
  // Only the document lines: the prep is not the row's (`npcPrepUpdateOf`).
  const draft = {
    ...draftOf(row),
    ...(manner !== undefined ? { manner } : {}),
    ...(wants !== undefined ? { wants } : {}),
    ...(secrets !== undefined ? { secrets } : {}),
  };
  return {
    expectedVersion: row.version,
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.role !== undefined ? { role: changes.role } : {}),
    ...(changes.manner !== undefined || changes.wants !== undefined
      ? { persona: personaFrom(draft) }
      : {}),
    ...(changes.secrets !== undefined ? { privateMaterial: privateMaterialFrom(draft) } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
  };
};

/** Whether `changes` names anything the row holds, rather than only the prep. */
const touchesRow = (changes: Partial<NpcFields>): boolean =>
  (["name", "role", ...LINES, "visibility"] as const).some((key) => changes[key] !== undefined);

/**
 * The prep PATCH for `changes`, or `undefined` when they name none of it. A
 * blank *where* clears it: the contract refuses whitespace.
 */
export const npcPrepUpdateOf = (changes: Partial<NpcFields>): NpcPrepUpdate | undefined => {
  const where = changes.whereabouts?.trim();
  const update: NpcPrepUpdate = {
    ...(changes.attitude !== undefined ? { attitude: changes.attitude } : {}),
    ...(changes.status !== undefined ? { status: changes.status } : {}),
    ...(where !== undefined ? { whereabouts: where === "" ? null : where } : {}),
    ...(changes.metSessionId !== undefined ? { metSessionId: changes.metSessionId } : {}),
  };
  return Object.keys(update).length === 0 ? undefined : update;
};

export type SendNpcUpdate = (update: NpcUpdate) => Promise<Result.Result<Npc, ApiFailure>>;
export type SendNpcPrepUpdate = (
  update: NpcPrepUpdate,
) => Promise<Result.Result<NpcPrep, ApiFailure>>;

/** Where a saver's two kinds of change go. */
export interface NpcSends {
  readonly row: SendNpcUpdate;
  readonly prep: SendNpcPrepUpdate;
}

/**
 * One NPC's saver. It keeps the row each save answered, so the next request is
 * built on — and names the version of — what the server now holds.
 */
export class NpcSaver extends AutoSaver<NpcFields> {
  constructor(
    npc: Npc,
    prep: NpcPrep | undefined,
    send: NpcSends,
    delay: number = AUTOSAVE_DELAY_MS,
  ) {
    let row = npc;
    super(npcFieldsOf(npc, prep), {
      changes: npcChangesOf,
      // The row first, then the prep. Either failing fails the save, and the
      // retry sends both again: the row's half rebuilt on the version it won.
      send: async (changes) => {
        if (touchesRow(changes)) {
          const saved = await send.row(npcUpdateOf(row, changes));
          if (Result.isFailure(saved)) return saved;
          row = saved.success;
        }
        const prepUpdate = npcPrepUpdateOf(changes);
        return prepUpdate === undefined ? Result.succeed(row) : send.prep(prepUpdate);
      },
      // Built on a version the server has moved past: every retry would be
      // refused the same way, so only a reload goes on from here.
      halts: (failure) => failure.kind === "conflict",
      delay,
    });
  }
}

/** An NPC as the Cast holds it: the row, and its prep once the list has it. */
export interface CastNpc {
  readonly npc: Npc;
  readonly prep: NpcPrep | undefined;
}

/** One saver per NPC for as long as the Cast is open (`useAutoSavers`). */
export const useNpcSavers = (campaignId: CampaignId) =>
  useAutoSavers(
    ({ npc }: CastNpc): NpcId => npc.id,
    ({ npc, prep }, write) =>
      new NpcSaver(npc, prep, {
        row: (payload) =>
          write(
            (client) => client.npcs.update({ params: { campaignId, npcId: npc.id }, payload }),
            [reads.npcs(campaignId), reads.npc(npc.id)],
          ),
        prep: (payload) =>
          write(
            (client) => client.npcs.updatePrep({ params: { campaignId, npcId: npc.id }, payload }),
            [reads.npcPrep(campaignId)],
          ),
      }),
  );
