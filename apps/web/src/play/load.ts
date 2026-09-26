import type {
  Campaign,
  CampaignId,
  CreatedOrder,
  OwnedCharacter,
  PlayerNote,
  PlayerNpc,
  PageCursor,
  PartySeat,
  PlayerLiveTable,
  Roll,
} from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
import { collectPages, WHOLE_LIST } from "../api/page";
import type { LastNight } from "../campaign/overview";

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
  /**
   * What the DM has shared, as the player's own projection: a player is
   * answered no `dm` row, by predicate, and the creator's `notes` read is not
   * theirs to call.
   */
  readonly notes: ReadonlyArray<PlayerNote>;
  /** NPCs the DM explicitly made player-facing. No private material or usage metadata. */
  readonly npcs: ReadonlyArray<PlayerNpc>;
  /**
   * The newest finished night the DM shared, told through the player's recap —
   * `undefined` until there is one.
   */
  readonly lastNight: LastNight | undefined;
}

/**
 * One Effect for the screen, the rule `campaign/load.ts` set — and its own
 * calls rather than the DM's, because **this is not the DM's load with rows
 * dropped.**
 *
 * Every endpoint here is one a player may actually call. The DM's view composes
 * `runs.list`, which is behind the creator gate and answers a player a 404, so a
 * narrowed version of that load would fail as a whole for the audience it was
 * narrowed for. *Last time* is the same: `sessions.list` answers a player only
 * the nights their DM shared, and the recap is `recap.readAsPlayer`, whose
 * `PlayerSessionRecap` has no field for a monster's numbers — never the DM's
 * `recap.read`. What is absent is absent because another screen owns it: the
 * fight is the live table, `GET /campaigns/:c/table`, whose answer is the
 * player-only projection.
 */
export const loadPlayerCampaignView = (campaignId: CampaignId) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [campaign, party, notes, npcs, sessions] = yield* Effect.all(
      [
        client.campaigns.findById({ params: { campaignId } }),
        client.party.list({ params: { campaignId } }),
        collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
          client.playerNotes.list({ params: { campaignId }, query: { limit: WHOLE_LIST, cursor } }),
        ),
        client.npcs.playerList({ params: { campaignId } }),
        client.sessions.list({ params: { campaignId } }),
      ],
      { concurrency: "unbounded" },
    );
    // Newest first, and the open night is the one with no `endedAt`.
    const last = sessions.find((row) => row.endedAt !== null);
    const lastNight =
      last === undefined
        ? undefined
        : ({
            session: last,
            recap: yield* client.recap.readAsPlayer({
              params: { campaignId, sessionId: last.id },
            }),
          } satisfies LastNight);

    return { campaign, party, notes, npcs, lastNight } satisfies PlayerCampaignView;
  });

export interface PlayerTableView {
  readonly campaign: Campaign;
  readonly table: PlayerLiveTable | null;
  readonly characters: ReadonlyArray<OwnedCharacter>;
  readonly rolls: ReadonlyArray<Roll>;
  /**
   * The shared read-alouds attached to the fight's encounter. None when the
   * fight names no encounter, which is also what a player gets for one they
   * may not read (not Shared, or not Ready) — and `PlayerNote.attachedTo`
   * names only an encounter they may read, so the two agree.
   */
  readonly readAloud: ReadonlyArray<PlayerNote>;
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
          ? Effect.succeed([] as ReadonlyArray<PlayerNote>)
          : collectPages((cursor: PageCursor<CreatedOrder> | undefined) =>
              client.playerNotes.list({
                params: { campaignId },
                query: { limit: WHOLE_LIST, cursor },
              }),
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
