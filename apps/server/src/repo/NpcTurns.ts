import {
  type BoardArea,
  type BoardSquare,
  attackDelivery,
  boardAreaOf,
  rollOutcomeOf,
  damageTypeOf,
  type AssistantTurnId,
  attackLands,
  attackModeAt,
  type AttackRoll,
  combineModes,
  coveredAc,
  coverLine,
  type NpcAim,
  abilityKeyOf,
  type Combatant,
  type CombatantId,
  Conflict,
  CurrentActor,
  type DamageRoll,
  damageAfterSave,
  damageTotal,
  EncounterRunId,
  type HobKept,
  type HobKeptTurn,
  type HobTurnUndone,
  NpcTurnOutcome as NpcTurnOutcomeSchema,
  type HobPendingSave,
  type HobPendingSaveId,
  type HobSaveResolved,
  type HobTurnKeptPayload,
  NotFound,
  type NpcTarget,
  type NpcTurnAttack,
  type NpcTurnDamageRoll,
  type NpcTurnHit,
  type NpcTurnOption,
  type NpcTurnOutcome,
  type NpcTurnOutcomeStep,
  type NpcTurnProposalStep,
  type NpcTurnSave,
  type NpcTurnStep,
  npcTurnCheck,
  npcTurnOptions,
  rollAttack,
  rollDamages,
  rollDiceExpression,
  saveModifier,
  type SessionId,
  signed,
  type StatBlock,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { Dice } from "../live/Dice.js";
import { LiveEvents } from "../live/LiveEvents.js";
import { Combatants, type CombatantSnapshot, snapshotOf } from "./Combatants.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { discardedConflict, HobThreads, lockTurnForAccept, markAccepted } from "./HobThreads.js";
import { underFog } from "./liveTables.js";
import { fileRoll } from "./Rolls.js";
import type { AssistantOrigin } from "./rows.js";
import { dieOnSqlError, fromColumns, textArray } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import { TableFight, turnFightOf } from "./TableFight.js";

/**
 * **A monster's turn Hob proposed, carried out** — the runner's *Keep*
 * (`hobFight.keep`). Rule 2 holds: the turn is built from the proposal the
 * server stored, never from the request, and the only writes are the runner's
 * own statements (`Combatants.inTurn`, `fileRoll`), each stamped with the turn
 * that proposed it.
 *
 * In one transaction: the turn is locked (so a second *Keep* waits, then finds
 * it kept), then the run and every row of the fight, in that order — the order
 * the DM's own writes take them. The fight is read again and its `fightStamp`
 * compared with the one the proposal was checked against: a fight that has
 * moved since is refused, and the DM asks again. The steps are checked again
 * with `npcTurnCheck`, the one legality rule; nothing here re-decides what is
 * legal. Then each step is carried out in order, with dice the server rolls
 * (`Dice`): a move through the move statement, which counts the feet; the
 * slot ticked and anything spent (a recharge, a use, a slot, legendary
 * actions) through the resources statement; an attack resolved by the shared
 * rule (`rollAttack`) and filed as the DM's roll, its damage through the
 * damage statement, so dropping to zero, a concentration save and a death
 * save failure land as they do for the DM; a save-for-damage rolled once, a
 * monster target's save rolled from its stat block and the damage halved or
 * not by the source's word.
 *
 * What the data cannot carry out is left alone and said, in the outcome's
 * `notes`: a party member's save is the player's to roll; damage resistance,
 * immunity and vulnerability, a rider save on a hit, a condition named only in
 * prose, an attack on an unconscious creature, and anything with nothing to
 * roll are the DM's to judge.
 *
 * Every row the turn touched is snapshotted before and after
 * (`hob_npc_turn_row`), the outcome is stored (`hob_npc_turn`), the turn's
 * narration is logged at the acting creature's visibility (`hob-turn-kept`),
 * and the turn is marked kept. The doorbell rings once that has committed.
 */
export class NpcTurns extends Context.Service<
  NpcTurns,
  {
    readonly keep: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<NpcTurnOutcome, NotFound | Conflict>;
    /** The run's kept turns, newest first: what came of each, and whether it was undone. */
    readonly kept: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<HobKeptTurn>, NotFound>;
    /**
     * **The latest kept turn, taken back.** In one transaction, the run and
     * its rows held as the keep holds them: each row the turn touched is put
     * back as the turn found it (`hob_npc_turn_row.before`), but only when it
     * still stands as the turn left it (`after`, which a resolved save moves),
     * so nothing a person did since is lost; a row that has moved is a
     * `Conflict` naming it, and the DM puts it right by hand. Restoring the
     * snapshot rather than playing the writes backwards is what keeps a
     * dropped concentration, a crossing of zero and a death save failure
     * honest. The turn's rolls stay (they go only with their night), marked
     * undone; the saves it left pending lapse; `hob-turn-undone` is logged at
     * the visibility its narration had. An earlier turn, one already undone
     * and a fight that is over are `Conflict`.
     */
    readonly undo: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      turnId: AssistantTurnId,
    ) => Effect.Effect<HobTurnUndone, NotFound | Conflict>;
    /** The run's saves its kept turns could not roll, oldest first, in every state. */
    readonly saves: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<HobPendingSave>, NotFound>;
    /**
     * A pending save resolved from the total the DM entered: the damage its
     * turn rolled, all, half or none of it by the source's word, through the
     * runner's damage statement and stamped with that turn. The target's
     * snapshot on the turn moves with it, so an undo compares against the
     * state the save left. Resolved, lapsed, a fight that is over and a target
     * that left it are `Conflict`.
     */
    readonly resolveSave: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      saveId: HobPendingSaveId,
      total: number,
    ) => Effect.Effect<HobSaveResolved, NotFound | Conflict>;
  }
>()("NpcTurns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;
      const dice = yield* Dice;
      const combatants = yield* Combatants;
      const tableFight = yield* TableFight;
      const threads = yield* HobThreads;

      const keepIn = (
        dm: CampaignCreatorActor,
        sessionId: SessionId,
        runId: EncounterRunId,
        turnId: AssistantTurnId,
      ) =>
        Effect.gen(function* () {
          const thread = yield* threads.ofFight(dm, sessionId, runId);
          const turn = yield* lockTurnForAccept(sql, "dm", dm.campaign, thread.id, turnId).pipe(
            Effect.provideService(CurrentActor, dm.actor),
          );
          const proposal = turn.proposal;
          if (proposal === null || proposal.target !== "npcTurn" || proposal.runId !== runId) {
            return yield* new NotFound({ resource: "proposal", id: turnId });
          }
          if (turn.acceptedAt !== null) return yield* alreadyKept;
          if (turn.discardedAt !== null) return yield* discardedConflict;

          // The fight, held still: the run, then every row of it in a fixed
          // order, before it is read, so nothing moves between the stamp and
          // the last write.
          yield* sql`select encounter_run.id from encounter_run where encounter_run.id = ${runId} for update`;
          yield* sql`
            select combatant.id from combatant
            where combatant.encounter_run_id = ${runId}
            order by combatant.id
            for update
          `;
          const read = yield* tableFight.read(dm, sessionId, runId);
          if (read.stamp !== proposal.stamp) return yield* stale;

          const fight = turnFightOf(read);
          const selfId = proposal.combatantId;
          const nameOf = (id: CombatantId) =>
            read.combatants.find((row) => row.id === id)?.displayName ?? "someone";
          const checked = npcTurnCheck(
            fight,
            selfId,
            proposal.moment,
            proposal.steps.map(checkStepOf),
            nameOf,
          );
          if (!checked.ok) {
            return yield* new Conflict({
              message: `That turn no longer stands (${checked.reason}). Ask Hob again.`,
            });
          }

          // Every option the creature had as the turn began, its strikes too:
          // what each step's numbers are read from. The check has already said
          // each was legal when its step came.
          const byId = new Map<string, NpcTurnOption>();
          for (const option of npcTurnOptions(fight, selfId).options) {
            byId.set(option.id, option);
            for (const strike of option.strikes ?? []) byId.set(strike.option.id, strike.option);
          }

          const from: AssistantOrigin = { assistantTurnId: turnId };
          // The record first, so a save left pending can name it; the outcome
          // is written once the steps have made it.
          const recorded = yield* sql<{ readonly id: string }>`
            insert into hob_npc_turn ${sql.insert({
              session_id: sessionId,
              encounter_run_id: runId,
              assistant_turn_id: turnId,
              combatant_id: selfId,
              outcome: "{}",
            })}
            returning hob_npc_turn.id
          `.pipe(dieOnSqlError);
          const recordId = recorded[0]!.id;
          const rows = new Map(read.combatants.map((row) => [row.id, row] as const));
          const rowOf = (id: CombatantId) => rows.get(id);
          const selfName = nameOf(selfId);
          const statBlockOf = (row: Combatant): StatBlock | undefined =>
            row.creatureId === null ? undefined : fight.statBlocks.get(row.creatureId);
          const touched = new Set<CombatantId>([selfId]);

          const file = (roll: Parameters<typeof fileRoll>[1]) =>
            fileRoll(sql, roll).pipe(dieOnSqlError);
          const rollBase = {
            campaignId: dm.campaign,
            sessionId,
            runId,
            accountId: dm.actor.accountId,
            visibility: "dm" as const,
            from,
          };

          // Each act's dice share a request stem (`<stem>:<n>`), as the
          // runner files the DM's, so the log prints an attack and its damage
          // as one line.
          /** A damage type a roll can keep, when the line's is one of the thirteen. */
          const typeOf = (written: string | null | undefined) => {
            const damageType = damageTypeOf(written);
            return damageType === undefined ? {} : { damageType };
          };

          let acts = 0;
          const stem = () => `hob-${turnId}-${String(acts++)}`;
          const damageRolls = (
            label: string,
            damage: ReadonlyArray<DamageRoll>,
            about: { readonly combatantId: CombatantId; readonly targetCombatantId?: CombatantId },
            act: string,
            first: number,
            area?: BoardArea,
          ) =>
            Effect.forEach(damage, (roll, index) =>
              file({
                ...rollBase,
                ...about,
                // Where the area went, once for the act: on its first damage roll.
                ...(area === undefined || index > 0 ? {} : { area }),
                requestId: `${act}:${String(first + index)}`,
                label: rollLabel(label),
                notation: roll.notation,
                dice: roll.faces,
                kept: roll.faces,
                modifier: roll.modifier,
                total: roll.total,
                mode: "normal",
                kind: "damage",
                ...typeOf(roll.type),
              }),
            );

          /** Damage through the runner's statement; what the target lost, and who dropped. */
          const hurt = (target: CombatantId, amount: number, critical: boolean) =>
            Effect.gen(function* () {
              const hit = yield* combatants.inTurn.damage(
                dm,
                sessionId,
                runId,
                target,
                { amount, critical },
                from,
              );
              rows.set(target, hit.combatant);
              return {
                amount,
                hpBefore: hit.hpBefore,
                hpAfter: hit.combatant.hpCurrent,
                dropped: hit.hpBefore > 0 && hit.combatant.hpCurrent === 0,
                ...(hit.concentrationDc === undefined
                  ? {}
                  : { concentrationDc: hit.concentrationDc }),
              } satisfies NpcTurnHit;
            });

          /** What a target's stat block says about damage of these types, for the DM to judge. */
          const resistanceNote = (row: Combatant, damage: ReadonlyArray<DamageRoll>) => {
            const types = damage.flatMap((roll) => (roll.type === undefined ? [] : [roll.type]));
            const block = statBlockOf(row);
            if (block === undefined || types.length === 0) return [];
            const lists = [
              ["resistances", block.damageResistances],
              ["immunities", block.damageImmunities],
              ["vulnerabilities", block.damageVulnerabilities],
            ] as const;
            const listed = lists.flatMap(([word, entries]) =>
              entries === undefined || entries.length === 0
                ? []
                : [`${word}: ${entries.join("; ")}`],
            );
            return listed.length === 0
              ? []
              : [
                  `${row.displayName} lists damage ${listed.join(" — ")}. The ${types.join(
                    " and ",
                  )} damage went in full; adjust it by hand if one applies.`,
                ];
          };

          const attack = (
            option: NpcTurnOption,
            targetId: CombatantId,
            band: NpcTarget["band"] | undefined,
            aim: NpcAim | undefined,
            notes: Array<string>,
          ) =>
            Effect.gen(function* () {
              const target = rowOf(targetId);
              const numbers = option.attack;
              if (target === undefined || numbers === undefined) return undefined;
              touched.add(targetId);
              if (target.kind === "npc" && target.hpCurrent <= 0) {
                notes.push(
                  `${target.displayName} was already down: ${option.name} was not rolled.`,
                );
                return undefined;
              }
              // On a level: cover adds to the AC it rolls against, and a
              // target that cannot see it is attacked at advantage, which a
              // long range's disadvantage cancels (`npcTurnCheck`'s aim).
              const cover = aim?.cover ?? "none";
              const rolled = rollAttack({
                toHit: numbers.toHit,
                damage: numbers.damage,
                ac: coveredAc(target.ac, cover),
                mode: combineModes([
                  attackModeAt(band),
                  aim?.unseenByTarget === true ? "advantage" : "normal",
                ]),
                random: dice.random,
              });
              const covered = coverLine(cover);
              if (covered !== undefined) notes.push(`${target.displayName}: ${covered}.`);
              if (aim?.unseenByTarget === true) {
                notes.push(
                  `${target.displayName} could not see ${selfName}: ${option.name} was rolled at advantage` +
                    (band === "long" ? ", cancelled by long range." : "."),
                );
              }
              const label = `${selfName} · ${option.name} → ${target.displayName}`;
              const delivery = attackDelivery(numbers, band);
              const about = { combatantId: selfId, targetCombatantId: targetId };
              const outcome = rollOutcomeOf(rolled.verdict);
              const act = stem();
              yield* file({
                ...rollBase,
                ...about,
                requestId: `${act}:0`,
                label: rollLabel(label),
                notation: `1d20${signed(rolled.toHit)}`,
                dice: rolled.d20s,
                kept: [rolled.d20],
                modifier: rolled.toHit,
                total: rolled.total,
                mode: rolled.mode,
                ...(rolled.d20 === 20 ? { critical: "hit" as const } : {}),
                ...(rolled.d20 === 1 ? { critical: "miss" as const } : {}),
                kind: "attack",
                ...(rolled.ac === null ? {} : { targetAc: rolled.ac }),
                ...(outcome === undefined ? {} : { outcome }),
                // What it was, for the board to draw: the same rule the runner's strike files by.
                ...(delivery === undefined ? {} : { delivery }),
                ...typeOf(numbers.damage[0]?.type),
              });
              yield* damageRolls(label, rolled.damage, about, act, 1);

              if (target.conditions.some((condition) => /^unconscious$/i.test(condition))) {
                notes.push(
                  `${target.displayName} was unconscious: an attack on it has advantage, and a ` +
                    "melee hit within 5 feet is a critical. Neither was applied.",
                );
              }
              if (option.save !== undefined && attackLands(rolled.verdict)) {
                notes.push(
                  `${option.name} on a hit: a DC ${String(option.save.dc)} ${option.save.ability} ` +
                    `save for ${target.displayName}. Its text says what that does.`,
                );
              }
              let hit: NpcTurnHit | undefined;
              if (rolled.verdict === "no-ac") {
                notes.push(
                  `${target.displayName} has no AC written: ${String(rolled.total)} to hit, and ` +
                    `${String(rolled.amount)} damage rolled but not applied.`,
                );
              } else if (attackLands(rolled.verdict) && rolled.amount > 0) {
                hit = yield* hurt(targetId, rolled.amount, rolled.verdict === "critical");
                notes.push(...resistanceNote(target, rolled.damage));
              }
              return attackOutcome(option, target, rolled, hit);
            });

          const saveFor = (
            option: NpcTurnOption,
            targets: ReadonlyArray<CombatantId>,
            placement: { readonly origin: BoardSquare; readonly toward: BoardSquare } | undefined,
            notes: Array<string>,
          ) =>
            Effect.gen(function* () {
              const save = option.save!;
              const damage = rollDamages(save.damage, false, dice.random);
              const amount = damageTotal(damage);
              yield* damageRolls(
                `${selfName} · ${option.name}`,
                damage,
                { combatantId: selfId },
                stem(),
                0,
                option.area === undefined || placement === undefined
                  ? undefined
                  : boardAreaOf(option.area, placement),
              );
              if (save.damage.length > 0 && damage.length === 0) {
                notes.push(`${option.name}'s damage is not dice this can roll: none was applied.`);
              }
              if (save.damage.length === 0) {
                notes.push(
                  `${option.name}: what a failed save does is in its text; no condition was applied.`,
                );
              }
              const ability = abilityKeyOf(save.ability);
              const results: Array<NpcTurnSave> = [];
              /** A save the server will not roll, left to the DM with the damage it rolled. */
              const pend = (target: Combatant) =>
                sql<{ readonly id: HobPendingSaveId }>`
                  insert into hob_pending_save ${sql.insert({
                    hob_npc_turn_id: recordId,
                    encounter_run_id: runId,
                    combatant_id: target.id,
                    target_name: target.displayName,
                    option_name: option.name,
                    ability: save.ability,
                    dc: save.dc,
                    on_success: save.onSuccess,
                    amount,
                    damage_types: textArray(
                      damage.flatMap((rolled) => (rolled.type === undefined ? [] : [rolled.type])),
                    ),
                  })}
                  returning hob_pending_save.id
                `.pipe(
                  dieOnSqlError,
                  Effect.map((inserted) => inserted[0]!.id),
                );
              for (const targetId of targets) {
                const target = rowOf(targetId);
                if (target === undefined) continue;
                touched.add(targetId);
                const named = { combatantId: targetId, name: target.displayName };
                if (target.kind === "npc" && target.hpCurrent <= 0) {
                  notes.push(`${target.displayName} was already down: it made no save.`);
                  continue;
                }
                if (target.kind === "pc") {
                  // Hob never rolls for a player. The pending save says it
                  // waits, for as long as it does; a note would outlive that.
                  const pendingSaveId = yield* pend(target);
                  results.push({ target: named, roll: null, succeeded: null, pendingSaveId });
                  continue;
                }
                const block = statBlockOf(target);
                const modifier =
                  block === undefined || ability === undefined
                    ? undefined
                    : saveModifier(block, ability);
                if (modifier === undefined) {
                  notes.push(
                    `${target.displayName} has no ${save.ability} save written, so the server did ` +
                      "not roll it.",
                  );
                  const pendingSaveId = yield* pend(target);
                  results.push({ target: named, roll: null, succeeded: null, pendingSaveId });
                  continue;
                }
                const thrown = rollDiceExpression(
                  rollLabel(`${target.displayName} · ${save.ability} save, DC ${String(save.dc)}`),
                  `1d20${signed(modifier)}`,
                  "normal",
                  dice.random,
                )!;
                yield* file({
                  ...rollBase,
                  combatantId: targetId,
                  requestId: `${stem()}:0`,
                  label: thrown.label,
                  notation: thrown.notation,
                  dice: thrown.dice,
                  kept: thrown.kept,
                  modifier: thrown.modifier,
                  total: thrown.total,
                  mode: "normal",
                  ...(thrown.natural === 20 ? { critical: "hit" as const } : {}),
                  ...(thrown.natural === 1 ? { critical: "miss" as const } : {}),
                  kind: "save",
                });
                const succeeded = thrown.total >= save.dc;
                const through = damageAfterSave(amount, succeeded, save.onSuccess);
                if (through.judged) {
                  notes.push(
                    `${option.name} says "${save.onSuccess}" on a success: ${target.displayName} ` +
                      "took it in full; the DM rules.",
                  );
                }
                const hit =
                  through.amount > 0 ? yield* hurt(targetId, through.amount, false) : undefined;
                if (hit !== undefined) notes.push(...resistanceNote(target, damage));
                results.push({
                  target: named,
                  roll: { d20: thrown.kept[0]!, modifier, total: thrown.total },
                  succeeded,
                  ...(hit === undefined ? {} : { hit }),
                });
              }
              return {
                dc: save.dc,
                ability: save.ability,
                onSuccess: save.onSuccess,
                damage: damage.map(damageOutcome),
                targets: results,
              };
            });

          const outcomes: Array<NpcTurnOutcomeStep> = [];
          for (const step of checked.steps) {
            if (step.kind === "move") {
              const moved = yield* combatants.inTurn.move(
                dm,
                sessionId,
                runId,
                selfId,
                step.to,
                from,
              );
              rows.set(selfId, moved.combatant);
              outcomes.push({ kind: "move", to: step.to, feet: moved.feet });
              continue;
            }

            const option = byId.get(step.optionId);
            if (option === undefined) return yield* stale;
            const notes: Array<string> = [];

            // The slot, then what it spends.
            if (step.slot !== "legendary") {
              const ticked = yield* combatants.inTurn.turn(
                dm,
                sessionId,
                runId,
                selfId,
                step.slot === "action"
                  ? { actionUsed: true }
                  : step.slot === "bonus"
                    ? { bonusUsed: true }
                    : { reactionUsed: true },
                from,
              );
              rows.set(selfId, ticked);
            }
            const spends = [
              option.spends,
              ...(option.strikes ?? []).flatMap((strike) =>
                Array.from({ length: strike.count }, () => strike.option.spends),
              ),
            ];
            const spent = spentAfter(rowOf(selfId)!, spends);
            if (spent !== undefined) {
              const after = yield* combatants.inTurn.resources(
                dm,
                sessionId,
                runId,
                selfId,
                spent,
                from,
              );
              if (after !== undefined) rows.set(selfId, after);
            }

            const attacks: Array<NpcTurnAttack> = [];
            let save: Extract<NpcTurnOutcomeStep, { kind: "option" }>["save"];
            if (step.strikes !== undefined) {
              for (const strike of step.strikes) {
                const swing = byId.get(strike.optionId);
                if (swing === undefined) continue;
                if (swing.attack === undefined) {
                  // A strike that rolls nothing to hit (a dragon's Frightful
                  // Presence): its save and what it does are in its text.
                  notes.push(
                    `${swing.name} is part of ${option.name} with no attack roll: what its text ` +
                      "says is the DM's to apply.",
                  );
                  continue;
                }
                const made = yield* attack(swing, strike.target, strike.band, strike.aim, notes);
                if (made !== undefined) attacks.push(made);
              }
            } else if (option.attack !== undefined) {
              for (const target of step.targets) {
                const made = yield* attack(
                  option,
                  target,
                  step.bands?.[target],
                  step.aims?.[target],
                  notes,
                );
                if (made !== undefined) attacks.push(made);
              }
              if (option.attack.damage.length === 0) {
                notes.push(`${option.name} has no damage dice in the data: none was applied.`);
              }
            } else if (option.save !== undefined) {
              save = yield* saveFor(option, step.targets, step.placement, notes);
            } else {
              for (const target of step.targets) touched.add(target);
              notes.push(
                option.kind === "standard"
                  ? `${selfName} took the ${option.name} action.`
                  : `${option.name} has nothing to roll: what its text says is the DM's to apply.`,
              );
            }
            if (option.id === "standard/Dash") {
              notes.push(`${selfName} dashed: its feet moved can run past its speed this turn.`);
            }

            outcomes.push({
              kind: "option",
              optionId: option.id,
              name: option.name,
              slot: step.slot,
              attacks,
              ...(save === undefined ? {} : { save }),
              notes,
            });
          }

          const outcome: NpcTurnOutcome = {
            turnId,
            sessionId,
            runId,
            combatantId: selfId,
            combatantName: selfName,
            moment: proposal.moment,
            round: read.run.round,
            steps: outcomes,
            narration: proposal.narration,
            ...(proposal.line === undefined ? {} : { line: proposal.line }),
          };

          // The record: the outcome, and every touched row as it stood before
          // the turn and as it left it.
          const after = new Map(
            (yield* combatants.list(dm, sessionId, runId)).map((row) => [row.id, row] as const),
          );
          yield* sql`
            update hob_npc_turn set outcome = ${JSON.stringify(outcome)}
            where hob_npc_turn.id = ${recordId}
          `.pipe(dieOnSqlError);
          for (const id of touched) {
            const before = read.combatants.find((row) => row.id === id);
            const now = after.get(id);
            if (before === undefined || now === undefined) continue;
            yield* sql`
              insert into hob_npc_turn_row ${sql.insert({
                hob_npc_turn_id: recordId,
                combatant_id: id,
                combatant_name: before.displayName,
                before: JSON.stringify(snapshotOf(before)),
                after: JSON.stringify(snapshotOf(now)),
              })}
            `.pipe(dieOnSqlError);
          }

          // The narration, heard by the table only when a player could see the
          // creature act: it and its fight shown, and it not under fog where
          // the turn left it.
          const heard = yield* sql<{ readonly shared: boolean }>`
            select (combatant.visibility = 'shared'
                    and encounter_run.visibility = 'shared'
                    and not ${underFog(sql)}) as shared
            from combatant
            join encounter_run on encounter_run.id = combatant.encounter_run_id
            where combatant.id = ${selfId} and combatant.encounter_run_id = ${runId}
          `.pipe(dieOnSqlError);
          yield* appendEvent(sql, {
            sessionId,
            kind: "hob-turn-kept",
            encounterRunId: runId,
            combatantId: selfId,
            payload: {
              narration: proposal.narration,
              ...(proposal.line === undefined ? {} : { line: proposal.line }),
              combatantName: selfName,
              moment: proposal.moment,
              round: read.run.round,
            } satisfies typeof HobTurnKeptPayload.Encoded,
            visibility: heard[0]?.shared === true ? "shared" : "dm",
            origin: "assistant",
            assistantTurnId: turnId,
          });

          yield* markAccepted(sql, turnId, {
            accepted: "npcTurn",
            sessionId,
            runId,
            combatantId: selfId,
          } satisfies HobKept).pipe(dieOnSqlError);
          return outcome;
        });

      /** This run, in the proof's campaign and the named night; `NotFound` otherwise. */
      const ensureRun = (dm: CampaignCreatorActor, sessionId: SessionId, runId: EncounterRunId) =>
        sql<{ readonly ended: boolean }>`
          select encounter_run.ended_at is not null as ended
          from encounter_run
          join session on session.id = encounter_run.session_id
          where encounter_run.id = ${runId}
            and encounter_run.session_id = ${sessionId}
            and session.campaign_id = ${dm.campaign}
        `.pipe(
          dieOnSqlError,
          Effect.flatMap((found) =>
            found[0] === undefined
              ? Effect.fail(new NotFound({ resource: "encounter_run", id: runId }))
              : Effect.succeed(found[0]),
          ),
        );

      const savesOf = (runId: EncounterRunId, saveId: HobPendingSaveId | undefined) =>
        sql<PendingSaveRow>`
          select hob_pending_save.id, hob_npc_turn.assistant_turn_id as turn_id,
                 hob_pending_save.combatant_id, hob_pending_save.target_name,
                 hob_pending_save.option_name, hob_pending_save.ability, hob_pending_save.dc,
                 hob_pending_save.on_success, hob_pending_save.amount,
                 hob_pending_save.damage_types, hob_pending_save.total,
                 hob_pending_save.succeeded,
                 hob_pending_save.resolved_at is not null as resolved,
                 hob_pending_save.lapsed_at is not null as lapsed,
                 hob_pending_save.hob_npc_turn_id as record_id
          from hob_pending_save
          join hob_npc_turn on hob_npc_turn.id = hob_pending_save.hob_npc_turn_id
          where hob_pending_save.encounter_run_id = ${runId}
            ${saveId === undefined ? sql`` : sql`and hob_pending_save.id = ${saveId}`}
          order by hob_pending_save.created_at, hob_pending_save.id
          ${saveId === undefined ? sql`` : sql`for update of hob_pending_save`}
        `.pipe(dieOnSqlError);

      const keptOf = SqlSchema.findAll({
        Request: Schema.toType(EncounterRunId),
        Result: KeptRow,
        execute: (runId) => sql`
          select hob_npc_turn.outcome, hob_npc_turn.undone_at from hob_npc_turn
          where hob_npc_turn.encounter_run_id = ${runId}
          order by hob_npc_turn.created_at desc, hob_npc_turn.id desc
        `,
      });

      const undoIn = (
        dm: CampaignCreatorActor,
        sessionId: SessionId,
        runId: EncounterRunId,
        turnId: AssistantTurnId,
      ) =>
        Effect.gen(function* () {
          const run = yield* ensureRun(dm, sessionId, runId);
          yield* sql`select encounter_run.id from encounter_run where encounter_run.id = ${runId} for update`.pipe(
            dieOnSqlError,
          );
          yield* sql`
            select combatant.id from combatant
            where combatant.encounter_run_id = ${runId}
            order by combatant.id
            for update
          `.pipe(dieOnSqlError);
          const records = yield* sql<{
            readonly id: string;
            readonly assistant_turn_id: AssistantTurnId;
            readonly combatant_id: CombatantId | null;
            readonly undone: boolean;
          }>`
            select hob_npc_turn.id, hob_npc_turn.assistant_turn_id, hob_npc_turn.combatant_id,
                   hob_npc_turn.undone_at is not null as undone
            from hob_npc_turn
            where hob_npc_turn.encounter_run_id = ${runId}
            order by hob_npc_turn.created_at desc, hob_npc_turn.id desc
            for update
          `.pipe(dieOnSqlError);
          const record = records.find((row) => row.assistant_turn_id === turnId);
          if (record === undefined)
            return yield* new NotFound({ resource: "hob_npc_turn", id: turnId });
          if (record.undone)
            return yield* new Conflict({ message: "That turn was already undone." });
          if (run.ended) return yield* new Conflict({ message: "That fight is over." });
          if (records.find((row) => !row.undone)?.id !== record.id) {
            return yield* new Conflict({ message: "Only the latest Hob turn can be undone." });
          }

          const snapshots = yield* sql<{
            readonly combatant_id: CombatantId | null;
            readonly combatant_name: string;
            readonly before: unknown;
            readonly after: unknown;
          }>`
            select combatant_id, combatant_name, before, after from hob_npc_turn_row
            where hob_npc_turn_row.hob_npc_turn_id = ${record.id}
            order by combatant_name, id
          `.pipe(dieOnSqlError);
          const now = new Map(
            (yield* combatants.list(dm, sessionId, runId)).map((row) => [row.id, row] as const),
          );
          const moved: Array<string> = [];
          for (const row of snapshots) {
            const current = row.combatant_id === null ? undefined : now.get(row.combatant_id);
            if (current === undefined) {
              moved.push(`${row.combatant_name} has left the fight`);
              continue;
            }
            const changed = changedSince(parsed(row.after), snapshotOf(current));
            if (changed.length > 0) moved.push(`${row.combatant_name}'s ${changed.join(", ")}`);
          }
          if (moved.length > 0) {
            return yield* new Conflict({
              message: `That turn can't be undone, because something has moved since: ${moved.join(
                "; ",
              )}. Put it right by hand.`,
            });
          }

          const restored: Array<{ combatantId: CombatantId; name: string }> = [];
          for (const row of snapshots) {
            yield* combatants.inTurn.restore(
              dm,
              sessionId,
              runId,
              row.combatant_id!,
              parsed(row.before),
            );
            restored.push({ combatantId: row.combatant_id!, name: row.combatant_name });
          }
          yield* sql`
            update character_roll set undone_at = now(), updated_at = now()
            where character_roll.assistant_turn_id = ${turnId}
          `.pipe(dieOnSqlError);
          yield* sql`
            update hob_pending_save set lapsed_at = now(), updated_at = now()
            where hob_pending_save.hob_npc_turn_id = ${record.id}
              and hob_pending_save.resolved_at is null and hob_pending_save.lapsed_at is null
          `.pipe(dieOnSqlError);
          yield* sql`
            update hob_npc_turn
            set undone_at = now(), undone_by_account_id = ${dm.actor.accountId}, updated_at = now()
            where hob_npc_turn.id = ${record.id}
          `.pipe(dieOnSqlError);
          const heard = yield* sql<{ readonly visibility: "dm" | "shared" }>`
            select session_event.visibility from session_event
            where session_event.assistant_turn_id = ${turnId}
              and session_event.kind = 'hob-turn-kept'
          `.pipe(dieOnSqlError);
          yield* appendEvent(sql, {
            sessionId,
            kind: "hob-turn-undone",
            encounterRunId: runId,
            combatantId: record.combatant_id ?? undefined,
            payload: { turnId },
            visibility: heard[0]?.visibility ?? "dm",
          });
          return { turnId, restored } satisfies HobTurnUndone;
        });

      const resolveIn = (
        dm: CampaignCreatorActor,
        sessionId: SessionId,
        runId: EncounterRunId,
        saveId: HobPendingSaveId,
        total: number,
      ) =>
        Effect.gen(function* () {
          const run = yield* ensureRun(dm, sessionId, runId);
          // The run before the rows, as every live write takes them.
          yield* sql`select encounter_run.id from encounter_run where encounter_run.id = ${runId} for update`.pipe(
            dieOnSqlError,
          );
          const row = (yield* savesOf(runId, saveId))[0];
          if (row === undefined)
            return yield* new NotFound({ resource: "hob_pending_save", id: saveId });
          if (row.resolved)
            return yield* new Conflict({ message: "That save was already resolved." });
          if (row.lapsed) {
            return yield* new Conflict({
              message: "That save lapsed: its damage was never applied.",
            });
          }
          if (run.ended) return yield* new Conflict({ message: "That fight is over." });
          if (row.combatant_id === null) {
            return yield* new Conflict({ message: `${row.target_name} has left the fight.` });
          }

          const succeeded = total >= row.dc;
          const through = damageAfterSave(row.amount, succeeded, row.on_success);
          let hit: NpcTurnHit | null = null;
          if (through.amount > 0) {
            const hurt = yield* combatants.inTurn.damage(
              dm,
              sessionId,
              runId,
              row.combatant_id,
              { amount: through.amount, critical: false },
              { assistantTurnId: row.turn_id },
            );
            hit = {
              amount: through.amount,
              hpBefore: hurt.hpBefore,
              hpAfter: hurt.combatant.hpCurrent,
              dropped: hurt.hpBefore > 0 && hurt.combatant.hpCurrent === 0,
              ...(hurt.concentrationDc === undefined
                ? {}
                : { concentrationDc: hurt.concentrationDc }),
            };
            // An undo of the turn compares against the state this save left.
            yield* sql`
              update hob_npc_turn_row set after = ${JSON.stringify(snapshotOf(hurt.combatant))}
              where hob_npc_turn_row.hob_npc_turn_id = ${row.record_id}
                and hob_npc_turn_row.combatant_id = ${row.combatant_id}
            `.pipe(dieOnSqlError);
          }
          yield* sql`
            update hob_pending_save
            set total = ${total}, succeeded = ${succeeded}, resolved_at = now(),
                resolved_by_account_id = ${dm.actor.accountId}, updated_at = now()
            where hob_pending_save.id = ${saveId}
          `.pipe(dieOnSqlError);
          return {
            save: pendingSaveOf({ ...row, total, succeeded, resolved: true }),
            hit,
            judged: through.judged,
          } satisfies HobSaveResolved;
        });

      return {
        keep: (dm, sessionId, runId, turnId) =>
          dieOnSqlError(sql.withTransaction(keepIn(dm, sessionId, runId, turnId))).pipe(
            Effect.tap(() => live.touched(sessionId)),
          ),
        kept: (dm, sessionId, runId) =>
          Effect.gen(function* () {
            yield* ensureRun(dm, sessionId, runId);
            return yield* keptOf(runId).pipe(dieOnSqlError);
          }),
        undo: (dm, sessionId, runId, turnId) =>
          dieOnSqlError(sql.withTransaction(undoIn(dm, sessionId, runId, turnId))).pipe(
            Effect.tap(() => live.touched(sessionId)),
          ),
        saves: (dm, sessionId, runId) =>
          Effect.gen(function* () {
            yield* ensureRun(dm, sessionId, runId);
            return (yield* savesOf(runId, undefined)).map(pendingSaveOf);
          }),
        resolveSave: (dm, sessionId, runId, saveId, total) =>
          dieOnSqlError(sql.withTransaction(resolveIn(dm, sessionId, runId, saveId, total))).pipe(
            Effect.tap(() => live.touched(sessionId)),
          ),
      };
    }),
  );
}

const KeptRow = fromColumns(
  Schema.Struct({
    outcome: NpcTurnOutcomeSchema,
    undoneAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  }),
);

/** A jsonb column as the driver hands it back: parsed already, or text. */
const parsed = (value: unknown): CombatantSnapshot =>
  (typeof value === "string" ? JSON.parse(value) : value) as CombatantSnapshot;

/** A value in one spelling: sets sorted, keys sorted, so order is no change. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    Array.isArray(inner) && inner.every((item) => typeof item === "string")
      ? [...inner].sort()
      : inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
        : inner,
  );

const SNAPSHOT_WORDS: Record<keyof CombatantSnapshot, string> = {
  hpCurrent: "hit points",
  conditions: "conditions",
  deathSaves: "death saves",
  position: "square",
  feetMoved: "feet moved",
  actionUsed: "action",
  bonusUsed: "bonus action",
  reactionUsed: "reaction",
  legendarySpent: "legendary actions",
  rechargeSpent: "recharges",
  usesSpent: "uses",
  slotsSpent: "spell slots",
};

/** What differs between a row as a turn left it and as it stands, in words. */
const changedSince = (left: CombatantSnapshot, now: CombatantSnapshot): ReadonlyArray<string> =>
  (Object.keys(SNAPSHOT_WORDS) as Array<keyof CombatantSnapshot>)
    .filter((key) => canonical(left[key] ?? null) !== canonical(now[key] ?? null))
    .map((key) => SNAPSHOT_WORDS[key]);

interface PendingSaveRow {
  readonly id: HobPendingSaveId;
  readonly turn_id: AssistantTurnId;
  readonly combatant_id: CombatantId | null;
  readonly target_name: string;
  readonly option_name: string;
  readonly ability: string;
  readonly dc: number;
  readonly on_success: string;
  readonly amount: number;
  readonly damage_types: ReadonlyArray<string>;
  readonly total: number | null;
  readonly succeeded: boolean | null;
  readonly resolved: boolean;
  readonly lapsed: boolean;
  readonly record_id: string;
}

const pendingSaveOf = (row: PendingSaveRow): HobPendingSave => ({
  id: row.id,
  turnId: row.turn_id,
  combatantId: row.combatant_id,
  targetName: row.target_name,
  optionName: row.option_name,
  ability: row.ability,
  dc: row.dc,
  onSuccess: row.on_success,
  amount: row.amount,
  damageTypes: row.damage_types,
  state: row.resolved ? "resolved" : row.lapsed ? "lapsed" : "pending",
  total: row.total,
  succeeded: row.succeeded,
});

const alreadyKept = new Conflict({ message: "That turn was already kept." });
const stale = new Conflict({
  message: "The fight has changed since Hob proposed that turn. Ask Hob again.",
});

/** A stored step as `npcTurnCheck` takes one: the option and its aim, by id. */
const checkStepOf = (step: NpcTurnProposalStep): NpcTurnStep =>
  step.kind === "move"
    ? { option: "move", square: step.to }
    : {
        option: step.optionId,
        // A multiattack is aimed strike by strike; an area by where it goes.
        ...(step.strikes !== undefined
          ? { targets: step.strikes.map((strike) => strike.target.combatantId) }
          : step.placement !== undefined
            ? {}
            : { targets: step.targets.map((target) => target.combatantId) }),
        // A placement's `toward` is the square either kind of area is named by:
        // a cone's or a line's aim, and a point area's own centre.
        ...(step.placement === undefined ? {} : { square: step.placement.toward }),
      };

/** `character_roll.label` holds 80 characters. */
const rollLabel = (text: string): string => (text.length <= 80 ? text : `${text.slice(0, 79)}…`);

const damageOutcome = (roll: DamageRoll): NpcTurnDamageRoll => ({
  notation: roll.notation,
  faces: roll.faces,
  modifier: roll.modifier,
  total: roll.total,
  type: roll.type ?? null,
});

const attackOutcome = (
  option: NpcTurnOption,
  target: Combatant,
  rolled: AttackRoll,
  hit: NpcTurnHit | undefined,
): NpcTurnAttack => ({
  optionId: option.id,
  name: option.name,
  target: { combatantId: target.id, name: target.displayName },
  d20s: rolled.d20s,
  d20: rolled.d20,
  mode: rolled.mode,
  toHit: rolled.toHit,
  total: rolled.total,
  ac: rolled.ac,
  verdict: rolled.verdict,
  damage: rolled.damage.map(damageOutcome),
  ...(hit === undefined ? {} : { hit }),
});

/**
 * The resources write a step's spending asks, as the absolute values the
 * statement takes, or `undefined` when it spends nothing beyond its slot.
 */
const spentAfter = (
  row: Combatant,
  spends: ReadonlyArray<NpcTurnOption["spends"]>,
):
  | {
      legendarySpent?: number;
      rechargeSpent?: ReadonlyArray<string>;
      usesSpent?: Readonly<Record<string, number>>;
      slotsSpent?: Readonly<Record<string, number>>;
    }
  | undefined => {
  let legendary = 0;
  const recharge = new Set(row.rechargeSpent);
  const uses: Record<string, number> = { ...row.usesSpent };
  const slots: Record<string, number> = { ...row.slotsSpent };
  let any = false;
  const out: {
    legendarySpent?: number;
    rechargeSpent?: ReadonlyArray<string>;
    usesSpent?: Readonly<Record<string, number>>;
    slotsSpent?: Readonly<Record<string, number>>;
  } = {};
  for (const spend of spends) {
    if (spend.legendary !== undefined) {
      legendary += spend.legendary;
      any = true;
    }
    if (spend.recharge !== undefined) {
      recharge.add(spend.recharge);
      out.rechargeSpent = [...recharge];
      any = true;
    }
    if (spend.uses !== undefined) {
      uses[spend.uses] = (uses[spend.uses] ?? 0) + 1;
      out.usesSpent = uses;
      any = true;
    }
    if (spend.slot !== undefined) {
      slots[spend.slot] = (slots[spend.slot] ?? 0) + 1;
      out.slotsSpent = slots;
      any = true;
    }
  }
  if (legendary > 0) out.legendarySpent = row.legendarySpent + legendary;
  return any ? out : undefined;
};
