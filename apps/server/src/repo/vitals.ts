import {
  type Actor,
  type CampaignId,
  CharacterId,
  CombatantId,
  type DeathSaves,
  EncounterRunId,
  SessionId,
} from "@taverns/api";
import { Effect, Option, Schema } from "effect";
import { type SqlClient, SqlSchema, type Statement } from "effect/sql";
import { COMBATANT } from "./liveTables.js";
import { fromColumns, textArray } from "./rows.js";
import type { AppendEvent } from "./SessionEvents.js";
import { appendEvent } from "./SessionEvents.js";
import {
  campaignWritableById,
  characterVitalsWritable,
  containedRowWritable,
} from "./visibility.js";

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
const LiveCombatantRow = fromColumns(
  Schema.Struct({ combatantId: CombatantId, runId: EncounterRunId, sessionId: SessionId }),
  { combatantId: "id", runId: "encounter_run_id" },
);
export type LiveCombatant = typeof LiveCombatantRow.Type;

export const liveCombatantOf = (
  sql: SqlClient.SqlClient,
  characterId: CharacterId,
  campaignId: CampaignId,
  actor: Actor,
): Effect.Effect<LiveCombatant | undefined, never> =>
  SqlSchema.findOneOption({
    Request: Schema.toType(CharacterId),
    Result: LiveCombatantRow,
    execute: (id) => sql`
      select combatant.id, combatant.encounter_run_id,
             (select encounter_run.session_id from encounter_run
              where encounter_run.id = combatant.encounter_run_id) as session_id
      from combatant
      where combatant.character_id = ${id}
        and exists (select 1 from encounter_run
                    where encounter_run.id = combatant.encounter_run_id
                      and encounter_run.ended_at is null)
        and ${containedRowWritable(sql, COMBATANT, campaignId, actor)}
      order by combatant.created_at desc, combatant.id desc
      limit 1
    `,
  })(characterId).pipe(Effect.map(Option.getOrUndefined), Effect.orDie);

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
export const clampedCharacterHp = (sql: SqlClient.SqlClient, amount: number): Statement.Fragment =>
  sql`greatest(0, least(coalesce(character.hp_max, 10000),
                        coalesce(character.hp_current, character.hp_max, 0) - ${amount}))`;

/**
 * **The death-save rule a change of hit points carries**, as the two `set`
 * assignments that apply it — in the same statement as the hit points, so it
 * reads the number from before the change and is atomic with it.
 *
 * - Damage to a creature already at zero adds a failure, or `failuresOnHit`
 *   (two for a critical). Both counts stop at three. A stable creature (three
 *   successes) that is hit is dying again: its successes go back to zero.
 * - Any healing from zero clears both counts.
 * - Anything else leaves them as they are; dropping *to* zero adds nothing.
 *
 * `applies` is who makes death saves at all — a player character — and a row
 * it does not hold for keeps its counts untouched.
 */
const deathSavesAfter = (
  sql: SqlClient.SqlClient,
  args: {
    readonly table: "combatant" | "character";
    readonly applies: Statement.Fragment;
    readonly hpBefore: Statement.Fragment;
    readonly hpAfter: Statement.Fragment;
    /** Zero unless this change is damage. */
    readonly failuresOnHit: number;
  },
): Statement.Fragment => {
  const { table, applies, hpBefore, hpAfter, failuresOnHit } = args;
  const failures = sql(`${table}.death_save_failures`);
  const successes = sql(`${table}.death_save_successes`);
  const failed =
    failuresOnHit > 0
      ? sql`when (${applies}) and ${hpBefore} = 0
              then least(3, ${failures} + ${failuresOnHit}::integer)`
      : sql``;
  const destabilised =
    failuresOnHit > 0
      ? sql`when (${applies}) and ${hpBefore} = 0 and ${successes} >= 3 then 0`
      : sql``;
  return sql`
    death_save_failures = case
      ${failed}
      when (${applies}) and ${hpBefore} = 0 and ${hpAfter} > 0 then 0
      else ${failures}
    end,
    death_save_successes = case
      ${destabilised}
      when (${applies}) and ${hpBefore} = 0 and ${hpAfter} > 0 then 0
      else ${successes}
    end
  `;
};

/**
 * {@link deathSavesAfter} for the fight's copy and a delta through
 * {@link clampedCombatantHp}. Only a `pc` row makes death saves; an NPC's
 * counts are never moved, and the wire draws them as `null`.
 */
export const combatantDeathSavesAfterDelta = (
  sql: SqlClient.SqlClient,
  amount: number,
  critical: boolean,
): Statement.Fragment =>
  deathSavesAfter(sql, {
    table: "combatant",
    applies: sql`combatant.kind = 'pc'`,
    hpBefore: sql`combatant.hp_current`,
    hpAfter: clampedCombatantHp(sql, amount),
    failuresOnHit: amount > 0 ? (critical ? 2 : 1) : 0,
  });

/**
 * {@link deathSavesAfter} for the fight's copy and an absolute hit-point
 * total — the DM's *Edit*. Setting a number is never a hit, so this can only
 * clear the counts, when it lifts a player character off zero.
 */
export const combatantDeathSavesAfterSet = (
  sql: SqlClient.SqlClient,
  hpCurrent: number,
): Statement.Fragment =>
  deathSavesAfter(sql, {
    table: "combatant",
    applies: sql`combatant.kind = 'pc'`,
    hpBefore: sql`combatant.hp_current`,
    hpAfter: sql`${hpCurrent}::integer`,
    failuresOnHit: 0,
  });

/**
 * {@link deathSavesAfter} for a character with no fight, against `hpAfter` —
 * {@link clampedCharacterHp} for a delta, or a rest's total. A character
 * nobody has damaged counts down from full, as the clamp does.
 */
export const characterDeathSavesAfter = (
  sql: SqlClient.SqlClient,
  hpAfter: Statement.Fragment,
  amount: number,
): Statement.Fragment =>
  deathSavesAfter(sql, {
    table: "character",
    applies: sql`true`,
    hpBefore: sql`coalesce(character.hp_current, character.hp_max, 0)`,
    hpAfter,
    failuresOnHit: amount > 0 ? 1 : 0,
  });

/** What a write-through carries. All are optional; none may be null. */
export interface CharacterVitals {
  readonly hpCurrent?: number | undefined;
  readonly conditions?: ReadonlyArray<string> | undefined;
  readonly deathSaves?: DeathSaves | undefined;
}

/**
 * Copy the fight's numbers onto the character they belong to.
 *
 * Called from inside `Combatants.damage` and `Combatants.update`, in their
 * transaction, so the two rows move together or not at all. The authority is
 * `campaignWritableById` — the caller is the campaign's creator, writing a
 * fight in their own campaign through — and the *containment* is the seed-time
 * pointer: `combatant.character_id` is written only by the seed, from seats
 * this campaign holds, so the character a combatant names is one this table
 * seated. The shared character is account-owned now, so there is no campaign
 * predicate over `character` for this to compose; what bounds the reach is
 * which combatants exist.
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
  if (vitals.conditions !== undefined) columns["conditions"] = textArray(vitals.conditions);
  if (vitals.deathSaves !== undefined) {
    columns["death_save_successes"] = vitals.deathSaves.successes;
    columns["death_save_failures"] = vitals.deathSaves.failures;
  }
  if (Object.keys(columns).length === 0) return Effect.void;

  return sql<{ readonly id: CharacterId }>`
    update character set ${sql.update(columns)}, updated_at = now()
    where character.id = ${characterId}
      and ${campaignWritableById(sql, campaignId, actor)}
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
    update combatant set conditions = ${textArray(conditions)}, updated_at = now()
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
 *
 * Either way the death saves move with the number, by {@link deathSavesAfter}:
 * this path carries no critical, so a hit at zero is one failure.
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
      const rows = yield* sql<{
        readonly hp_current: number;
        readonly kind: "pc" | "npc";
        readonly death_save_successes: number;
        readonly death_save_failures: number;
      }>`
        update combatant
        set hp_current = ${clampedCombatantHp(sql, amount)},
            ${combatantDeathSavesAfterDelta(sql, amount, false)},
            updated_at = now()
        where combatant.id = ${live.combatantId}
          and ${containedRowWritable(sql, COMBATANT, campaignId, actor)}
        returning combatant.hp_current, combatant.kind,
                  combatant.death_save_successes, combatant.death_save_failures
      `.pipe(Effect.orDie);
      // The lookup that produced `live` applied the same predicate one
      // statement ago, in this transaction. A miss here is the same
      // disagreement `writeThroughToCharacter` refuses, met from the other end.
      if (rows.length !== 1) {
        return yield* Effect.die(
          new Error(`live combatant ${live.combatantId} vanished mid-transaction`),
        );
      }
      const row = rows[0]!;
      const hpCurrent = row.hp_current;
      yield* writeThroughToCharacter(sql, characterId, campaignId, actor, {
        hpCurrent,
        deathSaves:
          row.kind === "pc"
            ? { successes: row.death_save_successes, failures: row.death_save_failures }
            : undefined,
      });
      return { hpCurrent, live };
    }

    // Out of a fight the reach is `characterVitalsWritable`: the character is
    // *seated* at this campaign right now, and the actor is its creator. A
    // retired seat takes the delta path away with it — the campaign has no
    // live claim on the shared row once nobody sits there.
    const rows = yield* sql<{ readonly hp_current: number }>`
      update character
      set hp_current = ${clampedCharacterHp(sql, amount)},
          ${characterDeathSavesAfter(sql, clampedCharacterHp(sql, amount), amount)},
          updated_at = now()
      where character.id = ${characterId}
        and ${characterVitalsWritable(sql, campaignId, actor)}
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
  characterId: args.characterId,
  // Kept in the payload too for the old human-readable log; the player stream
  // filters on the column and sends only a contentless tick.
  payload: { characterId: args.characterId, ...args.detail },
  visibility: "shared",
  requestId: args.requestId,
});

/** Append it, in the caller's transaction. Reads better than the pair at each site. */
export const appendCharacterUpdated = (
  sql: SqlClient.SqlClient,
  args: Parameters<typeof characterUpdated>[0],
): Effect.Effect<void, never> => Effect.asVoid(appendEvent(sql, characterUpdated(args)));
