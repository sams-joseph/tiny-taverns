import type {
  CharacterSheet,
  Combatant,
  EncounterRun,
  EncounterRunCheck,
  EncounterRunScene,
  SceneAttitude,
} from "@taverns/api";
import { Badge, Icon, Loading, SectionHeading } from "@taverns/ui";
import { Result } from "effect";
import { useMemo, type ReactNode } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import type { Resource } from "../api/failure";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { readAloudOf } from "../campaign/encounterDraft";
import { notesAtom, partyAtom } from "../campaign/load";
import { SaveFailure } from "../ui/form";
import { ChecksLog } from "./ChecksLog";
import type { DmDice } from "./dice";
import { DmDiceCard } from "./DmDice";
import type { RunPath } from "./load";
import { MakeACheck } from "./MakeACheck";
import { SceneChallenge } from "./SceneChallenge";
import { SceneHazard } from "./SceneHazard";
import { SceneSocial } from "./SceneSocial";

/**
 * The runner for a scene that is not a fight — a conversation, a skill
 * challenge or a hazard — as the redesign draws each (`Campaign Overview.dc.html`,
 * the runner's non-combat half): the read-aloud and the scene's own card, the
 * log of checks, and beside them *Make a check*, *Running it* and the DM's dice.
 * Everything the fight's aside keeps that applies here — NPCs at the table,
 * Hob's spends, the players' dice tray, the session log — comes after, from
 * the screen (`extras`).
 *
 * It is the DM's alone, as the scene is (`EncounterRunScene`). Every act is a
 * write straight through — the attitude, a beat, a check, a stage — each with
 * its reverse, and each names `reads.runScene`, which is also what the
 * doorbell re-reads (the screen's `onEvent`).
 *
 * **Two columns, re-dealt on a phone rather than wrapped.** From `@3xl` the
 * scene's cards stand in a main column beside the aside, the drawing's
 * composition; below it they are one column in the order a DM uses them — the
 * scene, *Make a check*, then its log — which is why the two columns are
 * `display: contents` there and each card carries its place.
 */

/** A card in the layout, and its place in the one column a phone gets. */
function Slot({ order, children }: { readonly order: string; readonly children: ReactNode }) {
  return <div className={`min-w-0 ${order} @3xl:order-none`}>{children}</div>;
}

function ReadAloud({ text }: { readonly text: string }) {
  return (
    <section
      aria-label="Read aloud"
      className="rounded-card border border-hairline bg-surface-card px-panel py-4 shadow-1"
    >
      <div className="flex items-center gap-1.5 text-label-s leading-none text-muted-foreground">
        <Icon name="scroll-text" size={13} />
        Read aloud
      </div>
      <p className="mt-2.5 mb-0 max-w-[66ch] font-serif text-body-l leading-loose italic text-pretty text-foreground">
        {text}
      </p>
    </section>
  );
}

/** The prep's tactic lines, numbered, and the skills that help — the drawing's *Running it*. */
function RunningIt({
  beats,
  skills,
}: {
  readonly beats: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
}) {
  return (
    <section
      aria-label="Running it"
      className="flex flex-col gap-2.5 rounded-card border border-hairline bg-surface-card p-panel shadow-1"
    >
      <SectionHeading as="h2" size="title">
        Running it
      </SectionHeading>
      {beats.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {beats.map((beat, index) => (
            <li
              key={index}
              className="flex gap-2.5 text-body-s leading-body text-pretty text-foreground"
            >
              <span className="w-4 shrink-0 font-mono text-mono leading-body text-faint">
                {index + 1}
              </span>
              <span>{beat}</span>
            </li>
          ))}
        </ol>
      )}
      {skills.length > 0 && (
        <div
          className={`flex flex-wrap gap-1.5 ${beats.length > 0 ? "border-t border-hairline pt-2.5" : ""}`}
        >
          {skills.map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

export function SceneRunner({
  path,
  run,
  combatants,
  scene: resource,
  reloadScene,
  over,
  dice,
  conditionsBusy,
  onConditions,
  onEscalated,
  onEnd,
  extras,
}: {
  readonly path: RunPath;
  readonly run: EncounterRun;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly scene: Resource<EncounterRunScene | null>;
  readonly reloadScene: () => void;
  readonly over: boolean;
  readonly dice: DmDice;
  readonly conditionsBusy: boolean;
  readonly onConditions: (combatant: Combatant, next: ReadonlyArray<string>) => void;
  /** The conversation became a fight: the run `escalate` answered with. */
  readonly onEscalated: (run: EncounterRun) => void;
  /** The runner's *End*, which a hazard's last stage opens. */
  readonly onEnd: () => void;
  /** What the fight's aside keeps that applies here, after the drawn cards. */
  readonly extras: ReactNode;
}) {
  const [partyResource] = useApiAtom(partyAtom(path.campaignId));
  const [notesResource] = useApiAtom(notesAtom(path.campaignId));
  const write = useMutation();

  /**
   * The sheet behind each of the party's rows, for the modifiers *Roll for
   * them* adds. A party that has not loaded, or a row whose character is gone,
   * has none — and those rolls are simply not offered.
   */
  const sheets = useMemo(() => {
    const byCharacter = new Map<string, CharacterSheet>();
    if (partyResource.state !== "ready") return byCharacter;
    for (const seat of partyResource.value) {
      if (seat.character !== null) byCharacter.set(seat.character.id, seat.character.sheet);
    }
    return byCharacter;
  }, [partyResource]);
  const sheetOf = (combatant: Combatant): CharacterSheet | undefined =>
    combatant.characterId === null ? undefined : sheets.get(combatant.characterId);

  const readAloud =
    run.encounterId !== null && notesResource.state === "ready"
      ? readAloudOf(notesResource.value, run.encounterId)?.body.trim()
      : undefined;

  const party = combatants.filter((combatant) => combatant.kind === "pc");
  const others = combatants.filter((combatant) => combatant.kind !== "pc");
  const busy = over || write.busy;
  const sceneWrite = [reads.runScene(path.runId)];

  if (resource.state === "loading") return <Loading label="Reading the scene…" />;
  if (resource.state === "failed") {
    return <ApiFailureNotice failure={resource.failure} onRetry={reloadScene} />;
  }
  const scene = resource.value;
  if (scene === null) return null;

  const setAttitude = (attitude: SceneAttitude | null) =>
    void write.submit(
      (client) => client.runs.updateScene({ params: path, payload: { attitude } }),
      sceneWrite,
    );
  const tickBeat = (index: number, done: boolean) =>
    void write.submit(
      (client) => client.runs.updateScene({ params: path, payload: { beat: { index, done } } }),
      sceneWrite,
    );
  const removeCheck = (check: EncounterRunCheck) =>
    void write.submit(
      (client) => client.runs.removeCheck({ params: { ...path, checkId: check.id } }),
      sceneWrite,
    );
  const escalate = async () => {
    const fight = await write.submit(
      (client) => client.runs.escalate({ params: path, payload: {} }),
      // The night's runs, whose live one the campaign row and the Overview's
      // banner word by its mode.
      [reads.runs(path.sessionId)],
    );
    if (Result.isSuccess(fight)) onEscalated(fight.success);
  };

  const mode = run.mode;
  const challenge = scene.challenge;
  const skillsThatHelp = challenge?.skills ?? [];
  // A conversation's beats are ticked on its own card; the others list them here.
  const runningIt = mode === "social" ? [] : scene.beats.map((beat) => beat.text);

  const lead =
    mode === "social" ? (
      <SceneSocial
        scene={scene}
        others={others}
        disabled={busy}
        onAttitude={setAttitude}
        onBeat={tickBeat}
        onEscalate={() => void escalate()}
      />
    ) : mode === "challenge" && challenge?.kind === "challenge" ? (
      <SceneChallenge challenge={challenge} checks={scene.checks} />
    ) : mode === "hazard" && challenge?.kind === "hazard" ? (
      <SceneHazard
        path={path}
        hazard={challenge}
        scene={scene}
        party={party}
        sheetOf={sheetOf}
        disabled={over}
        conditionsBusy={conditionsBusy}
        onConditions={onConditions}
        onRoll={dice.roll}
        onEnd={onEnd}
      />
    ) : (
      // A challenge or a hazard whose prep had no numbers when it started: the
      // snapshot is empty, and the log is all there is to run it by.
      <p className="mb-0 rounded-card border border-hairline bg-surface-card px-panel py-4 text-body-s leading-body text-muted-foreground">
        This encounter had no {mode === "hazard" ? "save" : "successes or failures"} written in its
        prep when it went on the table, so there is nothing to count. Log checks as they happen.
      </p>
    );
  // A hazard's saves are its rows; everything else logs checks.
  const checks = mode !== "hazard" || challenge?.kind !== "hazard";

  return (
    <div
      data-slot="scene-layout"
      className="flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)] @3xl:items-start"
    >
      <div className="contents @3xl:flex @3xl:min-w-0 @3xl:flex-col @3xl:gap-4">
        {readAloud !== undefined && readAloud !== "" && (
          <Slot order="order-1">
            <ReadAloud text={readAloud} />
          </Slot>
        )}
        <Slot order="order-2">
          {lead}
          {write.failure !== undefined && (
            <div className="mt-2">
              <SaveFailure failure={write.failure} />
            </div>
          )}
        </Slot>
        {checks && (
          <Slot order="order-4">
            <ChecksLog checks={scene.checks} disabled={busy} onRemove={removeCheck} />
          </Slot>
        )}
      </div>
      <div className="contents @3xl:flex @3xl:min-w-0 @3xl:flex-col @3xl:gap-4">
        {checks && (
          <Slot order="order-3">
            <MakeACheck
              path={path}
              scene={scene}
              party={party}
              sheetOf={sheetOf}
              disabled={over}
              onRoll={dice.roll}
            />
          </Slot>
        )}
        {(runningIt.length > 0 || skillsThatHelp.length > 0) && (
          <Slot order="order-5">
            <RunningIt beats={runningIt} skills={skillsThatHelp} />
          </Slot>
        )}
        <Slot order="order-6">
          <DmDiceCard dice={dice} />
        </Slot>
        <div className="order-7 flex min-w-0 flex-col gap-4 @3xl:order-none">{extras}</div>
      </div>
    </div>
  );
}
