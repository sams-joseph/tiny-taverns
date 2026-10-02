import {
  type AbilityKey,
  type AdvancementChoices,
  averageHitDie,
  type CharacterAdvancement,
  DEFAULT_HIT_POINT_METHOD,
  type FeatId,
  type LevelUp,
  type LevelUpChoice,
  type LevelUpChosen,
  levelUpChosen,
  levelUpHitPointGain,
  type LevelUpHitPointMethod,
  type LevelUpOffer,
  type LevelUpPayload,
  type LevelUpPick,
  type SeatLevelUp,
  type SheetBody,
  type SpellId,
  type SubclassId,
} from "@taverns/api";
import type { DateTime, Result } from "effect";

/**
 * **The level-up wizard's half that is not drawing**: which steps an offer
 * asks for, what the owner has chosen so far, and the payload that sends it.
 *
 * The offer is the server's (`GET /me/characters/:id/level-up`), and nothing
 * here works an option out for itself: the steps are the parts the offer
 * carries, and the review holds the payload to the offer with
 * `levelUpChosen` — the same rule the write runs — so the wizard cannot
 * offer a confirm the server would refuse for a reason it could have known.
 */

/** Where an ASI's two points go: both on one score, one each on two, or a feat instead. */
export type AsiMode = "one" | "two" | "feat";

export interface LevelUpDraft {
  readonly hitPoints: LevelUpHitPointMethod;
  /** One of the offer's subclasses. */
  readonly subclassId: SubclassId | undefined;
  /** A subclass named by hand, used when none of the offer's is chosen. It grants nothing. */
  readonly subclassName: string;
  /** Each choice's answers, by {@link choiceKey}: feature ids, or the words the choice lists. */
  readonly picks: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly asi: {
    readonly mode: AsiMode;
    readonly abilities: ReadonlyArray<AbilityKey>;
    readonly featId: FeatId | undefined;
  };
  readonly spells: {
    readonly cantrips: ReadonlyArray<SpellId>;
    readonly learned: ReadonlyArray<SpellId>;
    readonly replaceFrom: SpellId | undefined;
    readonly replaceTo: SpellId | undefined;
    readonly magicalSecrets: ReadonlyArray<SpellId>;
    readonly mysticArcanum: SpellId | undefined;
  };
  readonly note: string;
}

export const emptyLevelUpDraft: LevelUpDraft = {
  hitPoints: DEFAULT_HIT_POINT_METHOD,
  subclassId: undefined,
  subclassName: "",
  picks: {},
  asi: { mode: "one", abilities: [], featId: undefined },
  spells: {
    cantrips: [],
    learned: [],
    replaceFrom: undefined,
    replaceTo: undefined,
    magicalSecrets: [],
    mysticArcanum: undefined,
  },
  note: "",
};

/** A choice's place in the draft: its kind and the feature that offers it, as the server pairs them. */
export const choiceKey = (choice: LevelUpChoice): string =>
  `${choice.kind}:${choice.offeredBy.featureId}`;

/** The subclass option the draft has taken, if it took one of the offer's. */
export const chosenSubclass = (offer: LevelUpOffer, draft: LevelUpDraft) =>
  draft.subclassId === undefined
    ? undefined
    : offer.subclass?.options.find((option) => option.subclassId === draft.subclassId);

/** Every choice the draft must answer: the level's own, then the chosen subclass's. */
export const choicesFor = (
  offer: LevelUpOffer,
  draft: LevelUpDraft,
): ReadonlyArray<LevelUpChoice> => [
  ...offer.choices,
  ...(chosenSubclass(offer, draft)?.choices ?? []),
];

/** Whether the offer's spells leave anything to pick, rather than only a number to read. */
export const spellsToPick = (offer: LevelUpOffer): boolean => {
  const spells = offer.spells;
  if (spells === undefined) return false;
  return (
    spells.cantrips > 0 ||
    spells.spells > 0 ||
    (spells.replace && spells.options.some((option) => option.level > 0)) ||
    (spells.magicalSecrets !== undefined && spells.magicalSecrets.count > 0) ||
    spells.mysticArcanum !== undefined
  );
};

export type LevelUpStep =
  | { readonly id: "automatic" }
  | { readonly id: "hitPoints" }
  | { readonly id: "subclass" }
  | { readonly id: "choice"; readonly choice: LevelUpChoice }
  | { readonly id: "asi" }
  | { readonly id: "spells" }
  | { readonly id: "review" };

/**
 * The steps this offer asks for, in the wizard's order: what changes on its
 * own, the hit points, the subclass, one step per choice (the chosen
 * subclass's after the level's own), the ASI, the spells, and the review.
 * Only the parts the offer carries are steps.
 */
export const levelUpSteps = (
  offer: LevelUpOffer,
  draft: LevelUpDraft,
): ReadonlyArray<LevelUpStep> => [
  { id: "automatic" },
  ...(offer.hitPoints === undefined ? [] : [{ id: "hitPoints" } as const]),
  ...(offer.subclass === undefined ? [] : [{ id: "subclass" } as const]),
  ...choicesFor(offer, draft).map((choice) => ({ id: "choice", choice }) as const),
  ...(offer.abilityScoreImprovement === undefined ? [] : [{ id: "asi" } as const]),
  ...(spellsToPick(offer) ? [{ id: "spells" } as const] : []),
  { id: "review" },
];

/** A step's own name, for its heading and the progress line. */
export const stepTitle = (step: LevelUpStep): string => {
  switch (step.id) {
    case "automatic":
      return "What changes";
    case "hitPoints":
      return "Hit points";
    case "subclass":
      return "Subclass";
    case "choice":
      return step.choice.offeredBy.name;
    case "asi":
      return "Ability Score Improvement";
    case "spells":
      return "Spells";
    case "review":
      return "Review";
  }
};

const scoreOf = (body: SheetBody, ability: AbilityKey): number | undefined => {
  const cell = body.abilities.find((entry) => entry.label.trim().toUpperCase() === ability);
  const score = Number(cell?.score.trim());
  return cell === undefined || !Number.isInteger(score) ? undefined : score;
};

/**
 * What one score would become under the draft's ASI mode, or `undefined` when
 * the sheet states no score for it or the raise would pass the maximum.
 */
export const raisedScore = (
  offer: LevelUpOffer,
  body: SheetBody,
  ability: AbilityKey,
  mode: AsiMode,
): number | undefined => {
  const asi = offer.abilityScoreImprovement;
  const score = scoreOf(body, ability);
  if (asi === undefined || score === undefined || mode === "feat") return undefined;
  const raised = score + (mode === "one" ? asi.points : 1);
  return raised > asi.maximum ? undefined : raised;
};

/**
 * Whether a step is answered enough to go on from. Spells never hold the
 * wizard up — any left unpicked can be learned later in the spell picker —
 * and the review's own rule is `levelUpChosen`.
 */
export const stepReady = (
  offer: LevelUpOffer,
  body: SheetBody,
  draft: LevelUpDraft,
  step: LevelUpStep,
): boolean => {
  switch (step.id) {
    case "subclass":
      return (
        draft.subclassId !== undefined ||
        draft.subclassName.trim() !== "" ||
        offer.subclass?.current !== undefined
      );
    case "choice":
      return (draft.picks[choiceKey(step.choice)] ?? []).length === step.choice.choose;
    case "asi": {
      const { mode, abilities, featId } = draft.asi;
      if (mode === "feat") return featId !== undefined;
      return (
        abilities.length === (mode === "one" ? 1 : 2) &&
        abilities.every((ability) => raisedScore(offer, body, ability, mode) !== undefined)
      );
    }
    default:
      return true;
  }
};

/**
 * The payload the confirm sends: the offer's version and level, the hit
 * point method, and every answer the draft holds for a part the offer asks
 * for. Answers to a choice the draft no longer faces (a subclass changed
 * after its choices were picked) are left behind, and optional parts nobody
 * filled are omitted rather than sent empty.
 */
export const levelUpPayloadFor = (offer: LevelUpOffer, draft: LevelUpDraft): LevelUpPayload => {
  const picks = choicesFor(offer, draft).flatMap((choice): ReadonlyArray<LevelUpPick> => {
    const answers = draft.picks[choiceKey(choice)] ?? [];
    const offeredBy = choice.offeredBy.featureId;
    return choice.kind === "feature"
      ? answers.flatMap((answer) => {
          const option = choice.options.find((entry) => entry.featureId === answer);
          return option === undefined ? [] : [{ offeredBy, featureId: option.featureId }];
        })
      : answers.map((value) => ({ offeredBy, value }));
  });

  const named = draft.subclassName.trim();
  const subclass =
    offer.subclass === undefined
      ? undefined
      : draft.subclassId !== undefined
        ? { subclassId: draft.subclassId }
        : named !== ""
          ? { name: named }
          : undefined;

  const asi = offer.abilityScoreImprovement;
  const abilityScoreImprovement =
    asi === undefined
      ? undefined
      : draft.asi.mode === "feat"
        ? draft.asi.featId === undefined
          ? undefined
          : { featId: draft.asi.featId }
        : {
            increases: draft.asi.abilities.map((ability) => ({
              ability,
              amount: draft.asi.mode === "one" ? asi.points : 1,
            })),
          };

  const offered = offer.spells;
  const chosen = draft.spells;
  const replace =
    offered?.replace === true && chosen.replaceFrom !== undefined && chosen.replaceTo !== undefined
      ? { from: chosen.replaceFrom, to: chosen.replaceTo }
      : undefined;
  const spellParts =
    offered === undefined
      ? {}
      : {
          ...(chosen.cantrips.length === 0 ? {} : { cantrips: chosen.cantrips }),
          ...(chosen.learned.length === 0 ? {} : { learned: chosen.learned }),
          ...(replace === undefined ? {} : { replace }),
          ...(offered.magicalSecrets === undefined || chosen.magicalSecrets.length === 0
            ? {}
            : { magicalSecrets: chosen.magicalSecrets }),
          ...(offered.mysticArcanum === undefined || chosen.mysticArcanum === undefined
            ? {}
            : { mysticArcanum: chosen.mysticArcanum }),
        };
  const note = draft.note.trim();

  return {
    expectedVersion: offer.version,
    toLevel: offer.toLevel,
    hitPoints: draft.hitPoints,
    ...(subclass === undefined ? {} : { subclass }),
    ...(abilityScoreImprovement === undefined ? {} : { abilityScoreImprovement }),
    ...(picks.length === 0 ? {} : { picks }),
    ...(Object.keys(spellParts).length === 0 ? {} : { spells: spellParts }),
    ...(note === "" ? {} : { note }),
  };
};

/** The review: the payload held to the offer by the rule the write runs. */
export const levelUpReview = (
  offer: LevelUpOffer,
  body: SheetBody,
  draft: LevelUpDraft,
): Result.Result<LevelUpChosen<SheetBody>, ReadonlyArray<string>> =>
  levelUpChosen(offer, body, levelUpPayloadFor(offer, draft));

/**
 * What the level adds to the hit point maximum, as the review states it:
 * exactly, when fixed; as the roll's range, when rolled. A CON modifier the
 * ASI moved counts for every level, as the write counts it.
 */
export const hitPointGainFor = (
  offer: LevelUpOffer,
  method: LevelUpHitPointMethod,
  constitution: { readonly from: number; readonly to: number },
): { readonly least: number; readonly most: number } | undefined => {
  const hitPoints = offer.hitPoints;
  if (hitPoints === undefined) return undefined;
  const gain = (die: number) => levelUpHitPointGain(hitPoints, die, constitution, offer.toLevel);
  return method === "fixed"
    ? { least: gain(averageHitDie(hitPoints.die)), most: gain(averageHitDie(hitPoints.die)) }
    : { least: gain(1), most: gain(hitPoints.die) };
};

/** `"+2"`, `"-1"`, `"+0"`. */
export const signed = (value: number): string => (value < 0 ? String(value) : `+${String(value)}`);

/** `"Favored Enemy (2 types)"` → `"Favored Enemy"`. */
const bareName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;

/**
 * What a recorded level-up chose, one line each, in the record's own words:
 * the subclass, the scores or the feat, every pick, the spells. The same
 * lines the review draws before the confirm.
 */
export const choiceLines = (choices: AdvancementChoices): ReadonlyArray<string> => {
  const spells = (kind: AdvancementChoices["spells"][number]["kind"]) =>
    choices.spells.filter((spell) => spell.kind === kind).map((spell) => spell.name);
  const listed = (label: string, names: ReadonlyArray<string>) =>
    names.length === 0 ? [] : [`${label}: ${names.join(", ")}`];
  return [
    ...(choices.subclass === undefined ? [] : [`Subclass: ${choices.subclass.name}`]),
    ...(choices.abilityScores ?? []).map(
      (score) => `${score.ability} ${String(score.from)} → ${String(score.to)}`,
    ),
    ...(choices.feat === undefined ? [] : [`Feat: ${choices.feat.name}`]),
    ...choices.picks.map((pick) =>
      pick.kind === "feature"
        ? pick.name
        : pick.kind === "expertise"
          ? `Expertise: ${pick.name}`
          : `${bareName(pick.offeredBy.name)}: ${pick.name}`,
    ),
    ...listed("Cantrips", spells("cantrip")),
    ...listed("Learned", spells("learned")),
    ...listed("Magical Secrets", spells("magicalSecrets")),
    ...listed("Mystic Arcanum", spells("mysticArcanum")),
    ...(choices.replaced === undefined
      ? []
      : [`Swapped ${choices.replaced.from.name} for ${choices.replaced.to.name}`]),
  ];
};

/** One entry of the sheet's Log: a level-up record, or a line written before records existed. */
export interface LogEntry {
  readonly level: number;
  readonly className: string | undefined;
  /** How the hit points were gained, when the entry knows. */
  readonly hitPoints: string | undefined;
  readonly lines: ReadonlyArray<string>;
  readonly note: string | undefined;
  readonly session: number | undefined;
  readonly at: DateTime.Utc | undefined;
  /** A record, which an undo can take back; a legacy line has nothing to reverse. */
  readonly recorded: boolean;
}

/** A level-up record as its owner reads it: the hit points, and every choice in the record's words. */
export const recordEntry = (record: CharacterAdvancement): LogEntry => ({
  level: record.level,
  className: record.className,
  hitPoints:
    record.hitPoints.method === "fixed"
      ? `${signed(record.hitPoints.gain)} hit points, fixed`
      : `${signed(record.hitPoints.gain)} hit points, rolled ${String(record.hitPoints.die)}`,
  lines: choiceLines(record.choices),
  note: record.note ?? undefined,
  session: undefined,
  at: record.createdAt,
  recorded: true,
});

/**
 * A level-up as the table reads it on the seat (`SeatLevelUp`): the subclass,
 * the feat and the picks by name, and no hit points.
 */
export const seatEntry = (levelUp: SeatLevelUp): LogEntry => ({
  level: levelUp.level,
  className: levelUp.className,
  hitPoints: undefined,
  lines: [
    ...(levelUp.subclass === null ? [] : [`Subclass: ${levelUp.subclass}`]),
    ...(levelUp.feat === null ? [] : [`Feat: ${levelUp.feat}`]),
    ...levelUp.picks,
  ],
  note: levelUp.note ?? undefined,
  session: undefined,
  at: levelUp.createdAt,
  recorded: true,
});

/**
 * The Log, latest first: the level-up records, and any line the document's
 * own `levelUps` holds for a level no record covers (written before the
 * records existed; nothing writes them now).
 */
export const logEntries = (
  records: ReadonlyArray<LogEntry>,
  legacy: ReadonlyArray<LevelUp> | undefined,
): ReadonlyArray<LogEntry> => {
  const recorded = new Set(records.map((record) => record.level));
  return [
    ...records,
    ...(legacy ?? [])
      .filter((entry) => !recorded.has(entry.level))
      .map((entry): LogEntry => ({
        level: entry.level,
        className: undefined,
        hitPoints: undefined,
        lines: [],
        note: entry.note,
        session: entry.session,
        at: undefined,
        recorded: false,
      })),
  ].sort((left, right) => right.level - left.level);
};
