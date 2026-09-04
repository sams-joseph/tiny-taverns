import type {
  Campaign,
  CampaignId,
  CreatedOrder,
  Note,
  OwnedCharacter,
  PageCursor,
  PartySeat,
  PlayerLiveTable,
  Roll,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
import { collectPages, WHOLE_LIST } from "../api/page";

/** Everything the player's view of a table renders, in one shape. */
export interface PlayerCampaignView {
  readonly campaign: Campaign;
  /**
   * The seats this account may read: their own, and any the creator shared.
   * Each holds the whole shared character behind it — a `shared` seat means
   * the table may see the character, which is what sharing one has always
   * meant.
   */
  readonly party: ReadonlyArray<PartySeat>;
  /** What the DM has shared. A player is answered no `dm` row, by predicate. */
  readonly notes: ReadonlyArray<Note>;
}

/**
 * One Effect for the screen, the rule `campaign/load.ts` set — and three calls
 * rather than six, because **this is not the DM's load with rows dropped.**
 *
 * Every endpoint here is one a player may actually call. The DM's view composes
 * `runs.list`, which is behind the creator gate and answers a player a 404, so a
 * narrowed version of that load would fail as a whole for the audience it was
 * narrowed for. What is absent is absent because another screen owns it:
 *
 * - **the nights** — the player Chronicle reads `recap.readAsPlayer`; a generic
 *   session list would mostly be empty because sessions start private.
 * - **the fight** — the live table is `GET /campaigns/:c/table`, whose answer is
 *   the player-only projection, not the DM's run with fields dropped.
 *
 * Each is a screen with a projection of its own, not this overview's aside.
 */
export const loadPlayerCampaignView = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, party, notes] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.party.list({ params: { campaignId } }),
        collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
          client.notes.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
        ),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, party, notes } satisfies PlayerCampaignView;
  });

export interface PlayerTableView {
  readonly campaign: Campaign;
  readonly table: PlayerLiveTable | null;
  readonly characters: ReadonlyArray<OwnedCharacter>;
  readonly rolls: ReadonlyArray<Roll>;
  readonly readAloud: ReadonlyArray<Note>;
}

/** The live table, plus only the own-character roll log the screen may show. */
export const loadPlayerTableView = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, table, characters] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.table.read({ params: { campaignId } }),
        client.me.characters(),
      ],
      { concurrency: "unbounded" },
    );
    const own = table?.fight?.order.find((row) => row.kind === "you");
    const [rolls, notes] = yield* Effect.all(
      [
        own === undefined || table === null
          ? Effect.succeed([] as ReadonlyArray<Roll>)
          : client.table.rolls({
              params: {
                campaignId,
                sessionId: table.sessionId,
                characterId: own.characterId,
              },
              query: { limit: 12 },
            }),
        table?.fight?.encounterId === undefined || table.fight.encounterId === null
          ? Effect.succeed([] as ReadonlyArray<Note>)
          : collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
              client.notes.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
            ).pipe(
              Effect.map((all) =>
                all.filter(
                  (note) =>
                    note.kind === "read_aloud" &&
                    note.attachedTo?.kind === "encounter" &&
                    note.attachedTo.id === table.fight!.encounterId,
                ),
              ),
            ),
      ],
      { concurrency: "unbounded" },
    );

    return { campaign, table, characters, rolls, readAloud: notes } satisfies PlayerTableView;
  });
