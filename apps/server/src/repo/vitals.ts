import type {
  Actor,
  CampaignId,
  CharacterId,
  CombatantId,
  EncounterRunId,
  SessionId,
} from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient, Statement } from "effect/unstable/sql";
import { COMBATANT } from "./liveTables.js";
import type { AppendEvent } from "./SessionEvents.js";
import { appendEvent } from "./SessionEvents.js";
import { campaignWritableById, containedRowWritable, rowWritable } from "./visibility.js";

/**
 * The live half of a character, and **the one place both copies of it are
 * written.**
 *
 * A hit point belongs to the character; the combatant holds the fight's copy;
 * one transaction writes both. That is the whole design and it is settled — the
 * thing it exists to prevent is two rows that can disagree about how hurt
 * somebody is, which at a table is the DM and the player reading different
 * numbers off two screens.
 *
 * Every function here is a fragment or a statement meant to run **inside the
 * caller's `sql.withTransaction`**. None of them opens one, for the same reason
 * `appendEvent` does not: the whole value is that the second write commits with
 * the first or not at all, and a helper that could be called outside a
 * transaction is a helper that eventually is.
 *
 * Two invariants are enforced here rather than remembered:
 *
 * - **A write-through that touches no row is a defect, not a shrug.** If a
 *   combatant names a character this actor cannot write, the two copies would
 *   silently part company; there is no path through the product that produces
 *   it (`character_id` is set only by seeding, from characters read in this
 *   campaign), so it dies rather than returning a half-applied result.
 * - **The clamp is one expression**, `clampedCombatantHp`, used by both entry
 *   points. Two spellings of `greatest(0, least(...))` is two chances for the
 *   in-fight and out-of-fight answers to differ by one.
 */

/**
 * The fight this character is in *right now*, if any.
 *
 * "Right now" is a run that has not ended, in this campaign, reachable by this
 * actor through the ordinary predicate — the campaign gate is
 * `containedRowWritable` over the shipped containment chain and not a join
 * condition of its own.
 *
 * **A character can legally be in two live fights**, because the one-live-run
 * index is per *session* and a carried fight plus a fresh one is exactly that
 * case (`0007_run_carryover.ts`). This takes the most recently seeded one and
 * the other keeps the number it had. It is rare, it is not corrupting — the
 * character's own copy is still the authoritative one — and the honest
 * treatment is to say so rather than to take a lock across two sessions.
 */
export interface LiveCombatant {
  readonly combatantId: CombatantId;
  readonly runId: EncounterRunId;
  readonly sessionId: SessionId;
}

interface LiveCombatantRow {
  readonly id: CombatantId;
  readonly encounter_run_id: EncounterRunId;
  readonly session_id: SessionId;
}

export const liveCombatantOf = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<LiveCombatant | undefined, never> =>
  sql<LiveCombatantRow>`
    select combatant.id, combatant.encounter_run_id,
           (select encounter_run.session_id from encounter_run
            where encounter_run.id = combatant.encounter_run_id) as session_id
    from combatant
    where combatant.character_id = ${characterId}
      and exists (select 1 from encounter_run
                  where encounter_run.id = combatant.encounter_run_id
                    and encounter_run.ended_at is null)
      and ${containedRowWritable(sql, COMBATANT, campaignId, actor)}
    order by combatant.created_at desc, combatant.id desc
    limit 1
  `.pipe(
    Effect.map((rows) =>
      rows[0] === undefined
        ? undefined
        : {
            combatantId: rows[0].id,
            runId: rows[0].encounter_run_id,
            sessionId: rows[0].session_id,
          },
    ),
    Effect.orDie,
  );

/**
 * The fight's clamp, as a fragment: `[0, hp_max]`, in SQL.
 *
 * In SQL rather than in TypeScript so it is atomic with the read — two hits
 * landing together must total both, and a read-modify-write here would lose
 * one. It reads `combatant.hp_max`, so it belongs in a statement whose target
 * is `combatant`.
 */
export const clampedCombatantHp = (sql: SqlClient.SqlClient, amount: number): Statement.Fragment =>
  sql`greatest(0, least(combatant.hp_max, combatant.hp_current - ${amount}))`;

/**
 * The same clamp for a character with no fight to borrow one from.
 *
 * `coalesce(hp_current, hp_max, 0)` is the base, which is the whole of what
 * "null means nobody has said" costs: a character nobody has damaged counts
 * down from full. The ceiling is `hp_max` where there is one and the column's
 * own bound where there is not — a character with no maximum can still be hurt
 * and healed, it just has nothing to be restored *to*.
 */
const clampedCharacterHp = (sql: SqlClient.SqlClient, amount: number): Statement.Fragment =>
  sql`greatest(0, least(coalesce(character.hp_max, 10000),
                        coalesce(character.hp_current, character.hp_max, 0) - ${amount}))`;

/** What a write-through carries. Both are optional; neither may be null. */
export interface CharacterVitals {
  readonly hpCurrent?: number | undefined;
  readonly conditions?: ReadonlyArray<string> | undefined;
}

/**
 * Copy the fight's numbers onto the character they belong to.
 *
 * Called from inside `Combatants.damage` and `Combatants.update`, in their
 * transaction, so the two rows move together or not at all. The predicate is
 * `rowWritable` over `character` — the seam is composed, not restated, and the
 * campaign is bound so a combatant that somehow named a character in another
 * campaign could not reach it.
 *
 * Dies when nothing was updated. See the header: silence here is the exact
 * failure this module exists to prevent.
 */
export const writeThroughToCharacter = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  campaignId: CampaignId,
  actor: Actor,
  vitals: CharacterVitals,
): Effect.Effect<void, never> => {
  const columns: Record<string, unknown> = {};
  if (vitals.hpCurrent !== undefined) columns["hp_current"] = vitals.hpCurrent;
  if (vitals.conditions !== undefined) columns["conditions"] = vitals.conditions;
  if (Object.keys(columns).length === 0) return Effect.void;

  return sql<{ readonly id: CharacterId }>`
    update character set ${sql.update(columns)}, updated_at = now()
    where character.id = ${characterId}
      and ${rowWritable(sql, "character", campaignId, actor)}
    returning character.id
  `.pipe(
    Effect.flatMap((rows) =>
      rows.length === 1
        ? Effect.void
        : Effect.die(
            new Error(
              `write-through left a combatant and character ${characterId} disagreeing: ${String(rows.length)} rows updated`,
            ),
          ),
    ),
    Effect.orDie,
  );
};

/**
 * The other direction: a condition set on the character reaches the fight.
 *
 * Only conditions, because they are the only value both tables hold that this
 * direction can set absolutely — a hit point moves by delta and goes through
 * `applyCharacterDelta` below, and `temp_hp` has no copy on `combatant` at all.
 *
 * Unlike the write-through above this touches *every* live combatant for the
 * character rather than one, and does not mind touching none: the character may
 * be in no fight, which is the ordinary case.
 */
export const writeThroughToLiveCombatants = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  campaignId: CampaignId,
  actor: Actor,
  conditions: ReadonlyArray<string>,
): Effect.Effect<void, never> =>
  sql`
    update combatant set conditions = ${conditions}, updated_at = now()
    where combatant.character_id = ${characterId}
      and exists (select 1 from encounter_run
                  where encounter_run.id = combatant.encounter_run_id
                    and encounter_run.ended_at is null)
      and ${containedRowWritable(sql, COMBATANT, campaignId, actor)}
  `.pipe(Effect.asVoid, Effect.orDie);

/** What a delta did, and where. */
export interface AppliedDelta {
  readonly hpCurrent: number;
  /** The fight it went through, if it went through one. */
  readonly live: LiveCombatant | undefined;
}

/**
 * Apply a signed delta to a character's hit points, wherever they are.
 *
 * **In a fight the combatant is written first and the character is written from
 * its result.** That is not an ordering preference: it means there is one clamp
 * — the fight's, bounded by the combatant's snapshotted `hp_max` — and the
 * character takes the number the fight produced rather than computing a second
 * one from its own maximum. Two clamps is how the two rows come to differ by
 * one after a heal.
 *
 * Out of a fight there is nothing to clamp against but the character's own
 * maximum, and nothing else to write.
 */
export const applyCharacterDelta = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  campaignId: CampaignId,
  actor: Actor,
  amount: number,
  live: LiveCombatant | undefined,
): Effect.Effect<AppliedDelta, never> =>
  Effect.gen(function* () {
    if (live !== undefined) {
      const rows = yield* sql<{ readonly hp_current: number }>`
        update combatant
        set hp_current = ${clampedCombatantHp(sql, amount)}, updated_at = now()
        where combatant.id = ${live.combatantId}
          and ${containedRowWritable(sql, COMBATANT, campaignId, actor)}
        returning combatant.hp_current
      `.pipe(Effect.orDie);
      // The lookup that produced `live` applied the same predicate one
      // statement ago, in this transaction. A miss here is the same
      // disagreement `writeThroughToCharacter` refuses, met from the other end.
      if (rows.length !== 1) {
        return yield* Effect.die(
          new Error(`live combatant ${live.combatantId} vanished mid-transaction`),
        );
      }
      const hpCurrent = rows[0]!.hp_current;
      yield* writeThroughToCharacter(sql, characterId, campaignId, actor, { hpCurrent });
      return { hpCurrent, live };
    }

    const rows = yield* sql<{ readonly hp_current: number }>`
      update character
      set hp_current = ${clampedCharacterHp(sql, amount)}, updated_at = now()
      where character.id = ${characterId}
        and ${rowWritable(sql, "character", campaignId, actor)}
      returning character.hp_current
    `.pipe(Effect.orDie);
    if (rows.length !== 1) {
      return yield* Effect.die(new Error(`character ${characterId} vanished mid-transaction`));
    }
    return { hpCurrent: rows[0]!.hp_current, live: undefined };
  });

/**
 * The night this campaign is on, if it is on one.
 *
 * **This is the whole of what "during a session" means**, and it is the
 * campaign's own pointer rather than a timestamp heuristic — the same
 * resolution `repo/Proposals.ts` uses to decide which night an accepted beat
 * belongs to. `campaign.current_session_id` cannot name a finished session
 * (`0006_session_finished.ts` makes that unrepresentable), so a night that is
 * over answers nothing here without anything having to check.
 */
export const currentSessionOf = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<SessionId | undefined, never> =>
  sql<{ readonly current_session_id: SessionId | null }>`
    select campaign.current_session_id from campaign
    where campaign.id = ${campaignId} and ${campaignWritableById(sql, campaignId, actor)}
  `.pipe(
    Effect.map((rows) => rows[0]?.current_session_id ?? undefined),
    Effect.orDie,
  );

/**
 * Where a character write does and does not ring the doorbell.
 *
 * **Keyed on the session, and that is a decision rather than a limitation.** A
 * level-up typed on a Tuesday between games rings nothing and updates nobody
 * live: an open page stays stale until it refetches, which a query library's
 * stale-while-revalidate covers for nearly nothing. The alternative — a second
 * fan-out keyed on the campaign — is a second `PubSub` with its own lifecycle,
 * a second cursor with no `seq` to hang off, and a reconnect path that is not
 * the one every other event already exercises, bought for the least urgent
 * case. The session key is also the honest scope: the decision this implements
 * says *during a session*.
 *
 * So this returns nothing when there is no session, and the caller rings
 * nothing. **That is not a gap somebody forgot.**
 *
 * `encounterRunId` is set alongside `combatantId` when the write went through a
 * fight, even though the plan only names the second. Without it the event is
 * invisible to `SessionEvents.pollForRun`, which filters the live stream on the
 * run — and an event no consumer can read is worse than no event.
 *
 * **Only a character-side write appends this.** `Combatants.damage` and
 * `Combatants.update` write the character through in their own transaction and
 * append nothing extra: they have already recorded the same change, naming the
 * same combatant, with the same number. See `writeThrough` there.
 */
export const characterUpdated = (args: {
  readonly sessionId: SessionId;
  readonly characterId: CharacterId;
  readonly live?: LiveCombatant | undefined;
  readonly detail?: Record<string, unknown> | undefined;
  readonly requestId?: string | undefined;
}): AppendEvent => ({
  sessionId: args.sessionId,
  kind: "character-updated",
  encounterRunId: args.live?.runId,
  combatantId: args.live?.combatantId,
  // `characterId` is in the payload rather than in a column of its own because
  // nothing filters the log by character — the two id columns exist because the
  // stream and the recap filter on them, and this is the human-legible
  // remainder the schema documents.
  payload: { characterId: args.characterId, ...args.detail },
  requestId: args.requestId,
});

/** Append it, in the caller's transaction. Reads better than the pair at each site. */
export const appendCharacterUpdated = (
  sql: SqlClient.SqlClient,
  args: Parameters<typeof characterUpdated>[0],
): Effect.Effect<void, never> => Effect.asVoid(appendEvent(sql, characterUpdated(args)));
