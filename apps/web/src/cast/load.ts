import type {
  CampaignId,
  Npc,
  NpcId,
  NpcAwarenessCandidate,
  NpcKnowledgeFact,
  NpcMemory,
  NpcPrep,
  NpcProposal,
  NpcSheet,
  NpcSheetSummary,
  PlayerNpc,
  Session,
  SessionId,
} from "@taverns/api";
import { Effect } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { apiAtom, combine } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The cast's reads, as atoms — `Atom.family` at module scope, keyed on what
 * each read closes over, exactly as `campaign/load.ts` does.
 *
 * One combination, the Cast's (`castAtom`): its cards need the rows, their prep,
 * their sheets' summaries and the nights together. Otherwise each list is its screen's `extra` (the
 * archived shelf's) and one row is the NPC screen's. The rehearsal
 * transcript is deliberately *not* an atom — like Hob's it is read by the hook
 * that streams into it (`cast/rehearsal.ts`), because a refresh would replace
 * the reply the creator is watching arrive.
 */

export const npcsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.list({ params: { campaignId }, query: {} }),
    [reads.npcs(campaignId)],
  ),
);

/**
 * The other shelf: the NPCs archived off the Cast. The server answers it on
 * the same endpoint with `archived: true`, and it shares the list's one key,
 * so archiving or restoring an NPC re-reads both shelves at once.
 */
export const archivedNpcsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.list({ params: { campaignId }, query: { archived: true } }),
    [reads.npcs(campaignId)],
  ),
);

/**
 * The DM's prep for every live NPC (`prepList`), in the list's order — the
 * creator's alone, on a table no player read touches. Beside the rows rather
 * than on them, as the seats' prep is (`party/load.ts`).
 *
 * It answers `npcs` as well as its own key, because which NPCs it lists moves
 * whenever an NPC is made, archived or restored, and `sessions`, because
 * deleting a night clears the *first met* that named it.
 */
export const npcPrepAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.prepList({ params: { campaignId }, query: {} }),
    [reads.npcPrep(campaignId), reads.npcs(campaignId), reads.sessions(campaignId)],
  ),
);

/**
 * The summary of every live NPC's sheet (`sheets`), in the list's order,
 * leaving out an NPC with none — the drawer's one line. The document is not
 * in it; the Stats tab reads one NPC's (`npcSheetAtom`). The creator's alone:
 * no player read touches `npc_sheet`.
 *
 * It answers `npcs` as well as its own key, for the prep's reason: which NPCs
 * it lists moves whenever an NPC is archived or restored.
 */
export const npcSheetsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.sheets({ params: { campaignId }, query: {} }),
    [reads.npcSheets(campaignId), reads.npcs(campaignId)],
  ),
);

/** The campaign's nights, newest first: what *First met* picks from and names. */
export const castNightsAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.sessions.list({ params: { campaignId } }),
    [reads.sessions(campaignId)],
  ),
);

/** What the Cast reads beyond the campaign view. */
export interface CastShelf {
  readonly npcs: ReadonlyArray<Npc>;
  /** Each live NPC's prep; one the list has not caught up with has none yet. */
  readonly prep: ReadonlyArray<NpcPrep>;
  /** The live NPCs' sheets, without their documents; an NPC with none is not in it. */
  readonly sheets: ReadonlyArray<NpcSheetSummary>;
  readonly nights: ReadonlyArray<Session>;
}

/**
 * The Cast's `extra`: the rows, their prep, their sheets' summaries and the
 * nights, one value with three states, as the Party tab's roster is. Told how to refresh, for the
 * reason `rosterAtom` gives.
 */
export const castAtom = Atom.family((campaignId: CampaignId) =>
  Atom.readable(
    (get): AsyncResult.AsyncResult<CastShelf, unknown> =>
      AsyncResult.all({
        npcs: get(npcsAtom(campaignId)),
        prep: get(npcPrepAtom(campaignId)),
        sheets: get(npcSheetsAtom(campaignId)),
        nights: get(castNightsAtom(campaignId)),
      }),
    (refresh) => {
      refresh(npcsAtom(campaignId));
      refresh(npcPrepAtom(campaignId));
      refresh(npcSheetsAtom(campaignId));
      refresh(castNightsAtom(campaignId));
    },
  ),
);

interface OneNpc {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}

export interface NpcDetail {
  readonly npc: Npc;
  readonly knowledge: ReadonlyArray<NpcKnowledgeFact>;
  readonly memories: ReadonlyArray<NpcMemory>;
  readonly proposals: ReadonlyArray<NpcProposal>;
  readonly awarenessCandidates: ReadonlyArray<NpcAwarenessCandidate>;
  /** The Stats tab's sheet, or `null` when the DM has not written one. */
  readonly sheet: NpcSheet | null;
}

const npcRowAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) => client.npcs.findById({ params: at }),
    [reads.npc(at.npcId), reads.npcs(at.campaignId)],
  ),
);

/**
 * What the creator tied one NPC to (`npcs.links`): the drawer's *Tied to*
 * seats and *Shows up in* encounters. It answers `encounters` too, because
 * deleting an encounter takes its links with it.
 */
export const npcLinksAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) => client.npcs.links({ params: at }),
    [reads.npcLinks(at.npcId), reads.encounters(at.campaignId)],
  ),
);

/** One NPC's sheet, or `null`: the Stats tab's read, folded into `npcAtom`. */
export const npcSheetAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.sheet({ params: at }), [reads.npcSheet(at.npcId)]),
);

const npcKnowledgeAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.knowledge({ params: at }), [reads.npcKnowledge(at.npcId)]),
);

const npcMemoriesAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.memories({ params: at }), [reads.npcMemories(at.npcId)]),
);

export const npcProposalsAtom = Atom.family((at: OneNpc) =>
  apiAtom((client) => client.npcs.proposals({ params: at }), [reads.npcProposals(at.npcId)]),
);

const npcAwarenessCandidatesAtom = Atom.family((at: OneNpc) =>
  apiAtom(
    (client) => client.npcs.awarenessCandidates({ params: at }),
    [reads.npcAwarenessCandidates(at.npcId)],
  ),
);

export const npcFollowUpAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(
    (client) => client.npcs.followUp({ params: { campaignId } }),
    [reads.npcFollowUp(campaignId)],
  ),
);

interface SessionNpcsKey {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
}

export const sessionNpcsAtom = Atom.family((at: SessionNpcsKey) =>
  apiAtom((client) => client.npcs.sessionList({ params: at }), [reads.sessionNpcs(at.sessionId)]),
);

export interface SessionNpcProposalSummary {
  readonly npc: PlayerNpc;
  readonly pendingProposals: number;
}

export const sessionNpcProposalSummaryAtom = Atom.family((at: SessionNpcsKey) =>
  apiAtom(
    (client) =>
      Effect.flatMap(client.npcs.sessionList({ params: at }), (sessionNpcs) =>
        Effect.all(
          sessionNpcs.map((npc) =>
            Effect.map(
              client.npcs.proposals({ params: { campaignId: at.campaignId, npcId: npc.id } }),
              (proposals): SessionNpcProposalSummary => ({
                npc,
                pendingProposals: proposals.filter((proposal) => proposal.state === "pending")
                  .length,
              }),
            ),
          ),
          { concurrency: 4 },
        ),
      ),
    [reads.sessionNpcs(at.sessionId)],
  ),
);

/**
 * One NPC plus the two context lists the detail screen manages. Split under the
 * hood so a fact write refreshes facts without re-reading the persona, then
 * combined back to one value so the screen keeps its three states.
 */
export const npcAtom = Atom.family((at: OneNpc) =>
  Atom.readable((get): AsyncResult.AsyncResult<NpcDetail, unknown> =>
    combine(
      get,
      AsyncResult.all({
        npc: get(npcRowAtom(at)),
        knowledge: get(npcKnowledgeAtom(at)),
        memories: get(npcMemoriesAtom(at)),
        proposals: get(npcProposalsAtom(at)),
        awarenessCandidates: get(npcAwarenessCandidatesAtom(at)),
        sheet: get(npcSheetAtom(at)),
      }),
    ),
  ),
);
