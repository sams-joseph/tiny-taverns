import {
  type CampaignId,
  type Combatant,
  type EncounterRunId,
  type HobPendingSave,
  type HobPendingSaveId,
  type NpcTurnAttack,
  type NpcTurnDamageRoll,
  type NpcTurnHit,
  type NpcTurnMoment,
  type NpcTurnOptions,
  type NpcTurnOutcomeStep,
  type NpcTurnProposalStep,
  type NpcTurnSave,
  type SessionId,
  damageAfterSave,
  signed,
} from "@taverns/api";
import { Button, Card, CardContent, Input, SectionHeading } from "@taverns/ui";
import { useState } from "react";
import { HobAvatar } from "../hob/ChatParts";
import {
  type FightKept,
  type FightTurn,
  useFightTurn,
  type NpcTurnProposal,
} from "../hob/fightTurn";
import { VERDICT } from "./attack";
import { momentsOf } from "./options";

/**
 * **Ask Hob what a monster does**, under the selected creature's panel: its
 * turn while it is up, and a legendary action or a reaction when it has one
 * now. Which of those it has is `npcMomentRefusal` over the runner's own
 * reading of `npcTurnOptions`, the rule the server checks the ask against.
 *
 * The offer shows its steps (who, what, where) and the line the table will
 * hear. *Discard* turns it down; *Try again* is a discard and a re-ask, with
 * whatever the DM typed; *Keep* has the server carry it out with its own
 * dice. What came of it replaces the offer: each roll, hit or miss, the
 * damage and who dropped, each save (a party member's waits on the total the
 * DM enters, as does a monster's with none written), and what the data left
 * to the DM. *Undo* takes it back while it is the fight's latest kept turn.
 *
 * A recharge is rolled at the start of the creature's turn, before Hob is
 * asked, so the card says when one is waiting; the roll is the DM's, in
 * *Resources* (the maintainer's decision of 2026-10-12).
 *
 * Drawn only when a model is behind Hob, and only for a monster in a fight
 * taking turns.
 */
export function HobTurnCard(props: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly combatant: Combatant;
  readonly round: number;
  /** The runner's reading of its options (`runOptionsFor`). */
  readonly options: NpcTurnOptions;
  readonly disabled: boolean;
  /** A keep, an undo or a save moved the fight: re-read it. */
  readonly onChanged: () => void;
}) {
  const moments = momentsOf(props.options);
  const turn = useFightTurn({
    campaignId: props.campaignId,
    sessionId: props.sessionId,
    runId: props.runId,
    combatantId: props.combatant.id,
    round: props.round,
    moments,
    onChanged: props.onChanged,
  });
  return (
    <HobTurnCardView
      combatant={props.combatant}
      options={props.options}
      turn={turn}
      disabled={props.disabled}
      driving={false}
    />
  );
}

/**
 * The card over a `FightTurn` somebody else holds: the runner's own, while
 * Hob's autopilot is driving it (`hob/autopilot.ts`). `driving` puts the ask
 * away, since the autopilot asks and keeps; the saves it leaves and *Undo*
 * stay the DM's.
 */
export function HobTurnCardView({
  combatant,
  options,
  turn,
  disabled,
  driving,
}: {
  readonly combatant: Combatant;
  readonly options: NpcTurnOptions;
  readonly turn: FightTurn;
  readonly disabled: boolean;
  readonly driving: boolean;
}) {
  const moments = momentsOf(options);
  const [steer, setSteer] = useState("");

  if (
    turn.available !== true ||
    (moments.length === 0 && turn.offer === undefined && turn.kept === undefined)
  ) {
    return null;
  }

  const offer = turn.offer;
  const kept = turn.kept;
  const recharging = options.up
    ? options.omitted.filter((omission) => omission.reason === "recharging")
    : [];
  const reacting = offer === undefined && moments.length === 1 && moments[0] === "reaction";
  return (
    <Card role="region" aria-label={`Hob for ${combatant.displayName}`}>
      <div className="flex items-center gap-2 border-b border-hairline p-panel">
        <HobAvatar size={20} />
        <SectionHeading as="h3" className="text-label leading-none font-semibold">
          {offer === undefined ? "Hob" : `Hob · ${MOMENT_TITLES[offer.proposal.moment]}`}
        </SectionHeading>
      </div>
      <CardContent className="flex flex-col gap-3 p-panel">
        {kept !== undefined && offer === undefined && (
          <Kept
            kept={kept}
            saves={turn.saves}
            disabled={disabled || turn.writing}
            onResolve={turn.resolve}
            onUndo={() => void turn.undo()}
            onDismiss={turn.dismiss}
          />
        )}
        {offer !== undefined && <Offered proposal={offer.proposal} />}
        {offer === undefined && recharging.length > 0 && (
          <p className="mb-0 text-caption leading-body text-muted-foreground">
            {recharging.map((omission) => omission.name).join(", ")}{" "}
            {recharging.length === 1 ? "is" : "are"} recharging: roll it in Resources first if this
            turn brings it back.
          </p>
        )}
        {!driving && (
          <>
            <Input
              aria-label={offer === undefined ? "What Hob should have it do" : "What to change"}
              placeholder={
                offer !== undefined
                  ? "Something else? (optional)"
                  : reacting
                    ? "What triggered it? (optional)"
                    : "Anything it should do? (optional)"
              }
              value={steer}
              disabled={disabled || turn.asking}
              onChange={(event) => setSteer(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              {offer === undefined ? (
                moments.map((moment) => (
                  <Button
                    key={moment}
                    size="sm"
                    variant={moment === "turn" ? "default" : "secondary"}
                    disabled={disabled || turn.asking}
                    onClick={() => {
                      void turn.ask(moment, steer);
                      setSteer("");
                    }}
                  >
                    {ASK_LABELS[moment]}
                  </Button>
                ))
              ) : (
                <>
                  <Button size="sm" variant="ghost" disabled={turn.asking} onClick={turn.discard}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={disabled || turn.asking || turn.writing}
                    onClick={() => {
                      turn.retry(steer);
                      setSteer("");
                    }}
                  >
                    Try again
                  </Button>
                  <Button
                    size="sm"
                    disabled={disabled || turn.asking || turn.writing}
                    onClick={() => void turn.keep()}
                  >
                    Keep
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {turn.activity !== undefined && (
          <p role="status" className="mb-0 text-caption leading-body text-muted-foreground">
            {turn.activity}
          </p>
        )}
        {turn.note !== undefined && (
          <p role="status" className="mb-0 text-body-s leading-body text-muted-foreground">
            {turn.note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ASK_LABELS: Record<NpcTurnMoment, string> = {
  turn: "Ask Hob for its turn",
  legendary: "Ask Hob for a legendary action",
  reaction: "Ask Hob for a reaction",
};

const MOMENT_TITLES: Record<NpcTurnMoment, string> = {
  turn: "its turn",
  legendary: "a legendary action",
  reaction: "a reaction",
};

const SLOT_WORDS: Partial<Record<string, string>> = {
  bonus: "bonus action",
  reaction: "reaction",
  legendary: "legendary action",
};

const square = (at: { readonly column: number; readonly row: number }) =>
  `(${String(at.column)},${String(at.row)})`;

/** One step, in a line: who does what, to whom, where. */
const stepText = (step: NpcTurnProposalStep): string => {
  if (step.kind === "move") return `Moves ${String(step.feet)} ft to ${square(step.to)}`;
  const slot = SLOT_WORDS[step.slot];
  const aimed =
    step.placement !== undefined
      ? ` at ${square(step.placement.toward)}${
          step.targets.length === 0
            ? ""
            : `, catching ${step.targets.map((target) => target.name).join(", ")}`
        }`
      : step.strikes === undefined && step.targets.length > 0
        ? ` → ${step.targets.map((target) => target.name).join(", ")}`
        : "";
  return `${step.name}${aimed}${slot === undefined ? "" : ` (${slot})`}`;
};

function Offered({ proposal }: { readonly proposal: NpcTurnProposal }) {
  return (
    <>
      <ol aria-label="What it does" className="mb-0 flex list-decimal flex-col gap-1 pl-5">
        {proposal.steps.map((step, index) => (
          <li key={index} className="text-body-s leading-body">
            {stepText(step)}
            {step.kind === "option" && step.strikes !== undefined && (
              <ul className="mb-0 list-disc pl-4 text-caption text-muted-foreground">
                {step.strikes.map((strike, strikeIndex) => (
                  <li key={strikeIndex}>
                    {strike.name} → {strike.target.name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <blockquote className="mb-0 border-l-2 border-hairline pl-3 font-serif text-body-s leading-body italic">
        {proposal.narration}
        {proposal.line !== undefined && <q className="mt-1 block not-italic">{proposal.line}</q>}
      </blockquote>
    </>
  );
}

/** `2d10+8 [10, 10] = 28 piercing · 2d6 [1, 1] = 2 fire`. */
const damageText = (damage: ReadonlyArray<NpcTurnDamageRoll>): string =>
  damage
    .map(
      (roll) =>
        `${roll.notation} [${roll.faces.join(", ")}] = ${String(roll.total)}${
          roll.type === null ? "" : ` ${roll.type.toLowerCase()}`
        }`,
    )
    .join(" · ");

/** `30 damage: 30 → 0, down`, and the concentration save it set up. */
const hitText = (hit: NpcTurnHit): string =>
  `${String(hit.amount)} damage: ${String(hit.hpBefore)} → ${String(hit.hpAfter)}${
    hit.dropped ? ", down" : ""
  }${hit.concentrationDc === undefined ? "" : ` · Con save DC ${String(hit.concentrationDc)}`}`;

/** `d20 15 +14 = 29 vs AC 14`; both d20s when it took advantage or disadvantage. */
const toHitText = (attack: NpcTurnAttack): string =>
  `d20 ${
    attack.d20s.length === 1 ? String(attack.d20) : `${attack.d20s.join(", ")} (${attack.mode})`
  } ${signed(attack.toHit)} = ${String(attack.total)} vs ${
    attack.ac === null ? "no AC" : `AC ${String(attack.ac)}`
  }`;

function AttackLine({ attack }: { readonly attack: NpcTurnAttack }) {
  return (
    <li className="text-body-s leading-body">
      {attack.name} → {attack.target.name}:{" "}
      <span className="font-semibold">{VERDICT[attack.verdict]}</span>
      <span className="block font-mono text-caption text-muted-foreground">
        {toHitText(attack)}
        {attack.damage.length > 0 && ` · ${damageText(attack.damage)}`}
      </span>
      {attack.hit !== undefined && (
        <span className="block text-caption">
          {attack.target.name} took {hitText(attack.hit)}
        </span>
      )}
    </li>
  );
}

function SaveLine({
  save,
  pending,
  disabled,
  onResolve,
}: {
  readonly save: NpcTurnSave;
  readonly pending: HobPendingSave | undefined;
  readonly disabled: boolean;
  readonly onResolve: (saveId: HobPendingSaveId, total: number) => void;
}) {
  const [total, setTotal] = useState("");
  const name = save.target.name;
  if (save.roll !== null) {
    return (
      <li className="text-body-s leading-body">
        {name}: {String(save.roll.total)} (d20 {String(save.roll.d20)} {signed(save.roll.modifier)}
        ), {save.succeeded === true ? "saved" : "failed"}
        {save.hit === undefined ? ", no damage" : ` · took ${hitText(save.hit)}`}
      </li>
    );
  }
  if (pending === undefined)
    return <li className="text-body-s leading-body">{name}: not rolled</li>;
  if (pending.state === "resolved") {
    const took = damageAfterSave(pending.amount, pending.succeeded === true, pending.onSuccess);
    return (
      <li className="text-body-s leading-body">
        {name}: {String(pending.total)}, {pending.succeeded === true ? "saved" : "failed"}
        {took.amount === 0 ? ", no damage" : ` · took ${String(took.amount)} damage`}
      </li>
    );
  }
  if (pending.state === "lapsed") {
    return (
      <li className="text-body-s leading-body text-muted-foreground">
        {name}: lapsed, no damage applied
      </li>
    );
  }
  const entered = Number(total);
  return (
    <li className="flex flex-wrap items-center gap-2 text-body-s leading-body">
      <span>
        {name}: waiting on a {pending.ability} save, DC {String(pending.dc)}
      </span>
      <Input
        aria-label={`${name}'s ${pending.ability} save total`}
        inputMode="numeric"
        className="w-16"
        value={total}
        disabled={disabled}
        onChange={(event) => setTotal(event.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || total.trim() === "" || !Number.isInteger(entered)}
        onClick={() => onResolve(pending.id, entered)}
      >
        Apply save
      </Button>
    </li>
  );
}

function KeptStep({
  step,
  saves,
  disabled,
  onResolve,
}: {
  readonly step: NpcTurnOutcomeStep;
  readonly saves: ReadonlyArray<HobPendingSave>;
  readonly disabled: boolean;
  readonly onResolve: (saveId: HobPendingSaveId, total: number) => void;
}) {
  if (step.kind === "move") {
    return (
      <li className="text-body-s leading-body">
        Moved {String(step.feet)} ft to {square(step.to)}
      </li>
    );
  }
  return (
    <li className="text-body-s leading-body">
      {step.name}
      {SLOT_WORDS[step.slot] === undefined ? "" : ` (${SLOT_WORDS[step.slot]})`}
      {step.attacks.length > 0 && (
        <ul className="mb-0 flex list-disc flex-col gap-1 pl-4">
          {step.attacks.map((attack, index) => (
            <AttackLine key={index} attack={attack} />
          ))}
        </ul>
      )}
      {step.save !== undefined && (
        <>
          <span className="block font-mono text-caption text-muted-foreground">
            DC {String(step.save.dc)} {step.save.ability}, {step.save.onSuccess} on a success
            {step.save.damage.length > 0 && ` · ${damageText(step.save.damage)}`}
          </span>
          <ul className="mb-0 flex list-disc flex-col gap-1 pl-4">
            {step.save.targets.map((save) => (
              <SaveLine
                key={save.target.combatantId}
                save={save}
                pending={saves.find((row) => row.id === save.pendingSaveId)}
                disabled={disabled}
                onResolve={onResolve}
              />
            ))}
          </ul>
        </>
      )}
      {step.notes.length > 0 && (
        <ul className="mb-0 list-disc pl-4 text-caption text-muted-foreground">
          {step.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Kept({
  kept,
  saves,
  disabled,
  onResolve,
  onUndo,
  onDismiss,
}: {
  readonly kept: FightKept;
  readonly saves: ReadonlyArray<HobPendingSave>;
  readonly disabled: boolean;
  readonly onResolve: (saveId: HobPendingSaveId, total: number) => void;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}) {
  const { outcome } = kept;
  return (
    <section
      aria-label={`What came of ${outcome.combatantName}'s turn`}
      className="flex flex-col gap-2"
    >
      <p className="mb-0 text-label leading-none font-semibold">
        {kept.undone ? "Undone" : `Kept: ${MOMENT_TITLES[outcome.moment]}`}
      </p>
      {!kept.undone && (
        <>
          <ol aria-label="What happened" className="mb-0 flex list-decimal flex-col gap-1 pl-5">
            {outcome.steps.map((step, index) => (
              <KeptStep
                key={index}
                step={step}
                saves={saves}
                disabled={disabled}
                onResolve={onResolve}
              />
            ))}
          </ol>
          <blockquote className="mb-0 border-l-2 border-hairline pl-3 font-serif text-body-s leading-body italic">
            {outcome.narration}
            {outcome.line !== undefined && <q className="mt-1 block not-italic">{outcome.line}</q>}
          </blockquote>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {kept.latest && !kept.undone && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onUndo}>
            Undo
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </section>
  );
}
