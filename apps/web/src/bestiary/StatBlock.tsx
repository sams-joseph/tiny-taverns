import { Button, SectionHeading } from "@taverns/ui";
import type { Ability, Creature, CreatureFeature, CreatureProficiency, Trait } from "@taverns/api";
import { notationForD20, parseDiceExpression, signed } from "../characters/rolls";

/**
 * A creature's stat block, written once and read by two screens.
 *
 * `ui_kits/dm-screen/StatBlock.jsx` is the specification. It lived inside
 * `run/CombatantPanel.tsx` while the runner was the only thing that showed one;
 * the bestiary shows the same block for the same rows, so it moved here rather
 * than being drawn a second time.
 *
 * **The document and the columns are both real, and this is where that shows.**
 * `Creature.statBlock` is the half a DM reads — `"17 (chain shirt, shield)"`,
 * `"21 (6d6)"`, `"1 (200 XP)"` — and `creature.ac` / `.hp` / `.cr` are the half
 * that filters and sorts. Neither derives from the other, so the lines below
 * prefer the document and fall back to the column when the document has nothing
 * written: a creature typed in a hurry still shows its numbers, and one with a
 * document keeps its parentheticals.
 *
 * The prototype's read-aloud paragraph is deliberately absent. Read-aloud is a
 * `note` with an attachment, and a note cannot attach to a creature yet
 * (`AGENTS.md`, the bestiary section) — prose invented here would be a third
 * place it lives.
 *
 * **The runner rolls from it; the bestiary reads it.** Given `onRoll`, an
 * ability score rolls its check, an attack bonus its d20 and a damage or trait
 * dice line its dice, each only when the notation parses
 * (`characters/rolls.ts`); anything else stays the chip it is in the bestiary.
 * The roll itself is the caller's — the runner's is local and never sent.
 */

/** Roll a notation under a label local to the block ("DEX", "Scimitar damage"). */
export type StatBlockRoll = (label: string, notation: string) => void;

/** A notation as a small outline button that rolls it. */
function RollButton({
  label,
  notation,
  text,
  onRoll,
}: {
  readonly label: string;
  readonly notation: string;
  readonly text: string;
  readonly onRoll: StatBlockRoll;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="font-mono"
      aria-label={`Roll ${label}, ${notation}`}
      onClick={() => onRoll(label, notation)}
    >
      {text}
    </Button>
  );
}

export function StatLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="min-w-14 text-label-s leading-body font-medium text-on-dark-muted">
        {label}
      </span>
      <span className="font-mono text-mono leading-snug font-medium text-on-dark">{value}</span>
    </div>
  );
}

function AbilityCell({
  ability,
  onRoll,
}: {
  readonly ability: Ability;
  readonly onRoll: StatBlockRoll | undefined;
}) {
  const cell = (
    <>
      <div className="text-micro leading-body font-medium tracking-caps text-on-dark-muted">
        {ability.label}
      </div>
      <div className="font-mono text-mono-l leading-snug font-medium text-on-dark">
        {ability.score}
      </div>
      <div className="font-mono text-micro leading-none text-accent-ink">{ability.modifier}</div>
    </>
  );
  const box = "flex-1 rounded-sm border border-hairline bg-surface-sunken py-1.5 text-center";
  const notation = notationForD20(ability.modifier);
  if (onRoll === undefined || notation === undefined) return <div className={box}>{cell}</div>;
  return (
    <button
      type="button"
      aria-label={`Roll ${ability.label} check, ${notation}`}
      onClick={() => onRoll(ability.label, notation)}
      className={`${box} cursor-pointer transition-control outline-none hover:border-strong focus-visible:ring-focus`}
    >
      {cell}
    </button>
  );
}

/** The notation, as a button when it rolls and as the read-only chip otherwise. */
const rollable = (onRoll: StatBlockRoll | undefined, dice: string): string | undefined =>
  onRoll === undefined ? undefined : parseDiceExpression(dice)?.notation;

function TraitBlock({
  trait,
  onRoll,
}: {
  readonly trait: Trait;
  readonly onRoll: StatBlockRoll | undefined;
}) {
  const dice = trait.dice ?? "";
  const notation = rollable(onRoll, dice);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{trait.name}</span>
        {onRoll !== undefined && notation !== undefined ? (
          <span className="ml-auto">
            <RollButton label={trait.name} notation={notation} text={dice} onRoll={onRoll} />
          </span>
        ) : (
          dice !== "" && (
            <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-accent-ink">
              {dice}
            </span>
          )
        )}
      </div>
      <p className="text-caption leading-body text-on-dark-muted">{trait.text}</p>
    </div>
  );
}

/**
 * The feature's numbers as one read-only line. `rolled` names the damage dice
 * a caller draws as buttons instead, and with it the attack bonus goes too.
 */
const attackDetail = (
  feature: CreatureFeature,
  rolled?: (damageDice: string) => boolean,
): string | undefined => {
  const pieces: Array<string> = [];
  if (feature.attackBonus !== undefined && rolled === undefined)
    pieces.push(`${feature.attackBonus >= 0 ? "+" : ""}${String(feature.attackBonus)} to hit`);
  if (feature.damage !== undefined) {
    pieces.push(
      ...feature.damage.flatMap((damage) =>
        damage.damageDice === undefined || rolled?.(damage.damageDice) === true
          ? []
          : [
              `${damage.damageDice}${damage.damageType === undefined ? "" : ` ${damage.damageType.name.toLowerCase()}`}`,
            ],
      ),
    );
  }
  if (feature.dc !== undefined) {
    pieces.push(
      `DC ${String(feature.dc.dcValue)} ${feature.dc.dcType.name}${feature.dc.successType === "none" ? "" : ` (${feature.dc.successType})`}`,
    );
  }
  return pieces.length === 0 ? undefined : pieces.join(" · ");
};

/** An attack's to-hit and damage as roll buttons, and whatever is left as the chip. */
function FeatureRolls({
  feature,
  onRoll,
}: {
  readonly feature: CreatureFeature;
  readonly onRoll: StatBlockRoll;
}) {
  const damage = (feature.damage ?? []).flatMap((entry) => {
    const notation =
      entry.damageDice === undefined ? undefined : rollable(onRoll, entry.damageDice);
    return notation === undefined || entry.damageDice === undefined
      ? []
      : [
          {
            notation,
            text: `${entry.damageDice}${entry.damageType === undefined ? "" : ` ${entry.damageType.name.toLowerCase()}`}`,
          },
        ];
  });
  const rest = attackDetail(feature, (dice) => rollable(onRoll, dice) !== undefined);
  return (
    <>
      {rest !== undefined && (
        <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-accent-ink">
          {rest}
        </span>
      )}
      <span className="ml-auto flex gap-1.5">
        {feature.attackBonus !== undefined && (
          <RollButton
            label={feature.name}
            notation={`1d20${signed(feature.attackBonus)}`}
            text={signed(feature.attackBonus)}
            onRoll={onRoll}
          />
        )}
        {damage.map((entry) => (
          <RollButton
            key={entry.notation}
            label={`${feature.name} damage`}
            notation={entry.notation}
            text={entry.text}
            onRoll={onRoll}
          />
        ))}
      </span>
    </>
  );
}

function FeatureBlock({
  feature,
  onRoll,
}: {
  readonly feature: CreatureFeature;
  readonly onRoll: StatBlockRoll | undefined;
}) {
  const detail = attackDetail(feature);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{feature.name}</span>
        {onRoll !== undefined ? (
          <FeatureRolls feature={feature} onRoll={onRoll} />
        ) : (
          detail !== undefined && (
            <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-accent-ink">
              {detail}
            </span>
          )
        )}
      </div>
      <p className="whitespace-pre-line text-caption leading-body text-on-dark-muted">
        {feature.desc}
      </p>
    </div>
  );
}

function FeatureSection({
  title,
  features,
  onRoll,
}: {
  readonly title: string;
  readonly features: ReadonlyArray<CreatureFeature> | undefined;
  readonly onRoll: StatBlockRoll | undefined;
}) {
  if (features === undefined || features.length === 0) return null;
  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
      <SectionHeading as="h3" size="label">
        {title}
      </SectionHeading>
      {features.map((feature) => (
        <FeatureBlock key={feature.name} feature={feature} onRoll={onRoll} />
      ))}
    </div>
  );
}

function ProficiencyList({
  proficiencies,
}: {
  readonly proficiencies: ReadonlyArray<CreatureProficiency> | undefined;
}) {
  if (proficiencies === undefined || proficiencies.length === 0) return null;
  return (
    <StatLine
      label="PROF"
      value={proficiencies
        .map(
          (entry) =>
            `${entry.proficiency.name} ${entry.value >= 0 ? "+" : ""}${String(entry.value)}`,
        )
        .join(", ")}
    />
  );
}

export function StatBlockBody({
  creature,
  emptyNote,
  onRoll,
}: {
  readonly creature: Creature;
  /** What to say when nothing has been written. Each screen knows its own why. */
  readonly emptyNote: string;
  /** The runner's: roll what the block writes. Absent, every notation is read-only. */
  readonly onRoll?: StatBlockRoll;
}) {
  const block = creature.statBlock;
  const lines: ReadonlyArray<readonly [string, string]> = [
    ["AC", block.ac === "" ? String(creature.ac) : block.ac],
    ["HP", block.hp === "" ? String(creature.hp) : block.hp],
    ["SPEED", block.speed],
    ["CR", block.cr === "" ? creature.cr : block.cr],
    ["LANG", block.languages ?? ""],
    [
      "SENSES",
      block.senses === undefined
        ? ""
        : Object.entries(block.senses)
            .map(([key, value]) => `${key.replaceAll("_", " ")} ${String(value)}`)
            .join(", "),
    ],
  ];
  const hasFeatures =
    block.traits.length > 0 ||
    (block.specialAbilities?.length ?? 0) > 0 ||
    (block.actions?.length ?? 0) > 0 ||
    (block.bonusActions?.length ?? 0) > 0 ||
    (block.reactions?.length ?? 0) > 0 ||
    (block.legendaryActions?.length ?? 0) > 0 ||
    (block.desc?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
      {block.meta !== "" && (
        <p className="font-serif text-body-s leading-body italic text-on-dark-muted">
          {block.meta}
        </p>
      )}

      <div className="flex flex-col gap-0.5">
        {lines
          .filter(([, value]) => value !== "")
          .map(([label, value]) => (
            <StatLine key={label} label={label} value={value} />
          ))}
      </div>

      {block.abilities.length > 0 && (
        <div className="flex gap-1">
          {block.abilities.map((ability) => (
            <AbilityCell key={ability.label} ability={ability} onRoll={onRoll} />
          ))}
        </div>
      )}

      <ProficiencyList proficiencies={block.proficiencies} />

      {block.desc !== undefined && block.desc.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          {block.desc.map((paragraph) => (
            <p
              key={paragraph}
              className="whitespace-pre-line text-caption leading-body text-on-dark-muted"
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {block.traits.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-hairline pt-4">
          {block.traits.map((trait) => (
            <TraitBlock key={trait.name} trait={trait} onRoll={onRoll} />
          ))}
        </div>
      )}

      <FeatureSection title="Special abilities" features={block.specialAbilities} onRoll={onRoll} />
      <FeatureSection title="Actions" features={block.actions} onRoll={onRoll} />
      <FeatureSection title="Bonus actions" features={block.bonusActions} onRoll={onRoll} />
      <FeatureSection title="Reactions" features={block.reactions} onRoll={onRoll} />
      <FeatureSection title="Legendary actions" features={block.legendaryActions} onRoll={onRoll} />

      {block.abilities.length === 0 && !hasFeatures && block.meta === "" && (
        <p className="text-caption leading-body text-muted-foreground">{emptyNote}</p>
      )}
    </div>
  );
}
