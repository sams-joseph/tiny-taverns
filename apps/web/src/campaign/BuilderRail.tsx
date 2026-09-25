import {
  type CampaignId,
  type Creature,
  type CreatureId,
  type DifficultyBand,
  describeParty,
} from "@taverns/api";
import { Card, Icon, SectionHeading } from "@taverns/ui";
import { CreaturePicker } from "./CreaturePicker";
import { DifficultyMeter } from "./DifficultyMeter";
import { draftDifficulty, type RosterLine } from "./encounterDraft";
import { BAND_TEXT } from "./encounterList";

/**
 * The encounter builder's rail (`EncounterBuilderScreen.tsx`): for a fight or a
 * conversation, the live difficulty over the draft's roster and the bestiary
 * the roster is added from; for a skill challenge or a hazard, what a DC means.
 *
 * **Only the difficulty card is sticky**, pinned under the chrome while the rail
 * stands beside the form, so the band stays in view while the DM writes the
 * tactics further down. The bestiary under it scrolls with the page, under the
 * card, which is why the card is opaque and on the layering scale's `chrome`.
 * Stacked in one column it is not pinned: on a phone it would cover half the
 * screen the roster and the bestiary need.
 */
export function BuilderRail({
  campaignId,
  takesChallenge,
  roster,
  partyLevels,
  onPick,
}: {
  readonly campaignId: CampaignId;
  /** A skill challenge or a hazard: rated by its DC, not by XP. */
  readonly takesChallenge: boolean;
  readonly roster: ReadonlyArray<RosterLine>;
  /** Every seated character's level, as `party.list` answers it. */
  readonly partyLevels: ReadonlyArray<number | null>;
  readonly onPick: (creature: Creature) => void;
}) {
  if (takesChallenge) return <DcGuide />;
  const counts = new Map<CreatureId, number>(
    roster.map((line) => [line.creatureId, line.count] as const),
  );
  return (
    <>
      <DifficultyCard roster={roster} partyLevels={partyLevels} />
      <CreaturePicker campaignId={campaignId} counts={counts} onPick={onPick} />
    </>
  );
}

/** The band's colour for the card's top edge and its tier's outline. */
const BAND_EDGE: Readonly<Record<DifficultyBand, string>> = {
  Trivial: "border-t-strong",
  Easy: "border-t-success-ink",
  Medium: "border-t-info-ink",
  Hard: "border-t-accent-ink",
  Deadly: "border-t-danger-ink",
};

const TIERS = [
  ["Easy", "easy", "border-success-ink"],
  ["Medium", "medium", "border-info-ink"],
  ["Hard", "hard", "border-accent-ink"],
  ["Deadly", "deadly", "border-danger-ink"],
] as const;

/**
 * How hard the fight being written is, as it is written: the drawing's live
 * difficulty card, over the same rule and the same seats the server rates the
 * saved encounter with (`draftDifficulty`), so what the card says before a save
 * is what the list says after it.
 *
 * **Nothing on it is the drawing's constant party.** The tiers are this table's
 * summed thresholds, the caption names the party they were summed over, and
 * with nobody levelled there are no tiers at all — the reason, in words.
 */
function DifficultyCard({
  roster,
  partyLevels,
}: {
  readonly roster: ReadonlyArray<RosterLine>;
  readonly partyLevels: ReadonlyArray<number | null>;
}) {
  const { difficulty, party, hint, breakdown } = draftDifficulty(roster, partyLevels);
  const band = difficulty._tag === "rated" ? difficulty.band : undefined;
  return (
    <Card
      role="region"
      aria-label="Difficulty"
      data-slot="builder-difficulty"
      className={`z-chrome min-w-0 gap-3.5 border-t-3 px-5 py-4.5 @4xl:sticky @4xl:top-(--chrome-height) ${
        band === undefined ? "border-t-strong" : BAND_EDGE[band]
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span
          data-slot="difficulty-band"
          className={`font-display text-display-s leading-none font-semibold tracking-display ${
            band === undefined ? "text-muted-foreground" : BAND_TEXT[band]
          }`}
        >
          {band ?? "Unrated"}
        </span>
        {difficulty._tag === "rated" && (
          <span className="ml-auto font-mono text-mono leading-none font-medium text-muted-foreground">
            {difficulty.adjustedXp.toLocaleString("en")} adj. XP
          </span>
        )}
      </div>

      {difficulty._tag === "rated" && <DifficultyMeter difficulty={difficulty} />}

      {party !== undefined && (
        <ul
          aria-label="Thresholds"
          className="m-0 grid list-none grid-cols-4 gap-1.5 p-0"
          data-slot="difficulty-tiers"
        >
          {TIERS.map(([label, key, edge]) => {
            const on = band === label;
            return (
              <li
                key={key}
                aria-current={on ? "true" : undefined}
                className={`flex min-w-0 flex-col gap-1.5 rounded-sm border p-2 ${
                  on ? `${edge} bg-surface-raised` : "border-hairline"
                }`}
              >
                <span
                  className={`truncate text-caption leading-none font-medium ${
                    on ? BAND_TEXT[label] : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
                <span className="truncate font-mono text-caption leading-none font-medium text-muted-foreground">
                  {party.thresholds[key].toLocaleString("en")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p
        data-slot="difficulty-hint"
        className="mb-0 text-body-s leading-body text-pretty text-foreground"
      >
        {hint}
      </p>

      {(breakdown !== undefined || party !== undefined) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-hairline pt-3 font-mono text-caption leading-snug font-medium text-muted-foreground">
          {breakdown?.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {party !== undefined && <span>{describeParty(party.counted)}</span>}
        </div>
      )}
    </Card>
  );
}

/**
 * The SRD's *Typical Difficulty Classes* table (Using Ability Scores), for a
 * skill challenge or a hazard.
 *
 * The drawing's card rates its DCs "for a level 5 party"; no rule says that, and
 * a DC in 5e is set by the task, not the party, so the card is the SRD's table
 * as the SRD words it, with no claim about who is rolling.
 */
const TYPICAL_DCS = [
  [5, "Very easy"],
  [10, "Easy"],
  [15, "Medium"],
  [20, "Hard"],
  [25, "Very hard"],
  [30, "Nearly impossible"],
] as const;

function DcGuide() {
  return (
    <Card
      role="region"
      aria-labelledby="dc-guide-heading"
      data-slot="builder-dc-guide"
      className="min-w-0 gap-2.5 px-5 py-4.5"
    >
      <div className="flex items-center gap-2">
        <Icon name="book-open" size={15} className="shrink-0 text-info-ink" />
        <SectionHeading id="dc-guide-heading" size="title">
          Setting the DC
        </SectionHeading>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {TYPICAL_DCS.map(([dc, task]) => (
          <div key={dc} className="contents">
            <dt className="font-mono text-mono leading-snug font-medium text-muted-foreground">
              {dc}
            </dt>
            <dd className="m-0 text-body-s leading-snug text-foreground">{task}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-0 text-caption leading-body text-muted-foreground">
        The SRD&rsquo;s typical DCs, by how hard the task is.
      </p>
    </Card>
  );
}
