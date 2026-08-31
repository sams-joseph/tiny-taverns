import type { Ability, Creature, CreatureFeature, CreatureProficiency, Trait } from "@taverns/api";

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
 */

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

function AbilityCell({ ability }: { readonly ability: Ability }) {
  return (
    <div className="flex-1 rounded-sm border border-hairline bg-surface-sunken py-1.5 text-center">
      <div className="text-micro leading-body font-medium tracking-caps text-on-dark-muted">
        {ability.label}
      </div>
      <div className="font-mono text-mono-l leading-snug font-medium text-on-dark">
        {ability.score}
      </div>
      <div className="font-mono text-micro leading-none text-accent-ink">{ability.modifier}</div>
    </div>
  );
}

function TraitBlock({ trait }: { readonly trait: Trait }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{trait.name}</span>
        {/* The dice notation, shown and not rolled. There is no dice tray here:
            rolling is local-only, has no endpoint behind it, and is not part of
            what either screen was asked for — so the notation is rendered as
            what it is, a thing the DM reads. */}
        {trait.dice !== undefined && trait.dice !== "" && (
          <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-accent-ink">
            {trait.dice}
          </span>
        )}
      </div>
      <p className="text-caption leading-body text-on-dark-muted">{trait.text}</p>
    </div>
  );
}

const attackDetail = (feature: CreatureFeature): string | undefined => {
  const pieces: Array<string> = [];
  if (feature.attackBonus !== undefined)
    pieces.push(`${feature.attackBonus >= 0 ? "+" : ""}${String(feature.attackBonus)} to hit`);
  if (feature.damage !== undefined) {
    pieces.push(
      ...feature.damage.flatMap((damage) =>
        damage.damageDice === undefined
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

function FeatureBlock({ feature }: { readonly feature: CreatureFeature }) {
  const detail = attackDetail(feature);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{feature.name}</span>
        {detail !== undefined && (
          <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-accent-ink">
            {detail}
          </span>
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
}: {
  readonly title: string;
  readonly features: ReadonlyArray<CreatureFeature> | undefined;
}) {
  if (features === undefined || features.length === 0) return null;
  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
      <h3 className="text-label leading-body font-semibold tracking-caps text-heading">{title}</h3>
      {features.map((feature) => (
        <FeatureBlock key={feature.name} feature={feature} />
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
}: {
  readonly creature: Creature;
  /** What to say when nothing has been written. Each screen knows its own why. */
  readonly emptyNote: string;
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
            <AbilityCell key={ability.label} ability={ability} />
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
            <TraitBlock key={trait.name} trait={trait} />
          ))}
        </div>
      )}

      <FeatureSection title="Special abilities" features={block.specialAbilities} />
      <FeatureSection title="Actions" features={block.actions} />
      <FeatureSection title="Bonus actions" features={block.bonusActions} />
      <FeatureSection title="Reactions" features={block.reactions} />
      <FeatureSection title="Legendary actions" features={block.legendaryActions} />

      {block.abilities.length === 0 && !hasFeatures && block.meta === "" && (
        <p className="text-caption leading-body text-muted-foreground">{emptyNote}</p>
      )}
    </div>
  );
}
