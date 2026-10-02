import {
  ABILITY_KEYS,
  type AbilityKey,
  LEVEL_UP_NOTE_MAX,
  type LevelUpChoice,
  type LevelUpOffer,
  type LevelUpPrerequisite,
  type LevelUpSpellOption,
  modifierOf,
  type OwnedCharacter,
  type SpellId,
} from "@taverns/api";
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Loading,
  Toggle,
} from "@taverns/ui";
import { Result } from "effect";
import { type ReactNode, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";
import {
  type AsiMode,
  choiceKey,
  choiceLines,
  chosenSubclass,
  emptyLevelUpDraft,
  hitPointGainFor,
  type LevelUpDraft,
  levelUpPayloadFor,
  levelUpReview,
  type LevelUpStep,
  levelUpSteps,
  raisedScore,
  signed,
  stepReady,
  stepTitle,
} from "./levelUp";
import { levelUpOfferAtom } from "./load";
import { levelUpOwnCharacter, levelUpWrites } from "./write";

/**
 * **Levelling a character up**: the wizard over the sheet that walks its
 * owner through the next level's offer — what changes on its own, the hit
 * points, then each choice the level asks for, the review, and the confirm.
 *
 * The offer is the server's (`levelUpOfferAtom`), and the steps are only the
 * parts it carries (`levelUp.ts`). The confirm sends one `POST
 * /me/characters/:id/level-up` with the version the offer was read at; the
 * server reads the offer again in the same transaction and holds every choice
 * to it, so a sheet that moved since is a `Conflict`. *Reload* then reads the
 * sheet and the offer again, and a new version starts the wizard over on the
 * new offer, because the choices were made against one that is gone.
 *
 * Nothing here rolls a die: a rolled hit point gain is the server's, at the
 * confirm, and the Log says what it landed on.
 */
export function LevelUpDialog({
  owned,
  onClose,
  onDone,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  readonly onClose: () => void;
  /** The level is taken; the sheet re-reads itself through the write's keys. */
  readonly onDone: () => void;
  /** Read the sheet again, after a refusal that says it moved on. */
  readonly onReload: () => void;
}) {
  const [resource, reloadOffer] = useApiAtom(levelUpOfferAtom(owned.character.id));
  const reread = () => {
    onReload();
    reloadOffer();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Level up" className="@container">
        {resource.state === "loading" ? (
          <Loading label="Reading the next level…" inline />
        ) : resource.state === "failed" ? (
          <div className="p-gutter">
            <ApiFailureNotice failure={resource.failure} onRetry={reloadOffer} />
          </div>
        ) : (
          <LevelUpWizard
            // A new version is a new offer: the choices start over against it.
            key={`${String(resource.value.version)}:${String(resource.value.fromLevel)}`}
            owned={owned}
            offer={resource.value}
            onClose={onClose}
            onDone={onDone}
            onReread={reread}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LevelUpWizard({
  owned,
  offer,
  onClose,
  onDone,
  onReread,
}: {
  readonly owned: OwnedCharacter;
  readonly offer: LevelUpOffer;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly onReread: () => void;
}) {
  const character = owned.character;
  const body = character.sheet;
  const [draft, setDraft] = useState<LevelUpDraft>(emptyLevelUpDraft);
  const [at, setAt] = useState(0);
  const { busy, failure, submit } = useMutation();

  const steps = levelUpSteps(offer, draft);
  const index = Math.min(at, steps.length - 1);
  const step = steps[index]!;
  const ready = stepReady(offer, body, draft, step);
  const change = (patch: Partial<LevelUpDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const confirm = async () => {
    const done = await submit(
      (client) => levelUpOwnCharacter(client, character, levelUpPayloadFor(offer, draft)),
      levelUpWrites(owned),
    );
    if (Result.isSuccess(done)) onDone();
  };

  const review = step.id === "review" ? levelUpReview(offer, body, draft) : undefined;
  const who = offer.className === null ? character.name : `${character.name}, ${offer.className}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Level up to {offer.toLevel}</DialogTitle>
        <DialogDescription>
          {who} · step {index + 1} of {steps.length}: {stepTitle(step)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-gutter py-3">
        <StepBody
          step={step}
          offer={offer}
          owned={owned}
          draft={draft}
          change={change}
          review={review}
        />
      </div>

      <DialogFooter className="flex-wrap">
        {failure !== undefined && (
          <div className="mr-auto min-w-0 flex-1 text-left">
            <SaveFailure failure={failure} onReload={onReread} />
          </div>
        )}
        {index === 0 ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setAt(index - 1)}>
            Back
          </Button>
        )}
        {step.id === "review" ? (
          <Button
            size="sm"
            disabled={busy || review === undefined || Result.isFailure(review)}
            onClick={() => void confirm()}
          >
            {busy ? "Levelling up…" : `Level up to ${String(offer.toLevel)}`}
          </Button>
        ) : (
          <Button size="sm" disabled={!ready} onClick={() => setAt(index + 1)}>
            Next
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** A small caps label over a part of a step. */
function Part({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-micro leading-none tracking-caps text-faint uppercase">{label}</p>
      {children}
    </div>
  );
}

/** `label   from → to`, one row of what moves. */
function Moves({
  label,
  from,
  to,
}: {
  readonly label: string;
  readonly from: string | undefined;
  readonly to: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <span className="min-w-0 text-body-s leading-snug text-foreground">{label}</span>
      <span className="shrink-0 font-mono text-mono leading-none text-heading">
        {from === undefined ? to : `${from} → ${to}`}
      </span>
    </div>
  );
}

/** Prose the source writes as paragraphs, quietly. */
function Prose({ lines }: { readonly lines: ReadonlyArray<string> }) {
  return (
    <>
      {lines.map((line, at) => (
        <p
          key={`${String(at)}:${line.slice(0, 24)}`}
          className="max-w-measure text-caption leading-body text-muted-foreground"
        >
          {line}
        </p>
      ))}
    </>
  );
}

/**
 * One option a person can tick: a checkbox named for it, its words, and —
 * when it cannot be taken — why not.
 */
function Pick({
  label,
  checked,
  disabled,
  onChange,
  badge,
  why,
  children,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly badge?: string;
  readonly why?: string;
  readonly children?: ReactNode;
}) {
  // The label holds the name alone: the primitive names the box by the label
  // that wraps it, and the prose under it is a description, not a name.
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-hairline py-2 last:border-b-0",
        disabled && !checked ? "text-faint" : "text-foreground",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={checked}
            disabled={disabled}
            onCheckedChange={(next) => onChange(Boolean(next))}
          />
          <span className="text-body-s leading-snug font-semibold text-heading">{label}</span>
        </label>
        {badge !== undefined && <Badge variant="outline">{badge}</Badge>}
      </div>
      {(why !== undefined || children !== undefined) && (
        <div className="flex flex-col gap-1 pl-7">
          {why !== undefined && (
            <span className="text-caption leading-body text-danger-ink">{why}</span>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Ticking one of `choose`: a single choice swaps its answer, a wider one adds
 * until it is full.
 */
const ticked = (
  current: ReadonlyArray<string>,
  value: string,
  checked: boolean,
  choose: number,
): ReadonlyArray<string> => {
  if (!checked) return current.filter((entry) => entry !== value);
  if (current.includes(value)) return current;
  if (choose === 1) return [value];
  return current.length >= choose ? current : [...current, value];
};

const unmet = (prerequisites: ReadonlyArray<LevelUpPrerequisite>): string | undefined => {
  const needs = prerequisites.flatMap((prerequisite) =>
    prerequisite.met
      ? []
      : [prerequisite.type === "level" ? `level ${String(prerequisite.level)}` : prerequisite.name],
  );
  return needs.length === 0 ? undefined : `Needs ${needs.join(" and ")}.`;
};

function StepBody({
  step,
  offer,
  owned,
  draft,
  change,
  review,
}: {
  readonly step: LevelUpStep;
  readonly offer: LevelUpOffer;
  readonly owned: OwnedCharacter;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
  readonly review: ReturnType<typeof levelUpReview> | undefined;
}) {
  switch (step.id) {
    case "automatic":
      return <AutomaticStep offer={offer} />;
    case "hitPoints":
      return <HitPointsStep offer={offer} owned={owned} draft={draft} change={change} />;
    case "subclass":
      return <SubclassStep offer={offer} draft={draft} change={change} />;
    case "choice":
      return <ChoiceStep choice={step.choice} draft={draft} change={change} />;
    case "asi":
      return <AsiStep offer={offer} owned={owned} draft={draft} change={change} />;
    case "spells":
      return <SpellsStep offer={offer} owned={owned} draft={draft} change={change} />;
    case "review":
      return (
        <ReviewStep offer={offer} owned={owned} draft={draft} change={change} review={review} />
      );
  }
}

/** What the level changes with nobody choosing anything, before and after. */
function AutomaticStep({ offer }: { readonly offer: LevelUpOffer }) {
  const automatic = offer.automatic;
  const casting = automatic.spellcasting;
  const prepared = offer.spells?.prepared;
  const numbers: ReadonlyArray<{
    readonly label: string;
    readonly from: string | undefined;
    readonly to: string;
  }> = [
    ...(automatic.proficiencyBonus === undefined
      ? []
      : [
          {
            label: "Proficiency bonus",
            from:
              automatic.proficiencyBonus.from === undefined
                ? undefined
                : signed(automatic.proficiencyBonus.from),
            to: signed(automatic.proficiencyBonus.to),
          },
        ]),
    ...(automatic.attacksPerAction === undefined
      ? []
      : [
          {
            label: "Attacks per Attack action",
            from:
              automatic.attacksPerAction.from === undefined
                ? undefined
                : String(automatic.attacksPerAction.from),
            to: String(automatic.attacksPerAction.to),
          },
        ]),
    ...automatic.resources.map((resource) => ({
      label: resource.name,
      from: resource.from === undefined ? undefined : String(resource.from),
      to: `${String(resource.to)}${resource.unit === undefined ? "" : ` ${resource.unit}`}`,
    })),
    ...(casting?.save === undefined
      ? []
      : [{ label: "Spell save DC", from: casting.save.from, to: casting.save.to }]),
    ...(casting?.attack === undefined
      ? []
      : [{ label: "Spell attack", from: casting.attack.from, to: casting.attack.to }]),
    ...(casting?.cantripsKnown === undefined
      ? []
      : [
          {
            label: "Cantrips known",
            from:
              casting.cantripsKnown.from === undefined
                ? undefined
                : String(casting.cantripsKnown.from),
            to: String(casting.cantripsKnown.to),
          },
        ]),
    ...(casting?.spellsKnown === undefined
      ? []
      : [
          {
            label: "Spells known",
            from:
              casting.spellsKnown.from === undefined ? undefined : String(casting.spellsKnown.from),
            to: String(casting.spellsKnown.to),
          },
        ]),
    ...(prepared === undefined
      ? []
      : [
          {
            label: "Spells you can prepare",
            from: prepared.from === undefined ? undefined : String(prepared.from),
            to: String(prepared.to),
          },
        ]),
  ];

  const nothing =
    numbers.length === 0 &&
    automatic.features.length === 0 &&
    automatic.subclassSpells.length === 0;
  return (
    <>
      {nothing && (
        <p className="text-body-s leading-body text-muted-foreground">
          Nothing changes on its own at level {offer.toLevel}; the next steps are yours.
        </p>
      )}
      {numbers.length > 0 && (
        <Part label="Numbers">
          <div className="flex flex-col">
            {numbers.map((row) => (
              <Moves key={row.label} label={row.label} from={row.from} to={row.to} />
            ))}
          </div>
        </Part>
      )}
      {automatic.features.length > 0 && (
        <Part label="New features">
          {automatic.features.map((feature) => (
            <div key={feature.featureId} className="flex flex-col gap-1">
              <p className="text-body-s leading-snug font-semibold text-heading">{feature.name}</p>
              <Prose lines={feature.desc} />
            </div>
          ))}
        </Part>
      )}
      {automatic.subclassSpells.length > 0 && (
        <Part label="Always prepared">
          <p className="text-body-s leading-body text-foreground">
            {automatic.subclassSpells.map((spell) => spell.name).join(", ")}
          </p>
        </Part>
      )}
    </>
  );
}

function HitPointsStep({
  offer,
  owned,
  draft,
  change,
}: {
  readonly offer: LevelUpOffer;
  readonly owned: OwnedCharacter;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
}) {
  const hitPoints = offer.hitPoints;
  if (hitPoints === undefined) return null;
  const bonus = hitPoints.bonus === 0 ? "" : signed(hitPoints.bonus);
  const max = owned.character.hpMax;
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How to gain hit points">
        <Toggle
          size="sm"
          pressed={draft.hitPoints === "fixed"}
          onPressedChange={() => change({ hitPoints: "fixed" })}
        >
          Take {hitPoints.fixed}
        </Toggle>
        <Toggle
          size="sm"
          pressed={draft.hitPoints === "rolled"}
          onPressedChange={() => change({ hitPoints: "rolled" })}
        >
          Roll 1d{hitPoints.die}
          {bonus}
        </Toggle>
      </div>
      <p className="text-body-s leading-body text-muted-foreground">
        {draft.hitPoints === "fixed"
          ? `The d${String(hitPoints.die)}'s average rounded up, ${String(hitPoints.fixed - hitPoints.bonus)}${hitPoints.bonus === 0 ? "" : `, ${signed(hitPoints.bonus)} for Constitution and race`}.`
          : `Rolled when you confirm, and written on the Log: between ${String(hitPoints.rolled.minimum)} and ${String(hitPoints.rolled.maximum)}.`}
      </p>
      {max !== null && draft.hitPoints === "fixed" && (
        <Moves label="Hit point maximum" from={String(max)} to={String(max + hitPoints.fixed)} />
      )}
    </>
  );
}

function SubclassStep({
  offer,
  draft,
  change,
}: {
  readonly offer: LevelUpOffer;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
}) {
  const subclass = offer.subclass;
  if (subclass === undefined) return null;
  return (
    <>
      <p className="text-body-s leading-body text-muted-foreground">
        {subclass.current === undefined
          ? `A ${offer.className ?? "class"} takes its subclass at level ${String(subclass.level)}. Choose one.`
          : `The sheet names ${subclass.current}, which these rules do not have. Choose one of these to take its features, or go on to keep the name.`}
      </p>
      <div className="flex flex-col">
        {subclass.options.map((option) => (
          <Pick
            key={option.subclassId}
            label={option.name}
            checked={draft.subclassId === option.subclassId}
            disabled={false}
            onChange={(checked) =>
              change({
                subclassId: checked ? option.subclassId : undefined,
                subclassName: "",
              })
            }
          >
            {option.flavor !== null && (
              <span className="text-caption leading-body text-muted-foreground">
                {option.flavor}
              </span>
            )}
            <Prose lines={option.desc.slice(0, 1)} />
            {option.features.length > 0 && (
              <span className="text-caption leading-body text-foreground">
                Now: {option.features.map((feature) => feature.name).join(", ")}
              </span>
            )}
          </Pick>
        ))}
      </div>
      <Field
        label="Or name one of your own"
        htmlFor="level-up-subclass-name"
        hint="A name grants nothing: its features are yours to write on the sheet."
      >
        <Input
          id="level-up-subclass-name"
          maxLength={120}
          value={draft.subclassName}
          onChange={(event) => change({ subclassName: event.target.value, subclassId: undefined })}
        />
      </Field>
    </>
  );
}

function ChoiceStep({
  choice,
  draft,
  change,
}: {
  readonly choice: LevelUpChoice;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
}) {
  const key = choiceKey(choice);
  const answers = draft.picks[key] ?? [];
  const full = choice.choose > 1 && answers.length >= choice.choose;
  const set = (value: string, checked: boolean) =>
    change({ picks: { ...draft.picks, [key]: ticked(answers, value, checked, choice.choose) } });
  return (
    <>
      <p className="text-body-s leading-body text-muted-foreground">
        {choice.kind === "expertise"
          ? `Choose ${String(choice.choose)} you are proficient in. Your proficiency bonus counts twice for them.`
          : `Choose ${String(choice.choose)}.`}{" "}
        <span className="font-mono text-mono text-heading">
          {answers.length}/{choice.choose}
        </span>
      </p>
      {choice.kind === "text" && choice.desc !== undefined && <Prose lines={[choice.desc]} />}
      <div className="flex flex-col">
        {choice.kind === "feature"
          ? choice.options.map((option) => {
              const checked = answers.includes(option.featureId);
              return (
                <Pick
                  key={option.featureId}
                  label={option.name}
                  checked={checked}
                  disabled={!option.available || (full && !checked)}
                  why={option.available ? undefined : unmet(option.prerequisites)}
                  onChange={(next) => set(option.featureId, next)}
                >
                  <Prose lines={option.desc.slice(0, 1)} />
                </Pick>
              );
            })
          : choice.options.map((option) => {
              const checked = answers.includes(option);
              return (
                <Pick
                  key={option}
                  label={option}
                  checked={checked}
                  disabled={full && !checked}
                  onChange={(next) => set(option, next)}
                />
              );
            })}
      </div>
    </>
  );
}

function AsiStep({
  offer,
  owned,
  draft,
  change,
}: {
  readonly offer: LevelUpOffer;
  readonly owned: OwnedCharacter;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
}) {
  const asi = offer.abilityScoreImprovement;
  if (asi === undefined) return null;
  const body = owned.character.sheet;
  const { mode, abilities } = draft.asi;
  const setMode = (next: AsiMode) =>
    change({ asi: { mode: next, abilities: [], featId: undefined } });
  const tick = (ability: AbilityKey) => {
    const on = abilities.includes(ability);
    const next = on
      ? abilities.filter((entry) => entry !== ability)
      : mode === "one"
        ? [ability]
        : abilities.length >= 2
          ? abilities
          : [...abilities, ability];
    change({ asi: { ...draft.asi, abilities: next } });
  };
  // A CON modifier that moves moves every level's hit points.
  const constitution =
    mode === "feat" || !abilities.includes("CON")
      ? undefined
      : (() => {
          const raised = raisedScore(offer, body, "CON", mode);
          if (raised === undefined) return undefined;
          const from = modifierOf(body.abilities, "CON");
          const to = Math.floor((raised - 10) / 2);
          return to === from ? undefined : { from, to };
        })();

  return (
    <>
      <p className="text-body-s leading-body text-muted-foreground">
        {asi.points} points: both on one score, or one each on two. No score goes above{" "}
        {asi.maximum}.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Where the points go">
        <Toggle size="sm" pressed={mode === "one"} onPressedChange={() => setMode("one")}>
          +{asi.points} to one score
        </Toggle>
        <Toggle size="sm" pressed={mode === "two"} onPressedChange={() => setMode("two")}>
          +1 to two scores
        </Toggle>
        {asi.feats !== undefined && (
          <Toggle size="sm" pressed={mode === "feat"} onPressedChange={() => setMode("feat")}>
            A feat instead
          </Toggle>
        )}
      </div>
      {mode === "feat" ? (
        <div className="flex flex-col">
          {(asi.feats ?? []).map((feat) => (
            <Pick
              key={feat.featId}
              label={feat.name}
              checked={draft.asi.featId === feat.featId}
              disabled={false}
              onChange={(checked) =>
                change({ asi: { ...draft.asi, featId: checked ? feat.featId : undefined } })
              }
            >
              {feat.prerequisites.length > 0 && (
                <span className="text-caption leading-body text-muted-foreground">
                  Needs{" "}
                  {feat.prerequisites
                    .map(
                      (prerequisite) => `${prerequisite.ability} ${String(prerequisite.minimum)}`,
                    )
                    .join(" or ")}
                </span>
              )}
              <Prose lines={feat.description.slice(0, 1)} />
            </Pick>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3" role="group" aria-label="Scores">
          {ABILITY_KEYS.map((ability) => {
            const cell = body.abilities.find(
              (entry) => entry.label.trim().toUpperCase() === ability,
            );
            const raised = raisedScore(offer, body, ability, mode);
            const on = abilities.includes(ability);
            return (
              <Toggle
                key={ability}
                size="sm"
                aria-label={`Raise ${ability}`}
                pressed={on}
                disabled={raised === undefined && !on}
                onPressedChange={() => tick(ability)}
                className="justify-between font-mono"
              >
                <span>{ability}</span>
                <span>
                  {cell?.score ?? "—"}
                  {on && raised !== undefined ? ` → ${String(raised)}` : ""}
                </span>
              </Toggle>
            );
          })}
        </div>
      )}
      {constitution !== undefined && (
        <p className="text-body-s leading-body text-foreground">
          Constitution&rsquo;s modifier goes from {signed(constitution.from)} to{" "}
          {signed(constitution.to)}: {signed((constitution.to - constitution.from) * offer.toLevel)}{" "}
          hit points, one for each of your {offer.toLevel} levels.
        </p>
      )}
    </>
  );
}

/** One list of spells to tick, up to `limit`. */
function SpellList({
  label,
  limit,
  options,
  chosen,
  onChange,
}: {
  readonly label: string;
  readonly limit: number;
  readonly options: ReadonlyArray<LevelUpSpellOption>;
  readonly chosen: ReadonlyArray<SpellId>;
  readonly onChange: (next: ReadonlyArray<SpellId>) => void;
}) {
  const full = limit > 1 && chosen.length >= limit;
  return (
    <Part label={`${label} · ${String(chosen.length)}/${String(limit)}`}>
      {options.length === 0 ? (
        <p className="text-caption leading-body text-muted-foreground">No spell matches.</p>
      ) : (
        <div className="flex flex-col">
          {options.map((option) => {
            const checked = chosen.includes(option.spellId);
            return (
              <Pick
                key={option.spellId}
                label={option.name}
                badge={option.level === 0 ? "Cantrip" : `L${String(option.level)}`}
                checked={checked}
                disabled={full && !checked}
                onChange={(next) =>
                  onChange(ticked(chosen, option.spellId, next, limit) as ReadonlyArray<SpellId>)
                }
              >
                <span className="text-caption leading-body text-faint">{option.school}</span>
              </Pick>
            );
          })}
        </div>
      )}
    </Part>
  );
}

function SpellsStep({
  offer,
  owned,
  draft,
  change,
}: {
  readonly offer: LevelUpOffer;
  readonly owned: OwnedCharacter;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
}) {
  const [query, setQuery] = useState("");
  const spells = offer.spells;
  if (spells === undefined) return null;
  const chosen = draft.spells;
  const set = (patch: Partial<LevelUpDraft["spells"]>) =>
    change({ spells: { ...chosen, ...patch } });
  const needle = query.trim().toLowerCase();
  const matching = (options: ReadonlyArray<LevelUpSpellOption>) =>
    needle === ""
      ? options
      : options.filter(
          (option) =>
            option.name.toLowerCase().includes(needle) ||
            option.school.toLowerCase().includes(needle),
        );
  const cantrips = spells.options.filter((option) => option.level === 0);
  const levelled = spells.options.filter((option) => option.level > 0);
  // What a known caster may give up: a class spell it knows, not a secret or an arcanum.
  const givable = (owned.character.sheet.spellcasting?.known ?? []).flatMap((spell) =>
    spell.spellId === undefined ||
    spell.spellId === null ||
    (spell.level ?? 0) === 0 ||
    spell.learnedBy !== undefined
      ? []
      : [{ spellId: spell.spellId, name: spell.name, level: spell.level ?? 0 }],
  );
  const swap = spells.replace && levelled.length > 0 && givable.length > 0;

  return (
    <>
      <p className="text-body-s leading-body text-muted-foreground">
        Any you leave unpicked you can learn later with Choose spells.
      </p>
      <Input
        aria-label="Search spells"
        placeholder="Search spells"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {spells.cantrips > 0 && (
        <SpellList
          label="New cantrips"
          limit={spells.cantrips}
          options={matching(cantrips)}
          chosen={chosen.cantrips}
          onChange={(next) => set({ cantrips: next })}
        />
      )}
      {spells.spells > 0 && (
        <SpellList
          label={spells.mode === "spellbook" ? "New spells for your book" : "New spells"}
          limit={spells.spells}
          options={matching(levelled)}
          chosen={chosen.learned}
          onChange={(next) => set({ learned: next })}
        />
      )}
      {spells.magicalSecrets !== undefined && spells.magicalSecrets.count > 0 && (
        <SpellList
          label={`Magical Secrets, any list to level ${String(spells.magicalSecrets.maximumLevel)}`}
          limit={spells.magicalSecrets.count}
          options={matching(spells.magicalSecrets.options)}
          chosen={chosen.magicalSecrets}
          onChange={(next) => set({ magicalSecrets: next })}
        />
      )}
      {spells.mysticArcanum !== undefined && (
        <SpellList
          label={`Mystic Arcanum, level ${String(spells.mysticArcanum.level)}`}
          limit={1}
          options={matching(spells.mysticArcanum.options)}
          chosen={chosen.mysticArcanum === undefined ? [] : [chosen.mysticArcanum]}
          onChange={(next) => set({ mysticArcanum: next[0] })}
        />
      )}
      {swap && (
        <Part label="Swap one spell you know (optional)">
          <p className="text-caption leading-body text-muted-foreground">Give up</p>
          <div className="flex flex-col">
            {givable.map((spell) => (
              <Pick
                key={spell.spellId}
                label={`Give up ${spell.name}`}
                badge={`L${String(spell.level)}`}
                checked={chosen.replaceFrom === spell.spellId}
                disabled={false}
                onChange={(next) => set({ replaceFrom: next ? spell.spellId : undefined })}
              />
            ))}
          </div>
          <p className="text-caption leading-body text-muted-foreground">Learn instead</p>
          <div className="flex flex-col">
            {matching(levelled).map((option) => (
              <Pick
                key={option.spellId}
                label={`Learn ${option.name} instead`}
                badge={`L${String(option.level)}`}
                checked={chosen.replaceTo === option.spellId}
                disabled={false}
                onChange={(next) => set({ replaceTo: next ? option.spellId : undefined })}
              />
            ))}
          </div>
        </Part>
      )}
    </>
  );
}

function ReviewStep({
  offer,
  owned,
  draft,
  change,
  review,
}: {
  readonly offer: LevelUpOffer;
  readonly owned: OwnedCharacter;
  readonly draft: LevelUpDraft;
  readonly change: (patch: Partial<LevelUpDraft>) => void;
  readonly review: ReturnType<typeof levelUpReview> | undefined;
}) {
  if (review === undefined) return null;
  if (Result.isFailure(review)) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger bg-surface-sunken px-3 py-2 text-caption leading-body text-danger"
      >
        {review.failure.join(" ")} Go back and change it.
      </div>
    );
  }
  const chosen = review.success;
  const gain = hitPointGainFor(offer, draft.hitPoints, chosen.constitution);
  const max = owned.character.hpMax;
  const subclass = chosenSubclass(offer, draft);
  const features = [
    ...offer.automatic.features.map((feature) => feature.name),
    ...(subclass?.features.map((feature) => feature.name) ?? []),
  ];
  const lines = choiceLines(chosen.choices);
  return (
    <>
      <div className="flex flex-col">
        <Moves label="Level" from={String(offer.fromLevel)} to={String(offer.toLevel)} />
        {gain !== undefined &&
          (gain.least === gain.most ? (
            <Moves
              label={`Hit points, ${signed(gain.least)}`}
              from={max === null ? undefined : String(max)}
              to={max === null ? signed(gain.least) : String(max + gain.least)}
            />
          ) : (
            <Moves
              label="Hit points, rolled at the confirm"
              from={undefined}
              to={`${signed(gain.least)} to ${signed(gain.most)}`}
            />
          ))}
      </div>
      {features.length > 0 && (
        <Part label="New features">
          <p className="text-body-s leading-body text-foreground">{features.join(", ")}</p>
        </Part>
      )}
      {lines.length > 0 && (
        <Part label="Your choices">
          <ul className="flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line} className="text-body-s leading-body text-foreground">
                {line}
              </li>
            ))}
          </ul>
        </Part>
      )}
      <Field label="Note" htmlFor="level-up-note" hint="Kept on the Log beside this level.">
        <Textarea
          id="level-up-note"
          className="min-h-16"
          maxLength={LEVEL_UP_NOTE_MAX}
          placeholder="After the bridge at Harrow's Ford."
          value={draft.note}
          onChange={(event) => change({ note: event.target.value })}
        />
      </Field>
    </>
  );
}
