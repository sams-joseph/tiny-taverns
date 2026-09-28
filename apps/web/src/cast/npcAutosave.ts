import {
  type CampaignId,
  type Npc,
  type NpcId,
  type NpcUpdate,
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
 */

/** What the drawer edits. The persona lines are strings, as the form holds them. */
export interface NpcFields {
  readonly name: string;
  readonly role: string;
  readonly manner: string;
  readonly wants: string;
  readonly secrets: string;
  readonly visibility: Visibility;
}

export const npcFieldsOf = (npc: Npc): NpcFields => {
  const draft = draftOf(npc);
  return {
    name: npc.name === UNNAMED_NPC ? "" : npc.name,
    role: draft.role,
    manner: draft.manner,
    wants: draft.wants,
    secrets: draft.secrets,
    visibility: npc.visibility,
  };
};

/** The lines that live in a document rather than a column, each compared as it will be written. */
const LINES = ["manner", "wants", "secrets"] as const;

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
  };
};

/**
 * The PATCH for `changes`, over `row`: the columns as they are, and each
 * document rebuilt whole only when one of its lines changed.
 */
export const npcUpdateOf = (row: Npc, changes: Partial<NpcFields>): NpcUpdate => {
  const { visibility, ...lines } = changes;
  const draft = { ...draftOf(row), ...lines };
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

export type SendNpcUpdate = (update: NpcUpdate) => Promise<Result.Result<Npc, ApiFailure>>;

/**
 * One NPC's saver. It keeps the row each save answered, so the next request is
 * built on — and names the version of — what the server now holds.
 */
export class NpcSaver extends AutoSaver<NpcFields> {
  constructor(npc: Npc, send: SendNpcUpdate, delay: number = AUTOSAVE_DELAY_MS) {
    let row = npc;
    super(npcFieldsOf(npc), {
      changes: npcChangesOf,
      send: async (changes) => {
        const saved = await send(npcUpdateOf(row, changes));
        if (Result.isSuccess(saved)) row = saved.success;
        return saved;
      },
      // Built on a version the server has moved past: every retry would be
      // refused the same way, so only a reload goes on from here.
      halts: (failure) => failure.kind === "conflict",
      delay,
    });
  }
}

/** One saver per NPC for as long as the Cast is open (`useAutoSavers`). */
export const useNpcSavers = (campaignId: CampaignId) =>
  useAutoSavers(
    (npc: Npc): NpcId => npc.id,
    (npc, write) =>
      new NpcSaver(npc, (payload) =>
        write(
          (client) => client.npcs.update({ params: { campaignId, npcId: npc.id }, payload }),
          [reads.npcs(campaignId), reads.npc(npc.id)],
        ),
      ),
  );
