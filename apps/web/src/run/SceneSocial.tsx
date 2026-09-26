import type { Combatant, EncounterRunScene, SceneAttitude } from "@taverns/api";
import { SCENE_ATTITUDES } from "@taverns/api";
import { Button, Checkbox, cn, Icon, SectionHeading } from "@taverns/ui";

/**
 * A conversation: how the other side feels about the party, the beats the DM
 * means to hit, and the way it turns into a fight.
 *
 * **The attitude is the DM's own note and sets no DC** (the captain's call):
 * the SRD has no table from attitude to DC, so the drawing's "Checks DC 20" is
 * left out and each check carries the DC the DM calls for it (`MakeACheck`).
 * Pressing the chosen attitude again clears it. The drawing's heading names the
 * first creature on the roster as the NPC, which the record does not say; the
 * card is headed by what it holds instead. Its *What they want* card is one
 * fixed sentence rather than anything the encounter says, so it is absent.
 *
 * *Roll initiative* turns the scene into a fight — the same run, with the
 * combatants it already has — and there is no way back, deliberately: a fight
 * that calms down is a new conversation. The line beside it says so, as the
 * drawing's does.
 */

const ATTITUDE_TONE: Readonly<Record<SceneAttitude, string>> = {
  hostile: "border-danger text-danger",
  indifferent: "border-strong text-heading",
  friendly: "border-success text-success",
};

export function SceneSocial({
  scene,
  others,
  disabled,
  onAttitude,
  onBeat,
  onEscalate,
}: {
  readonly scene: EncounterRunScene;
  /** Everyone in the scene who is not the party: who joins initiative if it turns. */
  readonly others: ReadonlyArray<Combatant>;
  readonly disabled: boolean;
  readonly onAttitude: (attitude: SceneAttitude | null) => void;
  readonly onBeat: (index: number, done: boolean) => void;
  readonly onEscalate: () => void;
}) {
  const foes =
    others.length === 0
      ? "If it turns, it becomes a fight. Add who joins once it does."
      : `If it turns, ${others.map((other) => other.displayName).join(", ")} join initiative.`;

  return (
    <section
      aria-label="The conversation"
      className="flex flex-col gap-4 rounded-card border border-hairline bg-surface-card p-panel shadow-1"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <SectionHeading as="h2" size="title">
          Attitude
        </SectionHeading>
        <span className="text-body-s leading-snug text-muted-foreground">
          How they feel about the party right now
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Attitude">
        {SCENE_ATTITUDES.map(([value, label]) => {
          const on = scene.attitude === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onAttitude(on ? null : value)}
              className={cn(
                "min-h-control cursor-pointer rounded-control border px-3 py-2.5 text-left text-label font-semibold transition-control outline-none focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
                on
                  ? cn("bg-surface-raised", ATTITUDE_TONE[value])
                  : "border-hairline bg-transparent text-muted-foreground hover:bg-surface-raised",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {scene.beats.length > 0 && (
        <div className="flex flex-col border-t border-hairline pt-3.5">
          <span className="mb-1.5 text-label-s leading-none text-muted-foreground">
            Beats to hit
          </span>
          <ul aria-label="Beats to hit" className="flex flex-col">
            {scene.beats.map((beat, index) => (
              // The beats are the prep's lines copied in order, and a line can
              // repeat; its place is what the write names, so it is the key.
              <li key={index}>
                <label className="flex cursor-pointer items-start gap-2.5 py-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={beat.done}
                    disabled={disabled}
                    onCheckedChange={(checked) => onBeat(index, checked)}
                  />
                  <span
                    className={cn(
                      "text-body leading-body text-pretty",
                      beat.done ? "text-faint line-through" : "text-foreground",
                    )}
                  >
                    {beat.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-control border border-hairline bg-surface-sunken px-3.5 py-3">
        <Icon name="swords" size={15} className="shrink-0 text-danger" />
        <span className="min-w-48 flex-1 text-body-s leading-body text-foreground">{foes}</span>
        <Button variant="destructive" size="sm" disabled={disabled} onClick={onEscalate}>
          <Icon name="dices" size={13} />
          Roll initiative
        </Button>
      </div>
    </section>
  );
}
