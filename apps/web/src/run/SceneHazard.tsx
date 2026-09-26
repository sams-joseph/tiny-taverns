import type {
  CharacterSheet,
  CheckOutcome,
  Combatant,
  EncounterHazard,
  EncounterRunCheck,
  EncounterRunScene,
  EncounterRunSceneUpdate,
} from "@taverns/api";
import { SCENE_STAGES_MAX } from "@taverns/api";
import { Badge, Button, cn, Icon, Input, SectionHeading } from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { signed, type LocalRoll } from "../characters/rolls";
import { SaveFailure } from "../ui/form";
import { Conditions } from "./CombatantPanel";
import type { RunPath } from "./load";
import {
  EXHAUSTION_MAX,
  exhaustionOf,
  leadingDice,
  saveLabel,
  saveModifier,
  savesThisStage,
  withExhaustion,
} from "./scene";
import { newRequestId } from "./state";

/**
 * A hazard: stage by stage, everyone saves, and the DM applies what failing
 * costs.
 *
 * Three things here differ from the drawing, each because the record does not
 * hold what the drawing assumes:
 *
 *  - **How long it lasts is set when it begins**, not rolled in secret from the
 *    prep's prose. The prep's duration is shown, and when it opens with dice
 *    (`"1d4 hours"`) there is a button to roll them; the DM confirms the number.
 *    It counts **stages**, because "hours" is a word in the prose, not a unit
 *    the record knows.
 *  - **What a failed save costs is the DM's to apply** (the captain's call):
 *    each save is logged, and the consequence goes on the character through the
 *    condition chips, like any condition — so it reaches the party and outlives
 *    the run. Exhaustion's pips are read off the conditions a row holds
 *    (`"Exhaustion 2"`), never tallied here.
 *  - **Every step goes back.** A save is removed rather than lived with, a stage
 *    steps back, and the length can be changed. On the last stage the peach
 *    button is *End the hazard*, which is the runner's own *End* — one ending,
 *    not two.
 */

/** `EncounterRunScene`'s stage bounds. */
const parsedStages = (text: string, from: number): number | undefined => {
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value >= from && value <= SCENE_STAGES_MAX ? value : undefined;
};

function ExhaustionPips({ level }: { readonly level: number }) {
  return (
    <span
      className="flex gap-0.5"
      role="img"
      aria-label={`Exhaustion ${String(level)} of ${String(EXHAUSTION_MAX)}`}
    >
      {Array.from({ length: EXHAUSTION_MAX }, (_, index) => (
        <span
          key={index}
          className={cn(
            "size-2 rounded-xs border border-hairline",
            index < level ? "bg-danger" : "bg-surface-sunken",
          )}
        />
      ))}
    </span>
  );
}

/** How many stages it lasts: typed, or rolled from the prep's dice. */
function Length({
  hazard,
  current,
  from,
  confirm,
  busy,
  disabled,
  onRoll,
  onSet,
  onCancel,
}: {
  readonly hazard: EncounterHazard;
  readonly current: number | null;
  /** The fewest it may be set to: the stage it is already in. */
  readonly from: number;
  readonly confirm: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onRoll: (label: string, notation: string) => LocalRoll | undefined;
  readonly onSet: (stages: number) => void;
  readonly onCancel: (() => void) | undefined;
}) {
  const [text, setText] = useState(current === null ? "" : String(current));
  const stages = parsedStages(text, from);
  const dice = leadingDice(hazard.duration);
  const off = disabled || busy;

  return (
    <div className="flex flex-col gap-3 px-panel py-4">
      <p className="mb-0 text-body-s leading-body text-muted-foreground">
        {hazard.duration === undefined
          ? "Set how many stages it lasts. Everyone saves once in each."
          : `It lasts ${hazard.duration}. Set how many stages that is; everyone saves once in each.`}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          mono
          inputMode="numeric"
          aria-label="How many stages"
          placeholder="–"
          value={text}
          disabled={off}
          className="w-18 shrink-0"
          onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && stages !== undefined) onSet(stages);
          }}
        />
        {dice !== undefined && (
          <Button
            variant="outline"
            size="sm"
            disabled={off}
            onClick={() => {
              const rolled = onRoll(`How long it lasts`, dice);
              if (rolled !== undefined) setText(String(Math.max(from, rolled.total)));
            }}
          >
            <Icon name="dice-5" size={13} />
            Roll {dice}
          </Button>
        )}
        <span className="ml-auto flex gap-1.5">
          {onCancel !== undefined && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={off || stages === undefined}
            onClick={() => stages !== undefined && onSet(stages)}
          >
            {confirm}
          </Button>
        </span>
      </div>
    </div>
  );
}

/** One of the party, in this stage: their save, or the three ways to call it. */
function SaveRow({
  combatant,
  ability,
  modifier,
  save,
  disabled,
  conditionsBusy,
  onLog,
  onRemove,
  onConditions,
}: {
  readonly combatant: Combatant;
  readonly ability: string;
  readonly modifier: number | undefined;
  readonly save: EncounterRunCheck | undefined;
  readonly disabled: boolean;
  readonly conditionsBusy: boolean;
  readonly onLog: (how: { readonly roll: true } | { readonly outcome: CheckOutcome }) => void;
  readonly onRemove: (save: EncounterRunCheck) => void;
  readonly onConditions: (next: ReadonlyArray<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = combatant.displayName;
  const level = exhaustionOf(combatant.conditions);
  const busyConditions = disabled || conditionsBusy;

  return (
    <li className="border-b border-hairline">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-panel py-2">
        <Icon name="shield" size={15} className="shrink-0 text-info" />
        <div className="min-w-36 flex-1">
          <div className="text-body-s leading-snug font-semibold text-heading">{name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-micro leading-none text-muted-foreground">
              {modifier === undefined ? ability : `${ability} ${signed(modifier)}`}
            </span>
            <ExhaustionPips level={level} />
            {level > 0 && (
              <span className="text-caption leading-none text-danger">Exhaustion {level}</span>
            )}
          </div>
        </div>
        {save !== undefined ? (
          <span className="flex items-center gap-1">
            <Badge variant={save.outcome === "success" ? "success" : "destructive"}>
              {save.outcome === "success" ? "Saved" : "Failed"}
              {save.total === null ? "" : ` · ${String(save.total)}`}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Remove ${name}'s save`}
              onClick={() => onRemove(save)}
            >
              <Icon name="x" size={13} />
            </Button>
          </span>
        ) : (
          <span className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || modifier === undefined}
              aria-label={`Roll ${name}'s save`}
              onClick={() => onLog({ roll: true })}
            >
              <Icon name="dice-5" size={13} />
              Roll
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`${name} passes`}
              onClick={() => onLog({ outcome: "success" })}
            >
              Pass
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`${name} fails`}
              onClick={() => onLog({ outcome: "failure" })}
            >
              Fail
            </Button>
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-label={`${name}'s conditions`}
          onClick={() => setOpen((was) => !was)}
        >
          Conditions
          <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 px-panel pb-3.5">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 text-label-s leading-none text-muted-foreground">
              Exhaustion
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={busyConditions || level === 0}
              aria-label={`Less exhaustion for ${name}`}
              onClick={() => onConditions(withExhaustion(combatant.conditions, level - 1))}
            >
              <Icon name="minus" size={13} />
            </Button>
            <span className="w-6 text-center font-mono text-mono text-heading">{level}</span>
            <Button
              variant="outline"
              size="icon"
              disabled={busyConditions || level >= EXHAUSTION_MAX}
              aria-label={`More exhaustion for ${name}`}
              onClick={() => onConditions(withExhaustion(combatant.conditions, level + 1))}
            >
              <Icon name="plus" size={13} />
            </Button>
          </div>
          <Conditions
            key={combatant.id}
            combatant={combatant}
            disabled={busyConditions}
            onChange={onConditions}
          />
        </div>
      )}
    </li>
  );
}

export function SceneHazard({
  path,
  hazard,
  scene,
  party,
  sheetOf,
  disabled,
  conditionsBusy,
  onConditions,
  onRoll,
  onEnd,
}: {
  readonly path: RunPath;
  readonly hazard: EncounterHazard;
  readonly scene: EncounterRunScene;
  readonly party: ReadonlyArray<Combatant>;
  readonly sheetOf: (combatant: Combatant) => CharacterSheet | undefined;
  readonly disabled: boolean;
  readonly conditionsBusy: boolean;
  readonly onConditions: (combatant: Combatant, next: ReadonlyArray<string>) => void;
  readonly onRoll: (label: string, notation: string) => LocalRoll | undefined;
  /** The runner's own *End*: a hazard's last stage over is the scene over. */
  readonly onEnd: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [changing, setChanging] = useState(false);
  const ability = hazard.save.ability;
  const saves = savesThisStage(scene);
  const off = disabled || busy;

  const writeScene = (patch: EncounterRunSceneUpdate) =>
    submit(
      (client) => client.runs.updateScene({ params: path, payload: patch }),
      [reads.runScene(path.runId)],
    );

  const log = (
    combatant: Combatant,
    how: { readonly roll: true } | { readonly outcome: CheckOutcome },
  ) => {
    let payload: { readonly total: number } | { readonly outcome: CheckOutcome };
    if ("roll" in how) {
      const sheet = sheetOf(combatant);
      const modifier = sheet === undefined ? undefined : saveModifier(sheet, ability);
      if (modifier === undefined) return;
      const rolled = onRoll(
        `${combatant.displayName} · ${ability} save`,
        `1d20${signed(modifier)}`,
      );
      if (rolled === undefined) return;
      // The total alone: the server holds the DC and says how it went.
      payload = { total: rolled.total };
    } else {
      payload = { outcome: how.outcome };
    }
    void submit(
      (client) =>
        client.runs.logCheck({
          params: path,
          payload: {
            combatantId: combatant.id,
            save: ability,
            ...payload,
            requestId: newRequestId(),
          },
        }),
      [reads.runScene(path.runId)],
    );
  };

  const remove = (save: EncounterRunCheck) =>
    void submit(
      (client) => client.runs.removeCheck({ params: { ...path, checkId: save.id } }),
      [reads.runScene(path.runId)],
    );

  const header = (title: string) => (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <SectionHeading as="h2" size="title">
        {title}
      </SectionHeading>
      <span className="ml-auto font-mono text-mono leading-none text-muted-foreground">
        {saveLabel(hazard.save)}
      </span>
    </div>
  );

  const stage = scene.stage;
  const stages = scene.stages;

  if (stage === null || stages === null) {
    return (
      <section
        aria-label="The hazard"
        className="overflow-clip rounded-card border border-hairline bg-surface-card shadow-1"
      >
        <div className="border-b border-hairline px-panel pt-4 pb-3">
          {header("How long does it last?")}
        </div>
        <Length
          hazard={hazard}
          current={stages}
          from={1}
          confirm="Begin"
          busy={busy}
          disabled={disabled}
          onRoll={onRoll}
          onSet={(count) => void writeScene({ stages: count, stage: 1 })}
          onCancel={undefined}
        />
        {failure !== undefined && (
          <div className="px-panel pb-3">
            <SaveFailure failure={failure} />
          </div>
        )}
      </section>
    );
  }

  const waiting = party.filter((combatant) => !saves.has(combatant.id));
  const allIn = waiting.length === 0;
  const last = stage >= stages;
  const hint =
    party.length === 0
      ? "Nobody from the party is in this scene."
      : !allIn
        ? `${String(waiting.length)} still to save this stage.`
        : last
          ? "Everyone has saved. End the hazard when you're ready."
          : "Everyone has saved this stage.";

  return (
    <section
      aria-label="The hazard"
      className="overflow-clip rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <div className="flex flex-col gap-3.5 border-b border-hairline px-panel pt-4 pb-3.5">
        {header(`Stage ${String(stage)} of ${String(stages)}`)}
        <div
          className="flex gap-1.5"
          role="img"
          aria-label={`Stage ${String(stage)} of ${String(stages)}`}
        >
          {Array.from({ length: stages }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-pill transition-control",
                index + 1 < stage
                  ? "bg-accent"
                  : index + 1 === stage
                    ? "bg-accent-soft"
                    : "bg-surface-sunken",
              )}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="mb-0 min-w-48 flex-1 text-body-s leading-body text-muted-foreground">
            {hazard.onFail === undefined ? "" : `On a failed save: ${hazard.onFail}. `}
            Call for saves, then move to the next stage.
          </p>
          {!changing && (
            <Button variant="ghost" size="sm" disabled={off} onClick={() => setChanging(true)}>
              Change length
            </Button>
          )}
        </div>
      </div>

      {changing ? (
        <Length
          hazard={hazard}
          current={stages}
          from={stage}
          confirm="Set length"
          busy={busy}
          disabled={disabled}
          onRoll={onRoll}
          onSet={(count) =>
            void writeScene({ stages: count }).then((written) => {
              if (Result.isSuccess(written)) setChanging(false);
            })
          }
          onCancel={() => setChanging(false)}
        />
      ) : (
        <>
          <ul aria-label="Saves this stage">
            {party.map((combatant) => {
              const sheet = sheetOf(combatant);
              return (
                <SaveRow
                  key={combatant.id}
                  combatant={combatant}
                  ability={ability}
                  modifier={sheet === undefined ? undefined : saveModifier(sheet, ability)}
                  save={saves.get(combatant.id)}
                  disabled={off}
                  conditionsBusy={conditionsBusy}
                  onLog={(how) => log(combatant, how)}
                  onRemove={remove}
                  onConditions={(next) => onConditions(combatant, next)}
                />
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3 px-panel py-3.5">
            <span className="min-w-48 flex-1 text-body-s leading-body text-muted-foreground">
              {hint}
            </span>
            {stage > 1 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={off}
                onClick={() => void writeScene({ stage: stage - 1 })}
              >
                <Icon name="chevron-left" size={14} />
                Back a stage
              </Button>
            )}
            {last ? (
              <Button size="sm" disabled={off || !allIn} onClick={onEnd}>
                End the hazard
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={off || !allIn}
                onClick={() => void writeScene({ stage: stage + 1 })}
              >
                Next stage
                <Icon name="chevron-right" size={14} />
              </Button>
            )}
          </div>
        </>
      )}
      {failure !== undefined && (
        <div className="px-panel pb-3">
          <SaveFailure failure={failure} />
        </div>
      )}
    </section>
  );
}
