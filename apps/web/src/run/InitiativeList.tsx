import type { Combatant, CombatantId, EncounterRun } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SectionHeading,
} from "@taverns/ui";
import { CharacterPortrait } from "../characters/CharacterPortrait";

/**
 * The initiative list — the thing the DM's finger is on all night.
 *
 * The runner redesign's initiative card (`Campaign Overview.dc.html`, the fight's
 * first column) is the specification, built here out of the shipped components
 * and the theme's names: a narrow list whose row is the number, the name, its AC
 * and conditions, and its hit points. Damage and healing are the selected card's
 * now (`CombatantPanel.tsx`) — the column is too narrow for a control on every
 * row, and the drawing moved them. Three things it draws that the prototype
 * could not, because it had no server:
 *
 *  - **Zero hit points is a state, not a removal.** A downed combatant is
 *    greyed and struck through and stays exactly where it was in the order —
 *    `Combatant.ts` and the prototype's own toast both say so. Nothing here
 *    filters, sorts or tidies on hit points.
 *  - **The order is the server's**, unsorted. It is also what `nextTurn` walks,
 *    so a second sort here could disagree with the marker.
 *  - **The hidden marker only appears when there is something to hide from.**
 *    Every row defaults to `dm`, so marking them all would mark nothing; when
 *    the fight is shared, the rows *still* held back are the exception, and
 *    those are the ones worth a glyph.
 */

/**
 * The badge a condition word wears. The drawing's own mapping — Concentrating
 * is magic, Poisoned is a harm, anything else is information — plus the two
 * words the prototype seeded that read as danger.
 */
const CONDITION_VARIANT: Record<string, "destructive" | "magic" | "info"> = {
  Hostile: "destructive",
  Downed: "destructive",
  Poisoned: "destructive",
  Concentrating: "magic",
};

/**
 * Hit points, as a number over a bar.
 *
 * The colour steps the way the drawing's does — success above half, the accent
 * above a quarter, danger below — because that is the one thing on the row a
 * DM reads without looking at it. Named for the semantic slots, so a palette
 * change does not date it.
 */
function HpBar({ hp, max }: { readonly hp: number; readonly max: number }) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (hp / max) * 100));
  const fill = percent > 50 ? "bg-success" : percent > 25 ? "bg-accent" : "bg-danger";

  return (
    <div className="flex w-16 shrink-0 flex-col items-end gap-1.5">
      <span
        className={`font-mono text-mono leading-none font-medium ${
          hp === 0 ? "text-danger" : "text-foreground"
        }`}
      >
        {hp}/{max}
      </span>
      <div className="h-1 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <div
          className={`h-full transition-[width] duration-(--dur-base) ease-out ${fill}`}
          // A percentage of the track, which is the one measurement that cannot
          // come from a token: it is the datum.
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}

function CombatantRow({
  combatant,
  hp,
  active,
  selected,
  shared,
  onSelect,
}: {
  readonly combatant: Combatant;
  readonly hp: number;
  readonly active: boolean;
  readonly selected: boolean;
  /** Whether the fight itself is shared, which is what makes hiding mean anything. */
  readonly shared: boolean;
  readonly onSelect: () => void;
}) {
  const down = hp === 0;

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={[
        "flex min-h-row cursor-pointer items-center gap-2.5 border-b border-l-3 border-b-hairline py-1 pr-3.5 pl-2.5",
        "outline-none focus-visible:ring-focus",
        active ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-surface-raised",
        selected && !active ? "bg-surface-raised" : "",
        down ? "opacity-45" : "",
      ].join(" ")}
    >
      <span
        className={`w-6 shrink-0 text-right font-mono text-mono-l leading-none font-medium ${
          active ? "text-accent-ink" : "text-muted-foreground"
        }`}
      >
        {combatant.initiative}
      </span>

      {/* A PC's portrait when its seat lets this reader see one; otherwise the
          drawing's icon, in the same slot so the names stay in a column. */}
      <CharacterPortrait
        name={combatant.displayName}
        portrait={combatant.kind === "pc" ? combatant.portrait : null}
        size="row"
        fallback={
          <Icon
            name={combatant.kind === "pc" ? "shield" : "skull"}
            size={15}
            className={combatant.kind === "pc" ? "text-info" : "text-danger"}
          />
        }
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`min-w-0 truncate text-body-s leading-snug font-semibold text-heading ${
              down ? "line-through" : ""
            }`}
          >
            {combatant.displayName}
          </span>
          {shared && combatant.visibility === "dm" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="shrink-0 text-faint" aria-label="Hidden from players">
                    <Icon name="eye-off" size={13} />
                  </span>
                }
              />
              <TooltipContent>Hidden from players</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="font-mono text-mono leading-snug text-muted-foreground">
            {combatant.ac === null ? "AC —" : `AC ${String(combatant.ac)}`}
          </span>
          {combatant.conditions.map((condition) => (
            <Badge key={condition} variant={CONDITION_VARIANT[condition] ?? "info"}>
              {condition}
            </Badge>
          ))}
        </div>
      </div>

      <HpBar hp={hp} max={combatant.hpMax} />
    </div>
  );
}

/**
 * The two-level visibility state, in one sentence.
 *
 * The master toggle first and the per-row exceptions second, so the switch in
 * the top bar can never imply more than it does. The all-hidden case is written
 * out rather than folded into the middle one: "everyone but the 8" when there
 * are 8 combatants is arithmetic the DM should not have to do to find out their
 * players are looking at an empty list.
 */
const visibilitySentence = (shared: boolean, held: number, total: number): string => {
  if (!shared) return "DM only — nothing here is on the players' screen.";
  if (held === 0) return "Players see everyone here.";
  if (held === total) return "Players see the fight, but every line in it is hidden from them.";
  return `Players see everyone but the ${String(held)} you are holding back.`;
};

export function InitiativeList({
  run,
  combatants,
  hpOf,
  selectedId,
  disabled,
  onSelect,
  onAdd,
  onRoll,
}: {
  readonly run: EncounterRun;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly hpOf: (combatant: Combatant) => number;
  readonly selectedId: CombatantId | undefined;
  readonly disabled: boolean;
  readonly onSelect: (combatant: Combatant) => void;
  readonly onAdd: () => void;
  readonly onRoll: () => void;
}) {
  const shared = run.visibility === "shared";
  const held = combatants.filter((combatant) => combatant.visibility === "dm").length;
  const monsters = combatants.filter((combatant) => combatant.kind === "npc");
  const standing = monsters.filter((combatant) => hpOf(combatant) > 0).length;

  return (
    // `clip` keeps the rows inside the card's corners without making the card
    // a scroll container: the list takes its whole height and the window
    // scrolls it.
    <Card className="overflow-clip">
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-2.5">
        <SectionHeading as="h2" size="title">
          Initiative
        </SectionHeading>
        <span className="ml-auto min-w-0 truncate font-mono text-mono leading-none text-muted-foreground">
          {standing} {standing === 1 ? "hostile" : "hostiles"} standing
        </span>
      </div>

      <div role="table" aria-label="Initiative order">
        {combatants.length === 0 ? (
          <p className="px-panel py-8 text-center text-body-s leading-body text-muted-foreground">
            Nobody is in the order. Add whoever is at the table, or end the fight and start one with
            a roster.
          </p>
        ) : (
          combatants.map((combatant) => (
            <CombatantRow
              key={combatant.id}
              combatant={combatant}
              hp={hpOf(combatant)}
              active={combatant.id === run.activeCombatantId}
              selected={combatant.id === selectedId}
              shared={shared}
              onSelect={() => onSelect(combatant)}
            />
          ))
        )}
      </div>
      {/* The list's own verbs sit under it, where the drawing puts its
          *Reroll initiative*: the header is the list's width, and a 340px
          column has room for its title and the count, not for buttons too. */}
      <div className="flex flex-col gap-2 px-panel py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {/* `EncounterRunner.jsx:138`'s reroll, narrowed to what a DM can
              honestly do: the app cannot roll for the people at the table, and
              a button that overwrote the numbers they just called out would be
              worse than no button. Everything seeds at initiative 0, so this is
              the first thing pressed in a fight. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled || monsters.length === 0}
                  onClick={onRoll}
                >
                  <Icon name="dices" size={13} />
                  Roll for monsters
                </Button>
              }
            />
            <TooltipContent>Roll d20 for the monsters. The party keep theirs.</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onAdd}>
            <Icon name="plus" size={13} />
            Add combatant
          </Button>
        </div>
        <p className="mb-0 text-caption leading-body text-muted-foreground">
          {visibilitySentence(shared, held, combatants.length)}
        </p>
      </div>
    </Card>
  );
}
