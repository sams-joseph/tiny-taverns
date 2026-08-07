import type { Combatant, CombatantId, EncounterRun } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@taverns/ui";
import { useState } from "react";
import { subtitleOf } from "./load";

/**
 * The initiative list — the thing the DM's finger is on all night.
 *
 * `ui_kits/dm-screen/EncounterRunner.jsx:21-48` is the specification, built here
 * out of the shipped components and the theme's names. Three things it draws
 * that the prototype could not, because it had no server:
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

/** The prototype's five known conditions, and what an unknown word gets. */
const CONDITION_VARIANT: Record<string, "destructive" | "magic" | "info"> = {
  Hostile: "destructive",
  Concentrating: "magic",
  Prone: "info",
  Downed: "destructive",
  Legendary: "info",
};

/**
 * Hit points, as a bar and a number.
 *
 * The colour steps the way the prototype's does — crimson at nothing, danger
 * under a third, verdigris under two thirds, emerald above — because that is
 * the one thing on the row a DM reads without looking at it.
 */
function HpBar({ hp, max }: { readonly hp: number; readonly max: number }) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (hp / max) * 100));
  const fill =
    hp === 0
      ? "bg-crimson-400"
      : percent <= 34
        ? "bg-danger"
        : percent <= 67
          ? "bg-accent"
          : "bg-success";

  return (
    <div className="flex w-26 shrink-0 items-center gap-1.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
        <div
          className={`h-full transition-[width] duration-(--dur-base) ease-out ${fill}`}
          // A percentage of the track, which is the one measurement that cannot
          // come from a token: it is the datum.
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <span
        className={`min-w-11 text-right font-mono text-mono leading-none font-medium ${
          hp === 0 ? "text-crimson-200" : "text-on-dark"
        }`}
      >
        {hp}/{max}
      </span>
    </div>
  );
}

/**
 * Damage and healing, on the row, without opening anything.
 *
 * A DM at a table says "the ogre hits Brannoc for twelve" and then has to make
 * that true before the next player speaks. So: find the row, type the number,
 * press Enter. Nothing to open, nothing to select first, and the same three
 * keystrokes every time.
 *
 * It is revealed by hover *and* by focus-within rather than mounted on hover,
 * so nothing on the row moves when the pointer crosses it and the whole control
 * is still reachable by keyboard.
 */
function DamageControl({
  combatant,
  disabled,
  onApply,
}: {
  readonly combatant: Combatant;
  readonly disabled: boolean;
  readonly onApply: (amount: number) => void;
}) {
  const [text, setText] = useState("");
  const amount = Number(text);
  const ready = text.trim() !== "" && Number.isInteger(amount) && amount > 0;

  const apply = (sign: 1 | -1) => {
    if (!ready || disabled) return;
    onApply(sign * amount);
    setText("");
  };

  return (
    <div
      className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-(--dur-fast) ease-out group-hover/row:opacity-100 focus-within:opacity-100"
      // The row's click selects; the controls inside it must not.
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        mono
        inputMode="numeric"
        aria-label={`Hit points to apply to ${combatant.displayName}`}
        placeholder="0"
        value={text}
        disabled={disabled}
        className="h-8 w-14 px-2 text-center"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply(1);
          if (event.key === "Escape") setText("");
        }}
      />
      <Button
        variant="destructive"
        size="icon"
        className="size-8"
        aria-label={`Damage ${combatant.displayName}`}
        disabled={!ready || disabled}
        onClick={() => apply(1)}
      >
        <Icon name="minus" size={14} />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="size-8"
        aria-label={`Heal ${combatant.displayName}`}
        disabled={!ready || disabled}
        onClick={() => apply(-1)}
      >
        <Icon name="heart-pulse" size={14} />
      </Button>
    </div>
  );
}

function CombatantRow({
  combatant,
  hp,
  active,
  selected,
  shared,
  disabled,
  onSelect,
  onDamage,
}: {
  readonly combatant: Combatant;
  readonly hp: number;
  readonly active: boolean;
  readonly selected: boolean;
  /** Whether the fight itself is shared, which is what makes hiding mean anything. */
  readonly shared: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly onDamage: (amount: number) => void;
}) {
  const down = hp === 0;
  const subtitle = subtitleOf(combatant);

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
        "group/row flex h-row cursor-pointer items-center gap-2.5 border-b border-l-3 border-b-hairline px-2.5",
        "outline-none focus-visible:ring-focus",
        active ? "border-l-accent bg-accent-soft" : "border-l-transparent hover:bg-slate-300/6",
        selected && !active ? "bg-slate-300/6" : "",
        down ? "opacity-45" : "",
      ].join(" ")}
    >
      <span
        className={`w-6 shrink-0 text-right font-mono text-mono-l leading-none font-bold ${
          active ? "text-verdigris-300" : "text-on-dark-muted"
        }`}
      >
        {combatant.initiative}
      </span>

      <Icon
        name={combatant.kind === "pc" ? "shield" : "skull"}
        size={15}
        className={combatant.kind === "pc" ? "shrink-0 text-info" : "shrink-0 text-danger"}
      />

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-body-s leading-snug font-bold text-on-dark ${
            down ? "line-through" : ""
          }`}
        >
          {combatant.displayName}
        </div>
        {subtitle !== undefined && (
          <div className="truncate text-micro leading-snug text-on-dark-muted">{subtitle}</div>
        )}
      </div>

      {shared && combatant.visibility === "dm" && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="shrink-0 text-faint" aria-label="Hidden from players">
                <Icon name="eye-off" size={14} />
              </span>
            }
          />
          <TooltipContent>Hidden from players</TooltipContent>
        </Tooltip>
      )}

      <div className="flex shrink-0 gap-1">
        {combatant.conditions.map((condition) => (
          <Badge key={condition} variant={CONDITION_VARIANT[condition] ?? "secondary"}>
            {condition}
          </Badge>
        ))}
      </div>

      <span className="shrink-0 font-mono text-mono leading-none font-medium whitespace-nowrap text-on-dark-muted">
        {combatant.ac === null ? "AC —" : `AC ${String(combatant.ac)}`}
      </span>

      <HpBar hp={hp} max={combatant.hpMax} />

      <DamageControl combatant={combatant} disabled={disabled} onApply={onDamage} />
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
  onDamage,
  onAdd,
  onRoll,
}: {
  readonly run: EncounterRun;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly hpOf: (combatant: Combatant) => number;
  readonly selectedId: CombatantId | undefined;
  readonly disabled: boolean;
  readonly onSelect: (combatant: Combatant) => void;
  readonly onDamage: (combatant: Combatant, amount: number) => void;
  readonly onAdd: () => void;
  readonly onRoll: () => void;
}) {
  const shared = run.visibility === "shared";
  const held = combatants.filter((combatant) => combatant.visibility === "dm").length;
  const monsters = combatants.filter((combatant) => combatant.kind === "npc").length;

  return (
    <Card tone="panel" className="min-h-0 flex-1 overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-strong px-panel py-2.5">
        <span className="font-display text-subtitle leading-snug font-semibold text-heading">
          Initiative
        </span>
        <Badge>Round {run.round}</Badge>
        <span className="min-w-0 truncate text-caption leading-body text-muted-foreground">
          {visibilitySentence(shared, held, combatants.length)}
        </span>
        <span className="ml-auto flex shrink-0 gap-1.5">
          {/* `EncounterRunner.jsx:138`'s reroll, narrowed to what a DM can
              honestly do: the app cannot roll for the people at the table, and
              a button that overwrote the numbers they just called out would be
              worse than no button. Everything seeds at initiative 0, so this is
              the first thing pressed in a fight. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 text-on-dark-muted"
                  aria-label="Roll initiative for the monsters"
                  disabled={disabled || monsters === 0}
                  onClick={onRoll}
                >
                  <Icon name="dices" size={14} />
                </Button>
              }
            />
            <TooltipContent>Roll d20 for the monsters. The party keep theirs.</TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-on-dark-muted"
            aria-label="Add a combatant"
            disabled={disabled}
            onClick={onAdd}
          >
            <Icon name="plus" size={14} />
          </Button>
        </span>
      </div>

      <div role="table" aria-label="Initiative order" className="min-h-0 flex-1 overflow-y-auto">
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
              disabled={disabled}
              onSelect={() => onSelect(combatant)}
              onDamage={(amount) => onDamage(combatant, amount)}
            />
          ))
        )}
      </div>
    </Card>
  );
}
