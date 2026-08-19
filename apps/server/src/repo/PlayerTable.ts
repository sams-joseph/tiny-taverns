import {
  type CampaignId,
  type CharacterId,
  type CombatantId,
  CurrentActor,
  type EncounterRunId,
  type NotFound,
  PlayerLiveTable,
  type PlayerLiveSeat,
  type PlayerLiveTurn,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { COMBATANT, RUNS } from "./liveTables.js";
import { dieOnSqlError } from "./rows.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  nestedRowReadable,
  ownRowReadable,
  rowCampaign,
  rowReadable,
} from "./visibility.js";

/**
 * What is on one table right now, to somebody sitting at it.
 *
 * The read behind the live banner on the player's character sheet and the
 * *Go to the table* action beside it. `PlayerLiveTable` is the contract and is
 * where the decision about **what a player may be told** is written down; this
 * file is where the decision about **which rows exist to tell them about** is
 * composed, and it composes nothing new.
 *
 * ### Four queries, four shipped predicates, and no new rule
 *
 * `ensureCampaignReadable`, `rowReadable`, `nestedRowReadable`,
 * `containedRowReadable` and `ownRowReadable` — every one of them already in
 * `repo/visibility.ts` and every one of them used exactly as its existing
 * callers use it. There is no predicate here, no `.filter` after a read, and
 * nothing that turns a wide row into a narrow one in TypeScript: the columns a
 * player may not have are **not selected**, which is the rule
 * `repo/playerCombatant.ts` states one level down and the reason this file
 * never mentions `ac`, `hp_current` or `hp_max` at all.
 *
 * ### What each layer of the seam does to the answer, and why each is right
 *
 * Narrowing is by *field* in the schema and by *row* here, and the row half is
 * the shipped one working rather than anything this feature decided:
 *
 * - **the campaign** — a non-member, a revoked member, a credential minted for
 *   another table and a campaign the DM has not shared each get the ordinary
 *   `NotFound`. That is `ensureCampaignReadable`, and it is why the endpoint
 *   answers a 404 rather than `null` for them: `null` means *"nothing is
 *   happening at your table"*, and saying that to somebody who has no table
 *   would be a different lie.
 * - **the night** — `session.visibility`. A DM who has not shared tonight has a
 *   player who sees no banner. Fail-closed, and the same answer the player
 *   Chronicle gives to the same campaign.
 * - **the fight** — `encounter_run.visibility`, the runner's own *Share*
 *   switch. Off, and the player is told the night and nothing about the table.
 * - **the row whose turn it is** — `combatant.visibility`, the runner's *Hide
 *   from players*. Hidden, and `upNext` is `null`: the banner says the round
 *   and stops rather than naming a row the DM took off the board.
 *
 * ### The one thing here that is `me`-shaped
 *
 * `seats` is this account's **own** characters in the fight, and the ownership
 * comparison is `ownRowReadable`'s rather than one written here. That is the
 * rule `repo/Characters.ts` follows and for the same reason: a repository that
 * spelled `account_id = <the actor>` in its own `WHERE` would be the second
 * place the ownership rule lives, and the day the two disagree the wrong one is
 * the one nobody is reading.
 *
 * ### Why it is a repository read rather than a client composition
 *
 * `AGENTS.md`'s rule is one `Effect` per screen, and a screen composing three
 * reads is the usual answer. It cannot be composed here: two of the three reads
 * this needs — the session a campaign is currently on, and the live run under
 * it — have **no player-reachable endpoint**. `sessions.list` would hand a
 * player every shared night to find one, `runs.list` is behind the `DmActor`
 * gate and answers them nothing, and `campaign.currentSessionId` is on
 * `Campaign`, which `campaigns.findById` answers whole. So the choice was a
 * repository read or three new endpoints, and three would each have had to
 * settle their own projection.
 */
export class PlayerTable extends Context.Service<
  PlayerTable,
  {
    /**
     * The night this campaign is on and the fight on it, as far as this actor
     * is entitled to know — or `null`, which is the common answer.
     *
     * `NotFound` names the **campaign**, and only the campaign: every narrower
     * refusal below it is an absence rather than an error, because *"there is a
     * session but you may not see it"* is a disclosure and *"nothing is
     * happening"* is what the banner would render either way.
     */
    readonly read: (
      campaignId: CampaignId,
    ) => Effect.Effect<PlayerLiveTable | null, NotFound, CurrentActor>;
  }
>()("PlayerTable") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        read: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);

              /**
               * The night the campaign is on, if this actor may see it.
               *
               * `campaign.current_session_id` is the whole of what *"during a
               * session"* means — the same resolution `vitals.ts`'s
               * `currentSessionOf` uses, and it cannot name a finished night
               * because `0006_session_finished.ts` makes that unrepresentable.
               * This is not that helper: `currentSessionOf` composes
               * `campaignWritableById` and therefore answers a player nothing,
               * which `AGENTS.md` already records as the reason the doorbell
               * does not ring for them. The pointer is read in a scalar
               * subquery whose own scope contains its `campaign`, and the row
               * it names still has to pass `rowReadable` on its own terms — so
               * the unpredicated subquery decides nothing.
               */
              const sessions = yield* sql<{
                readonly id: SessionId;
                readonly number: number;
              }>`
                select session.id, session.number from session
                where session.id = (
                        select campaign.current_session_id from campaign
                        where campaign.id = ${campaignId}
                      )
                  and ${rowReadable(sql, "session", campaignId, actor)}
              `;
              const session = sessions[0];
              if (session === undefined) return null;

              /**
               * The fight on the table.
               *
               * Found as *the unended run of this night* rather than by
               * following `session.active_encounter_run_id`, which is the same
               * answer by the partial unique index
               * (`encounter_run_one_live_per_session`) and one query fewer —
               * the choice `campaign/load.ts` already makes from the client
               * side. `limit 1` is the index restated, not a tiebreak anybody
               * should rely on.
               */
              const runs = yield* sql<{
                readonly id: EncounterRunId;
                readonly round: number;
                readonly active_combatant_id: CombatantId | null;
              }>`
                select encounter_run.id, encounter_run.round,
                       encounter_run.active_combatant_id
                from encounter_run
                where encounter_run.ended_at is null
                  and ${nestedRowReadable(sql, RUNS, session.id, campaignId, actor)}
                order by encounter_run.started_at desc, encounter_run.id desc
                limit 1
              `;
              const run = runs[0];
              if (run === undefined) {
                return new PlayerLiveTable({
                  campaignId,
                  sessionId: session.id,
                  sessionNumber: session.number,
                  fight: null,
                });
              }

              /**
               * Whose turn it is — the name, and nothing else on the row.
               *
               * The predicate is the same containment chain the runner reads a
               * combatant through, so a row the DM hid comes back as no row and
               * `upNext` is `null`. `display_name` is the only column selected:
               * a query that fetched the row and picked a field would be the
               * post-filtering pattern the seam exists to prevent, with an
               * exact hit-point total sitting in memory.
               */
              const turns =
                run.active_combatant_id === null
                  ? []
                  : yield* sql<{
                      readonly id: CombatantId;
                      readonly display_name: string;
                    }>`
                      select combatant.id, combatant.display_name from combatant
                      where combatant.id = ${run.active_combatant_id}
                        and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                    `;
              const turn = turns[0];
              const upNext: PlayerLiveTurn | null =
                turn === undefined
                  ? null
                  : { combatantId: turn.id, displayName: turn.display_name };

              /**
               * This account's own characters in the fight.
               *
               * Two predicates, and neither is redundant: the combatant has to
               * be one this actor may see at all, *and* the character it was
               * seeded from has to be theirs. `ownRowReadable` is the second —
               * `ownedRowReadable` conjoined with ownership, the same fragment
               * `GET /me/characters` composes — so every id returned here is one
               * the caller already holds and could read in full, and there is no
               * shape of request that asks for anybody else's.
               */
              const seatRows = yield* sql<{
                readonly id: CombatantId;
                readonly character_id: CharacterId;
              }>`
                select combatant.id, combatant.character_id from combatant
                where combatant.encounter_run_id = ${run.id}
                  and combatant.character_id is not null
                  and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                  and exists (
                    select 1 from character
                    where character.id = combatant.character_id
                      and ${ownRowReadable(sql, "character", rowCampaign(sql, "character"), actor)}
                  )
                order by combatant.id asc
              `;
              const seats: ReadonlyArray<PlayerLiveSeat> = seatRows.map((row) => ({
                characterId: row.character_id,
                combatantId: row.id,
              }));

              return new PlayerLiveTable({
                campaignId,
                sessionId: session.id,
                sessionNumber: session.number,
                fight: { id: run.id, round: run.round, upNext, seats },
              });
            }),
          ),
      };
    }),
  );
}
