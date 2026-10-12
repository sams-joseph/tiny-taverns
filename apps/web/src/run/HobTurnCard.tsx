import {
  type CampaignId,
  type Combatant,
  type EncounterRunId,
  npcMomentRefusal,
  type NpcTurnMoment,
  type NpcTurnOptions,
  type NpcTurnProposalStep,
  type SessionId,
} from "@taverns/api";
import { Button, Card, CardContent, Input, SectionHeading } from "@taverns/ui";
import { useState } from "react";
import { HobAvatar } from "../hob/ChatParts";
import { useFightTurn, type NpcTurnProposal } from "../hob/fightTurn";

/**
 * **Ask Hob what a monster does**, under the selected creature's panel: its
 * turn while it is up, and a legendary action or a reaction when it has one
 * now. Which of those it has is `npcMomentRefusal` over the runner's own
 * reading of `npcTurnOptions`, the rule the server checks the ask against.
 *
 * The offer shows its steps (who, what, where) and the line the table will
 * hear. *Discard* turns it down; *Try again* is a discard and a re-ask, with
 * whatever the DM typed. There is no keep: carrying a turn out is not built
 * yet, and a button that could not do it is not drawn.
 *
 * Drawn only when a model is behind Hob, and only for a monster in a fight
 * taking turns.
 */
export function HobTurnCard({
  campaignId,
  sessionId,
  runId,
  combatant,
  round,
  options,
  disabled,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly combatant: Combatant;
  readonly round: number;
  /** The runner's reading of its options (`runOptionsFor`). */
  readonly options: NpcTurnOptions;
  readonly disabled: boolean;
}) {
  const moments = MOMENTS.filter((moment) => npcMomentRefusal(options, moment) === undefined);
  const turn = useFightTurn({
    campaignId,
    sessionId,
    runId,
    combatantId: combatant.id,
    round,
    moments,
  });
  const [steer, setSteer] = useState("");

  if (turn.available !== true || (moments.length === 0 && turn.offer === undefined)) return null;

  const offer = turn.offer;
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
        {offer !== undefined && <Offered proposal={offer.proposal} />}
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
                  turn.ask(moment, steer);
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
                disabled={disabled || turn.asking}
                onClick={() => {
                  turn.retry(steer);
                  setSteer("");
                }}
              >
                Try again
              </Button>
            </>
          )}
        </div>
        {turn.activity !== undefined && (
          <p role="status" className="mb-0 text-caption leading-body text-muted-foreground">
            {turn.activity}
          </p>
        )}
        {turn.note !== undefined && (
          <p className="mb-0 text-body-s leading-body text-muted-foreground">{turn.note}</p>
        )}
      </CardContent>
    </Card>
  );
}

const MOMENTS: ReadonlyArray<NpcTurnMoment> = ["turn", "legendary", "reaction"];

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
      </blockquote>
    </>
  );
}
