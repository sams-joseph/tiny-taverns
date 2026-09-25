import {
  ABILITY_KEYS,
  type AbilityKey,
  type CampaignId,
  type CreatureId,
  type Encounter,
  type EncounterChallenge,
  type EncounterCreatureId,
  type EncounterId,
  type EncounterKind,
  ENCOUNTER_HAZARD_TEXT_MAX,
  ENCOUNTER_KINDS,
  ENCOUNTER_SETTING_MAX,
  ENCOUNTER_SKILL_MAX,
  ENCOUNTER_SKILLS_MAX,
  ENCOUNTER_TACTIC_MAX,
  ENCOUNTER_TACTICS_MAX,
  ENCOUNTER_TREASURE_MAX,
  encounterKindLabel,
  type EncounterPrep,
  type Visibility,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Loading,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { CreaturePicker } from "./CreaturePicker";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * Writing an encounter: the card's own fields, and what is in it.
 *
 * ### The roster is part of this form, not a second screen
 *
 * "6 creatures" is `sum(encounter_creature.count)` computed per read
 * (`Encounter.creatureCount`), so an encounter authored without a roster is an
 * encounter whose card says nothing. The roster therefore lives in the same
 * dialog and is saved by the same button — but it is a *different table*, so the
 * save is several calls, composed into **one** `Effect` handed to one `submit`.
 * Two submits in a row would give this form two busy flags and a half-saved
 * encounter to explain.
 *
 * Creating is the ordering that makes it: there is no encounter id to hang a
 * roster line off until the encounter exists, so the create runs first and the
 * lines follow inside the same Effect. A failure part-way leaves the encounter
 * saved and the roster short, which is the honest outcome — the API has no
 * transaction across requests, and pretending otherwise by rolling back with
 * more requests would fail the same way one call later.
 *
 * ### The setting line is the map's, and only the creator's
 *
 * *What the place looks like* is written here because the encounter's battle
 * map is made with it and drawn from it once, as the encounter is created. It
 * is stored on the map, not the encounter — a player may read a shared
 * encounter, and nobody but the creator reads its map — so an edit reads it
 * back through the creator's map read (`battleMaps.find`) and writes it through
 * the encounter's own update. Changing it later redraws nothing.
 *
 * ### The prep is the creator's too
 *
 * The tactics, the treasure and a skill challenge's or a hazard's numbers are
 * `EncounterPrep`: written through the encounter's create and update like the
 * setting line, and read back through the creator's prep read
 * (`encounterPrep.find`), never off `Encounter`. The numbers are asked for
 * only when the type takes them, and a challenge is sent with the type it
 * belongs to — the wire refuses one without it — so switching the type away
 * sends none and the server clears what was there.
 *
 * ### What is deliberately not here
 *
 * A roster line carries a `visibility` of its own and this form does not offer
 * it. Omitting the field is not the same as guessing at one: the column default
 * is `dm`, so every line starts closed exactly as the server intends, and a
 * second visibility control inside the first one is a boundary a DM would get
 * wrong more often than they got it right.
 */

/** One line of the roster, before and after it has an id. */
interface RosterLine {
  /** Stable across renders — a new line has no id to key on yet. */
  readonly key: string;
  /** `undefined` until the line has been saved. */
  readonly id: EncounterCreatureId | undefined;
  readonly creatureId: CreatureId;
  readonly name: string;
  readonly count: number;
  /** What the server last stored, so an untouched line costs no request. */
  readonly savedCount: number | undefined;
}

const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 40;
const MIN_COUNT = 1;
const MAX_COUNT = 999;

/** `"Marsh, Night"` ⇄ `["Marsh", "Night"]`. Blanks and repeats fall out. */
const parseTags = (raw: string): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (tag !== "") seen.add(tag);
  }
  return [...seen];
};

/** A skill challenge's numbers as typed: strings, so a cleared box is a blank rather than `NaN`. */
interface SkillChallengeDraft {
  readonly dc: string;
  readonly successes: string;
  readonly failures: string;
  readonly skills: string;
}

interface HazardDraft {
  /** `""` until the DM picks one. */
  readonly ability: AbilityKey | "";
  readonly dc: string;
  readonly onFail: string;
  readonly duration: string;
  readonly skills: string;
}

const NO_ABILITY = "";

const skillChallengeDraft = (challenge: EncounterChallenge | null): SkillChallengeDraft =>
  challenge?.kind === "challenge"
    ? {
        dc: String(challenge.dc),
        successes: String(challenge.successes),
        failures: String(challenge.failures),
        skills: challenge.skills.join(", "),
      }
    : { dc: "", successes: "", failures: "", skills: "" };

const hazardDraft = (challenge: EncounterChallenge | null): HazardDraft =>
  challenge?.kind === "hazard"
    ? {
        ability: challenge.save.ability,
        dc: String(challenge.save.dc),
        onFail: challenge.onFail ?? "",
        duration: challenge.duration ?? "",
        skills: challenge.skills.join(", "),
      }
    : { ability: NO_ABILITY, dc: "", onFail: "", duration: "", skills: "" };

/** A whole number in range, or `undefined` for anything else a box can hold. */
const wholeIn = (raw: string, minimum: number, maximum: number): number | undefined => {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value >= minimum && value <= maximum ? value : undefined;
};

/**
 * The challenge the form would send for this type, or what is wrong with it.
 *
 * Every box blank is a challenge not yet set out — `null`, which the DM can
 * fill in later. Anything typed means the DM is setting one out, and then the
 * numbers the type needs are needed. A fight or a conversation has none.
 */
const challengeOf = (
  kind: EncounterKind,
  skill: SkillChallengeDraft,
  hazard: HazardDraft,
): { readonly challenge: EncounterChallenge | null; readonly problem?: string } => {
  switch (kind) {
    case "challenge": {
      const skills = parseTags(skill.skills);
      if ([skill.dc, skill.successes, skill.failures].every((box) => box.trim() === "")) {
        return skills.length === 0
          ? { challenge: null }
          : { challenge: null, problem: "Give the DC, the successes and the failures too." };
      }
      const dc = wholeIn(skill.dc, 1, 30);
      const successes = wholeIn(skill.successes, 1, 20);
      const failures = wholeIn(skill.failures, 1, 20);
      if (dc === undefined || successes === undefined || failures === undefined) {
        return {
          challenge: null,
          problem: "A DC runs from 1 to 30, and successes and failures from 1 to 20.",
        };
      }
      const problem = skillsProblem(skills);
      return {
        challenge: { kind, dc, successes, failures, skills },
        ...(problem === undefined ? {} : { problem }),
      };
    }
    case "hazard": {
      const skills = parseTags(hazard.skills);
      const onFail = hazard.onFail.trim();
      const duration = hazard.duration.trim();
      if (
        hazard.ability === NO_ABILITY &&
        hazard.dc.trim() === "" &&
        onFail === "" &&
        duration === "" &&
        skills.length === 0
      ) {
        return { challenge: null };
      }
      const dc = wholeIn(hazard.dc, 1, 30);
      if (hazard.ability === NO_ABILITY || dc === undefined) {
        return {
          challenge: null,
          problem: "A hazard needs the save it forces: an ability, and a DC from 1 to 30.",
        };
      }
      const problem = skillsProblem(skills);
      return {
        challenge: {
          kind,
          save: { ability: hazard.ability, dc },
          ...(onFail === "" ? {} : { onFail }),
          ...(duration === "" ? {} : { duration }),
          skills,
        },
        ...(problem === undefined ? {} : { problem }),
      };
    }
    default:
      return { challenge: null };
  }
};

const skillsProblem = (skills: ReadonlyArray<string>): string | undefined =>
  skills.length > ENCOUNTER_SKILLS_MAX
    ? `Eight skills is the most a challenge names. That is ${skills.length}.`
    : skills.some((skill) => skill.length > ENCOUNTER_SKILL_MAX)
      ? `Keep each skill under ${ENCOUNTER_SKILL_MAX + 1} characters.`
      : undefined;

/** One line of the tactics, before and after it is saved. */
interface TacticLine {
  /** Stable across renders and reorders. */
  readonly key: number;
  readonly text: string;
}

interface Draft {
  readonly name: string;
  readonly setting: string;
  readonly kind: EncounterKind;
  readonly tags: ReadonlyArray<string>;
  readonly visibility: Visibility;
  /** Trimmed, with the blank lines left out: an empty box is a line not written. */
  readonly tactics: ReadonlyArray<string>;
  readonly treasure: string;
  readonly challenge: { readonly challenge: EncounterChallenge | null; readonly problem?: string };
}

/**
 * What the DM is told before anything is sent.
 *
 * The contract would catch every one of these on its own — the derived client
 * encodes through the same schema the handler decodes with, so a bad payload
 * fails locally with a `SchemaError` and never reaches the network. But
 * "Expected a value with a length of at least 1 at [\"name\"]" is a sentence
 * for whoever wrote the schema, not for whoever is naming an encounter. These
 * are the same rules, said in the room they are broken in; `SaveFailure` is
 * what renders the backstop if one is ever missed.
 */
const validate = (draft: Draft, lines: ReadonlyArray<RosterLine>) => {
  const problems: {
    name?: string;
    setting?: string;
    tags?: string;
    roster?: string;
    challenge?: string;
    tactics?: string;
    treasure?: string;
  } = {};

  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (draft.setting.trim().length > ENCOUNTER_SETTING_MAX) {
    problems.setting = `Keep it to one line, ${ENCOUNTER_SETTING_MAX} characters at most.`;
  }

  if (draft.tags.length > MAX_TAGS) {
    problems.tags = `Sixteen tags is the most an encounter carries. That is ${draft.tags.length}.`;
  } else if (draft.tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    problems.tags = `Keep each tag under ${MAX_TAG_LENGTH + 1} characters.`;
  }

  if (draft.challenge.problem !== undefined) problems.challenge = draft.challenge.problem;

  if (draft.tactics.length > ENCOUNTER_TACTICS_MAX) {
    problems.tactics = `Twelve lines is the most the tactics hold. That is ${draft.tactics.length}.`;
  } else if (draft.tactics.some((line) => line.length > ENCOUNTER_TACTIC_MAX)) {
    problems.tactics = `Keep each line to ${ENCOUNTER_TACTIC_MAX} characters.`;
  }

  if (draft.treasure.length > ENCOUNTER_TREASURE_MAX) {
    problems.treasure = `Keep it to ${ENCOUNTER_TREASURE_MAX} characters.`;
  }

  if (lines.some((line) => !Number.isInteger(line.count))) {
    problems.roster = "A count is a whole number of creatures.";
  } else if (lines.some((line) => line.count < MIN_COUNT || line.count > MAX_COUNT)) {
    problems.roster = `A count runs from ${MIN_COUNT} to ${MAX_COUNT}.`;
  }

  return problems;
};

function RosterRow({
  line,
  onCount,
  onRemove,
}: {
  readonly line: RosterLine;
  readonly onCount: (count: number) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 border-t border-hairline px-3 py-2 first:border-t-0">
      <Icon name="skull" size={15} className="shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
        {line.name}
      </span>
      <Input
        mono
        type="number"
        min={MIN_COUNT}
        max={MAX_COUNT}
        aria-label={`How many ${line.name}`}
        value={String(line.count)}
        onChange={(event) => onCount(Number(event.target.value))}
        className="h-control-sm w-20 shrink-0"
      />
      <Button variant="ghost" size="icon" aria-label={`Remove ${line.name}`} onClick={onRemove}>
        <Icon name="x" size={14} />
      </Button>
    </li>
  );
}

function TacticRow({
  index,
  count,
  line,
  onText,
  onMove,
  onRemove,
}: {
  readonly index: number;
  readonly count: number;
  readonly line: TacticLine;
  readonly onText: (text: string) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const n = index + 1;
  return (
    <li className="flex items-center gap-1.5">
      <span className="w-5 shrink-0 text-right font-mono text-mono leading-snug font-medium text-faint">
        {n}
      </span>
      <Input
        aria-label={`Tactic ${n}`}
        maxLength={ENCOUNTER_TACTIC_MAX}
        value={line.text}
        onChange={(event) => onText(event.target.value)}
        className="min-w-0 flex-1"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move tactic ${n} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <Icon name="chevron-up" size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move tactic ${n} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="chevron-down" size={14} />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Remove tactic ${n}`} onClick={onRemove}>
        <Icon name="x" size={14} />
      </Button>
    </li>
  );
}

function EncounterForm({
  campaignId,
  encounter,
  initialRoster,
  initialSetting,
  initialPrep,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter | undefined;
  readonly initialRoster: ReadonlyArray<RosterLine>;
  /** The map's setting line as stored; `""` for a new encounter or none. */
  readonly initialSetting: string;
  /** The prep as stored; empty for a new encounter. */
  readonly initialPrep: Prep;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(encounter?.name ?? "");
  const [setting, setSetting] = useState(initialSetting);
  const [kind, setKind] = useState<EncounterKind>(encounter?.kind ?? "combat");
  const [skill, setSkill] = useState(() => skillChallengeDraft(initialPrep.challenge));
  const [hazard, setHazard] = useState(() => hazardDraft(initialPrep.challenge));
  const [tactics, setTactics] = useState<ReadonlyArray<TacticLine>>(() =>
    initialPrep.tactics.map((text, key) => ({ key, text })),
  );
  const [nextTacticKey, setNextTacticKey] = useState(initialPrep.tactics.length);
  const [treasure, setTreasure] = useState(initialPrep.treasure ?? "");
  const [tagText, setTagText] = useState(encounter?.tags.join(", ") ?? "");
  // `dm` for a new encounter: the column default, and the only safe one to fail to.
  const [visibility, setVisibility] = useState<Visibility>(encounter?.visibility ?? "dm");
  const [lines, setLines] = useState<ReadonlyArray<RosterLine>>(initialRoster);
  const [removed, setRemoved] = useState<ReadonlyArray<EncounterCreatureId>>([]);
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const draft: Draft = {
    name,
    setting,
    kind,
    tags: parseTags(tagText),
    visibility,
    tactics: tactics.map((line) => line.text.trim()).filter((line) => line !== ""),
    treasure: treasure.trim(),
    challenge: challengeOf(kind, skill, hazard),
  };
  const problems = validate(draft, lines);
  const refused = Object.keys(problems).length > 0;

  const pick = useCallback((creature: { readonly id: CreatureId; readonly name: string }) => {
    setLines((current) => [
      ...current,
      {
        key: `new-${creature.id}`,
        id: undefined,
        creatureId: creature.id,
        name: creature.name,
        // The column default is one. The DM raises it; nothing guesses a number.
        count: 1,
        savedCount: undefined,
      },
    ]);
  }, []);

  const drop = useCallback((line: RosterLine) => {
    setLines((current) => current.filter((other) => other.key !== line.key));
    // A line that was never saved has nothing to delete on the server.
    if (line.id !== undefined)
      setRemoved((current) => [...current, line.id as EncounterCreatureId]);
  }, []);

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const trimmed = draft.name.trim();
    const settingLine = draft.setting.trim();
    const { challenge } = draft.challenge;
    const saved = await submit(
      (client) =>
        Effect.gen(function* () {
          const written =
            encounter === undefined
              ? yield* client.encounters.create({
                  params: { campaignId },
                  payload: {
                    name: trimmed,
                    kind: draft.kind,
                    tags: draft.tags,
                    visibility: draft.visibility,
                    ...(settingLine === "" ? {} : { setting: settingLine }),
                    ...(draft.tactics.length === 0 ? {} : { tactics: draft.tactics }),
                    ...(draft.treasure === "" ? {} : { treasure: draft.treasure }),
                    ...(challenge === null ? {} : { challenge }),
                  },
                })
              : yield* client.encounters.update({
                  params: { campaignId, encounterId: encounter.id },
                  payload: {
                    name: trimmed,
                    tags: draft.tags,
                    visibility: draft.visibility,
                    // Only a changed line is sent; none clears it.
                    ...(settingLine === initialSetting.trim()
                      ? {}
                      : { setting: settingLine === "" ? null : settingLine }),
                    // The prep is sent whole, as the form shows it: the kind with
                    // it, because a challenge travels with its kind, and a type
                    // switched away sends none so the server clears it.
                    kind: draft.kind,
                    tactics: draft.tactics,
                    treasure: draft.treasure === "" ? null : draft.treasure,
                    challenge,
                  },
                });

          const encounterId = written.id;

          // Removals first: a line dropped and the same creature re-added in one
          // sitting would otherwise be a 409 against the row on its way out.
          yield* Effect.all(
            removed.map((encounterCreatureId) =>
              client.encounterCreatures.remove({
                params: { campaignId, encounterId, encounterCreatureId },
              }),
            ),
            { concurrency: "unbounded" },
          );

          yield* Effect.all(
            lines
              .filter((line) => line.id === undefined || line.count !== line.savedCount)
              .map((line) =>
                line.id === undefined
                  ? client.encounterCreatures.create({
                      params: { campaignId, encounterId },
                      payload: { creatureId: line.creatureId, count: line.count },
                    })
                  : client.encounterCreatures.update({
                      params: { campaignId, encounterId, encounterCreatureId: line.id },
                      payload: { count: line.count },
                    }),
              ),
            { concurrency: "unbounded" },
          );

          return written;
        }),
      // **`Encounter.creatureCount` is `sum(encounter_creature.count)`,
      // computed per read.** So the roster half of this save moves a number on
      // the Encounters list without the encounter row ever being sent — which is
      // exactly the shape of write this design has to be careful about, and why
      // the roster and the encounter are one key rather than two.
      [reads.encounters(campaignId)],
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const chosen = new Set(lines.map((line) => line.creatureId));
  const total = lines.reduce(
    (sum, line) => sum + (Number.isFinite(line.count) ? line.count : 0),
    0,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{encounter === undefined ? "New encounter" : "Edit encounter"}</DialogTitle>
        <DialogDescription>
          A template you can run any night. Running it never changes what is written here.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
        <Field
          label="Name"
          htmlFor="encounter-name"
          error={showProblems ? problems.name : undefined}
        >
          <Input
            id="encounter-name"
            placeholder="Ambush in the reeds"
            value={name}
            aria-invalid={showProblems && problems.name !== undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Type" htmlFor="encounter-kind">
          <Select value={kind} onValueChange={(value) => setKind(value as EncounterKind)}>
            <SelectTrigger id="encounter-kind">
              <SelectValue>{(value) => encounterKindLabel(value as EncounterKind)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENCOUNTER_KINDS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="What the place looks like"
          htmlFor="encounter-setting"
          hint={
            encounter === undefined
              ? "One line on the ground the fight is on, with no creatures in it. Hob draws the battle map from it once, as the encounter is made. Only you see the map."
              : "The battle map was drawn once, when the encounter was made; changing this does not redraw it. Only you see it."
          }
          error={showProblems ? problems.setting : undefined}
        >
          <Input
            id="encounter-setting"
            maxLength={ENCOUNTER_SETTING_MAX}
            placeholder="A boardwalk over black water, reed beds on both sides"
            value={setting}
            aria-invalid={showProblems && problems.setting !== undefined}
            onChange={(event) => setSetting(event.target.value)}
          />
        </Field>

        {kind === "challenge" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="pb-1 text-label leading-snug font-medium text-heading">
              The challenge
            </legend>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="DC" htmlFor="challenge-dc">
                <Input
                  id="challenge-dc"
                  mono
                  type="number"
                  min={1}
                  max={30}
                  value={skill.dc}
                  onChange={(event) => setSkill({ ...skill, dc: event.target.value })}
                />
              </Field>
              <Field label="Successes" htmlFor="challenge-successes">
                <Input
                  id="challenge-successes"
                  mono
                  type="number"
                  min={1}
                  max={20}
                  value={skill.successes}
                  onChange={(event) => setSkill({ ...skill, successes: event.target.value })}
                />
              </Field>
              <Field label="Failures" htmlFor="challenge-failures">
                <Input
                  id="challenge-failures"
                  mono
                  type="number"
                  min={1}
                  max={20}
                  value={skill.failures}
                  onChange={(event) => setSkill({ ...skill, failures: event.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Skills"
              htmlFor="challenge-skills"
              hint="Separated by commas — Athletics, Survival."
              error={showProblems ? problems.challenge : undefined}
            >
              <Input
                id="challenge-skills"
                placeholder="Athletics, Survival"
                value={skill.skills}
                onChange={(event) => setSkill({ ...skill, skills: event.target.value })}
              />
            </Field>
          </fieldset>
        )}

        {kind === "hazard" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="pb-1 text-label leading-snug font-medium text-heading">
              The hazard
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Saving throw" htmlFor="hazard-ability">
                <Select
                  value={hazard.ability}
                  onValueChange={(value) =>
                    setHazard({ ...hazard, ability: String(value) as AbilityKey | "" })
                  }
                >
                  <SelectTrigger id="hazard-ability">
                    <SelectValue>
                      {(value) => (value === NO_ABILITY ? "Choose one" : String(value))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ABILITY_KEYS.map((ability) => (
                      <SelectItem key={ability} value={ability}>
                        {ability}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Save DC" htmlFor="hazard-dc">
                <Input
                  id="hazard-dc"
                  mono
                  type="number"
                  min={1}
                  max={30}
                  value={hazard.dc}
                  onChange={(event) => setHazard({ ...hazard, dc: event.target.value })}
                />
              </Field>
            </div>
            <Field label="On a failed save" htmlFor="hazard-on-fail">
              <Input
                id="hazard-on-fail"
                maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                placeholder="1 level of exhaustion"
                value={hazard.onFail}
                onChange={(event) => setHazard({ ...hazard, onFail: event.target.value })}
              />
            </Field>
            <Field label="Duration" htmlFor="hazard-duration">
              <Input
                id="hazard-duration"
                maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                placeholder="1d4 hours"
                value={hazard.duration}
                onChange={(event) => setHazard({ ...hazard, duration: event.target.value })}
              />
            </Field>
            <Field
              label="Skills"
              htmlFor="hazard-skills"
              hint="What gets the party through it, separated by commas."
              error={showProblems ? problems.challenge : undefined}
            >
              <Input
                id="hazard-skills"
                placeholder="Survival, Animal Handling"
                value={hazard.skills}
                onChange={(event) => setHazard({ ...hazard, skills: event.target.value })}
              />
            </Field>
          </fieldset>
        )}

        <Field
          label="Tags"
          htmlFor="encounter-tags"
          hint="Separated by commas — Marsh, Night, Boss."
          error={showProblems ? problems.tags : undefined}
        >
          <Input
            id="encounter-tags"
            placeholder="Marsh, Night"
            value={tagText}
            aria-invalid={showProblems && problems.tags !== undefined}
            onChange={(event) => setTagText(event.target.value)}
          />
        </Field>

        <VisibilityField
          id="encounter-visibility"
          value={visibility}
          onChange={setVisibility}
          shared="Your players can see this encounter and its tags."
          hidden="Only you can see this encounter."
        />

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-label leading-snug font-medium text-heading">Creatures</span>
            <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
              {total} {total === 1 ? "creature" : "creatures"}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              Nothing in it yet. Search below and add what the party runs into.
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-hairline">
              {lines.map((line) => (
                <RosterRow
                  key={line.key}
                  line={line}
                  onCount={(count) =>
                    setLines((current) =>
                      current.map((other) =>
                        other.key === line.key ? { ...other, count } : other,
                      ),
                    )
                  }
                  onRemove={() => drop(line)}
                />
              ))}
            </ul>
          )}
          {showProblems && problems.roster !== undefined && (
            <span role="alert" className="text-caption leading-body text-danger-ink">
              {problems.roster}
            </span>
          )}

          <CreaturePicker campaignId={campaignId} chosen={chosen} onPick={pick} />
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-label leading-snug font-medium text-heading">Tactics</span>
            <span className="text-caption leading-body text-muted-foreground">
              How you mean to run it, one short line each, in order. Only you see these.
            </span>
          </div>
          {tactics.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {tactics.map((line, index) => (
                <TacticRow
                  key={line.key}
                  index={index}
                  count={tactics.length}
                  line={line}
                  onText={(text) =>
                    setTactics((current) =>
                      current.map((other) => (other.key === line.key ? { ...other, text } : other)),
                    )
                  }
                  onMove={(by) =>
                    setTactics((current) => {
                      const next = [...current];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + by, 0, moved!);
                      return next;
                    })
                  }
                  onRemove={() =>
                    setTactics((current) => current.filter((other) => other.key !== line.key))
                  }
                />
              ))}
            </ol>
          )}
          {showProblems && problems.tactics !== undefined && (
            <span role="alert" className="text-caption leading-body text-danger-ink">
              {problems.tactics}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={tactics.length >= ENCOUNTER_TACTICS_MAX}
            onClick={() => {
              setTactics((current) => [...current, { key: nextTacticKey, text: "" }]);
              setNextTacticKey((key) => key + 1);
            }}
          >
            <Icon name="plus" size={13} />
            Add a line
          </Button>
        </div>

        <Field
          label="Treasure"
          htmlFor="encounter-treasure"
          hint="What the party can come away with. Only you see it."
          error={showProblems ? problems.treasure : undefined}
        >
          <Input
            id="encounter-treasure"
            maxLength={ENCOUNTER_TREASURE_MAX}
            placeholder="28 sp and a bone whistle"
            value={treasure}
            onChange={(event) => setTreasure(event.target.value)}
          />
        </Field>
      </div>

      {/* The failure belongs in the footer, not at the end of the body: the body
          scrolls, and a form long enough to need scrolling is one where a line
          appended below the fold is a line the DM never sees. This sits beside
          the button they just pressed, which is where they are looking. */}
      <DialogFooter>
        {failure !== undefined && (
          <div className="mr-auto min-w-0 flex-1 text-left">
            <SaveFailure failure={failure} />
          </div>
        )}
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : encounter === undefined ? "Create encounter" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The prep the form edits: `EncounterPrep` without its key. */
type Prep = Pick<EncounterPrep, "tactics" | "treasure" | "challenge">;

const NO_PREP: Prep = { tactics: [], treasure: null, challenge: null };

interface Loaded {
  readonly roster: ReadonlyArray<RosterLine>;
  readonly setting: string;
  readonly prep: Prep;
}

/**
 * What an edit starts from beyond the `Encounter` itself: its roster, its
 * map's setting line and its prep, keyed on the campaign and the encounter — or on
 * `undefined`, which is a new encounter, an empty list and no line rather than
 * a request.
 *
 * The name rides on the row itself (`EncounterCreature.name`, resolved
 * server-side), and that is load-bearing rather than convenient: a roster line
 * may point at a campaign instance the corpus list never returns — the
 * instancing decision of 2026-09-02 — so a client-side join against
 * `creatures.list` would name some lines "unknown" about creatures that are
 * right there.
 */
const formAtom = Atom.family(
  ({
    campaignId,
    encounterId,
  }: {
    readonly campaignId: CampaignId;
    readonly encounterId: EncounterId | undefined;
  }) =>
    apiAtom(
      (client) =>
        encounterId === undefined
          ? Effect.succeed<Loaded>({ roster: [], setting: "", prep: NO_PREP })
          : Effect.map(
              Effect.all(
                {
                  rows: client.encounterCreatures.list({ params: { campaignId, encounterId } }),
                  map: client.battleMaps.find({ params: { campaignId, encounterId } }),
                  prep: client.encounterPrep.find({ params: { campaignId, encounterId } }),
                },
                { concurrency: "unbounded" },
              ),
              ({ rows, map, prep }): Loaded => ({
                roster: rows.map((row): RosterLine => ({
                  key: row.id,
                  id: row.id,
                  creatureId: row.creatureId,
                  name: row.name,
                  count: row.count,
                  savedCount: row.count,
                })),
                setting: map.setting ?? "",
                prep,
              }),
            ),
      // This encounter's own roster and setting line. `reads.encounters` is
      // what a roster write already names — for the `creatureCount` on the
      // card — and what this form's save names, so a save reaching these too
      // costs nothing and keeps a reopened dialog honest.
      encounterId === undefined ? [] : [reads.encounters(campaignId)],
    ),
);

export function EncounterDialog({
  campaignId,
  encounter,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Absent for a new one. Present, and this edits it. */
  readonly encounter: Encounter | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const encounterId = encounter?.id;

  /**
   * The roster, and the names to render it by.
   *
   * Two calls rather than one: `encounter_creature` carries a `creatureId` and
   * no name — it is a roster line, not a copy of the creature — so the bestiary
   * is what turns an id into a row a DM recognises. Composed into one Effect for
   * the reason `campaign/load.ts` gives: two hooks here would be four states to
   * render inside a dialog that has room for one.
   */
  const [loaded, reload] = useApiAtom(formAtom({ campaignId, encounterId }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={encounter === undefined ? "New encounter" : "Edit encounter"}>
        {loaded.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Reading the encounter…" />
          </div>
        )}
        {loaded.state === "failed" && (
          <div className="px-gutter py-gutter">
            <ApiFailureNotice failure={loaded.failure} onRetry={reload} />
          </div>
        )}
        {loaded.state === "ready" && (
          <EncounterForm
            campaignId={campaignId}
            encounter={encounter}
            initialRoster={loaded.value.roster}
            initialSetting={loaded.value.setting}
            initialPrep={loaded.value.prep}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
