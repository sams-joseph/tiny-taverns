import type { CharacterSheet, Combatant, CombatantId, EncounterRunScene } from "@taverns/api";
import { challengeTally, checkOutcome, CHECK_SKILL_MAX } from "@taverns/api";
import { Button, Icon, Input, Label, SectionHeading, Toggle } from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { signed, type LocalRoll } from "../characters/rolls";
import { SaveFailure } from "../ui/form";
import type { RunPath } from "./load";
import { lastDc, skillModifier } from "./scene";
import { newRequestId } from "./state";

/**
 * *Make a check* — who is trying, with what, and their total — for a
 * conversation or a skill challenge (a hazard calls for saves on its own rows).
 *
 * **The DC is the record's, never the attitude's.** A skill challenge's is its
 * snapshot's; a conversation has none of its own, so the DM types one for each
 * check and the box starts from the last one they set (the captain's call on
 * attitude). The skills offered are the challenge's own, or for a conversation
 * the four the drawing offers; any other skill can be typed, because a DM may
 * call for one the prep did not list.
 *
 * *Roll for them* adds the modifier the character's sheet holds for that skill
 * and rolls into the DM's own dice, so the faces are there to check; with no
 * modifier on the sheet it rolls nothing rather than guess.
 */

/** The drawing's social skills — a picker's vocabulary, not a rule. */
const SOCIAL_SKILLS = ["Persuasion", "Deception", "Intimidation", "Insight"] as const;

/** `EncounterRunCheckCreate`'s bounds. */
const TOTAL_MIN = -20;
const TOTAL_MAX = 99;
const DC_MIN = 1;
const DC_MAX = 30;

/** Digits and a minus sign, three characters at most — the drawing's filter. */
const typedNumber = (text: string): string => text.replace(/[^0-9-]/g, "").slice(0, 3);

const parsed = (text: string, min: number, max: number): number | undefined => {
  if (!/^-?\d+$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
};

export function MakeACheck({
  path,
  scene,
  party,
  sheetOf,
  disabled,
  onRoll,
}: {
  readonly path: RunPath;
  readonly scene: EncounterRunScene;
  /** The party's rows in this scene: who may be trying. */
  readonly party: ReadonlyArray<Combatant>;
  readonly sheetOf: (combatant: Combatant) => CharacterSheet | undefined;
  readonly disabled: boolean;
  readonly onRoll: (label: string, notation: string) => LocalRoll | undefined;
}) {
  const challenge = scene.challenge?.kind === "challenge" ? scene.challenge : undefined;
  const settled =
    challenge !== undefined && challengeTally(challenge, scene.checks).settled !== null;

  const [whoId, setWhoId] = useState<CombatantId | undefined>();
  const [skill, setSkill] = useState("");
  const [total, setTotal] = useState("");
  const [dcText, setDcText] = useState(() => {
    const last = lastDc(scene.checks);
    return last === undefined ? "" : String(last);
  });
  const { busy, failure, submit } = useMutation();

  const who = party.find((combatant) => combatant.id === whoId);
  const skills: ReadonlyArray<string> = challenge?.skills ?? SOCIAL_SKILLS;
  const trimmedSkill = skill.trim();
  const sheet = who === undefined ? undefined : sheetOf(who);
  const modifierOf = (name: string): number | undefined =>
    sheet === undefined ? undefined : skillModifier(sheet, name);
  const modifier = trimmedSkill === "" ? undefined : modifierOf(trimmedSkill);

  const totalValue = parsed(total, TOTAL_MIN, TOTAL_MAX);
  const dc = challenge?.dc ?? parsed(dcText, DC_MIN, DC_MAX);
  const ready =
    !settled &&
    who !== undefined &&
    trimmedSkill !== "" &&
    totalValue !== undefined &&
    dc !== undefined;

  const hint = settled
    ? "The challenge is settled."
    : party.length === 0
      ? "Nobody from the party is in this scene."
      : who === undefined
        ? "Who's trying?"
        : trimmedSkill === ""
          ? "With what?"
          : totalValue === undefined
            ? "Their total, or roll for them."
            : dc === undefined
              ? "What's the DC?"
              : checkOutcome(totalValue, dc) === "success"
                ? `Beats DC ${String(dc)}.`
                : `Misses DC ${String(dc)}.`;
  const hintTone =
    ready && totalValue !== undefined && dc !== undefined
      ? checkOutcome(totalValue, dc) === "success"
        ? "text-success"
        : "text-danger"
      : "text-muted-foreground";

  const rollForThem = () => {
    if (who === undefined || modifier === undefined) return;
    const rolled = onRoll(`${who.displayName} · ${trimmedSkill}`, `1d20${signed(modifier)}`);
    if (rolled !== undefined) setTotal(String(rolled.total));
  };

  const log = async () => {
    if (!ready || disabled || who === undefined || totalValue === undefined) return;
    const logged = await submit(
      (client) =>
        client.runs.logCheck({
          params: path,
          payload: {
            combatantId: who.id,
            skill: trimmedSkill,
            total: totalValue,
            // A challenge's DC is its own, which the server fills in; a
            // conversation's is the one typed here.
            ...(challenge === undefined && dc !== undefined ? { dc } : {}),
            requestId: newRequestId(),
          },
        }),
      [reads.runScene(path.runId)],
    );
    if (Result.isSuccess(logged)) {
      // The next check is somebody else's; the DC stays for them.
      setWhoId(undefined);
      setSkill("");
      setTotal("");
    }
  };

  const off = disabled || settled || busy;
  const typedOther = trimmedSkill !== "" && !skills.includes(trimmedSkill) ? skill : "";

  return (
    <section
      aria-label="Make a check"
      className="flex flex-col gap-3.5 rounded-card border border-hairline border-t-3 border-t-accent bg-surface-card p-panel shadow-1"
    >
      <div className="flex items-center gap-2">
        <SectionHeading as="h2" size="title" className="flex-1">
          Make a check
        </SectionHeading>
        {challenge !== undefined ? (
          <span className="font-mono text-mono leading-none text-muted-foreground">
            DC {challenge.dc}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Label htmlFor="check-dc" className="font-mono text-mono text-muted-foreground">
              DC
            </Label>
            <Input
              id="check-dc"
              mono
              inputMode="numeric"
              placeholder="–"
              value={dcText}
              disabled={off}
              className="w-14"
              onChange={(event) => setDcText(typedNumber(event.target.value))}
            />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Who</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who is trying">
          {party.map((combatant) => (
            <Toggle
              key={combatant.id}
              size="sm"
              pressed={combatant.id === whoId}
              disabled={off}
              onPressedChange={(on) => setWhoId(on ? combatant.id : undefined)}
            >
              {combatant.displayName}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Skill</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="With what">
          {skills.map((name) => {
            const bonus = modifierOf(name);
            return (
              <Toggle
                key={name}
                size="sm"
                pressed={trimmedSkill === name}
                disabled={off}
                aria-label={name}
                onPressedChange={(on) => setSkill(on ? name : "")}
              >
                {name}
                {bonus !== undefined && <span className="font-mono">{signed(bonus)}</span>}
              </Toggle>
            );
          })}
        </div>
        <Input
          aria-label="Another skill"
          placeholder="Another skill"
          value={typedOther}
          maxLength={CHECK_SKILL_MAX}
          disabled={off}
          onChange={(event) => setSkill(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="check-total">Their total</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="check-total"
            mono
            inputMode="numeric"
            placeholder="–"
            value={total}
            disabled={off}
            className="w-18 shrink-0"
            onChange={(event) => setTotal(typedNumber(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void log();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={off || modifier === undefined}
            onClick={rollForThem}
          >
            <Icon name="dice-5" size={13} />
            Roll for them
          </Button>
        </div>
        <span role="status" className={`text-caption leading-snug ${hintTone}`}>
          {hint}
        </span>
      </div>

      <Button disabled={!ready || off} onClick={() => void log()}>
        <Icon name="check" size={14} />
        {busy ? "Logging…" : "Log check"}
      </Button>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </section>
  );
}
