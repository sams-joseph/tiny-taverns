import type { Combatant, Creature, CreatureId } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Toggle,
} from "@taverns/ui";
import { useState } from "react";
import { StatBlockBody } from "../bestiary/StatBlock";
import { subtitleOf } from "./load";

/**
 * Whoever the DM is looking at: their numbers, what they can do to them, and
 * their stat block when there is one to show.
 *
 * The lower half is `bestiary/StatBlock.tsx` — the same block the bestiary
 * renders, because it is the same row — with its abilities and attacks rolling
 * into the DM's local dice. The upper half is not in the prototype and has to
 * exist here, because the prototype's stat block is a fixture that always
 * matches: in the real product a combatant is a *snapshot* and its creature is
 * a template that may have been edited, deleted, or never been visible to this
 * credential.
 *
 * So the panel is layered honestly:
 *
 *  - **The combatant's own numbers always render.** They are the fight, they
 *    are on the wire, and a party member has no stat block at all. The third
 *    tile is the creature's CR when its block is readable and the initiative
 *    otherwise: the drawing's Speed is not on a combatant, so it is absent
 *    rather than guessed.
 *  - **The stat block renders when the creature is still readable**, and says
 *    so plainly when it is not. `Combatant.creatureId` is provenance and not an
 *    access path — nothing is *read through* it — so a miss here is an ordinary
 *    outcome rather than an error.
 *  - **Conditions are an open vocabulary** (`Combatant.ts`). The drawing's five
 *    are chips that toggle; any other word the row carries is a chip too, pressed,
 *    so it can be cleared; and any word can be added. They are written through
 *    to the character, so a condition set here is the one the party sees.
 *
 * It takes its natural height, however long the stat block runs. The window is
 * the only scroller.
 */

/** The drawing's five (`CONDS`), offered on every card. */
const COMMON_CONDITIONS = [
  "Prone",
  "Poisoned",
  "Restrained",
  "Frightened",
  "Concentrating",
] as const;

/** `Combatant.ts`'s `Condition`: one to forty characters. */
const MAX_CONDITION_LENGTH = 40;

function Tile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-control border border-hairline bg-surface-sunken px-2.5 py-2">
      <span className="text-label-s leading-none text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-mono-l leading-none font-medium text-heading">
        {value}
      </span>
    </div>
  );
}

/**
 * Damage and healing for the selected combatant: type the number, press
 * Enter (or *Damage*), and the next number is ready to type.
 */
function HitPoints({
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
    <div className="flex items-center gap-1.5">
      <Input
        mono
        inputMode="numeric"
        aria-label={`Hit points to apply to ${combatant.displayName}`}
        placeholder="0"
        value={text}
        disabled={disabled}
        className="w-18 shrink-0"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply(1);
          if (event.key === "Escape") setText("");
        }}
      />
      <Button
        variant="destructive"
        size="sm"
        aria-label={`Damage ${combatant.displayName}`}
        disabled={!ready || disabled}
        onClick={() => apply(1)}
      >
        <Icon name="swords" size={13} />
        Damage
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Heal ${combatant.displayName}`}
        disabled={!ready || disabled}
        onClick={() => apply(-1)}
      >
        <Icon name="heart-pulse" size={13} className="text-success" />
        Heal
      </Button>
    </div>
  );
}

function Conditions({
  combatant,
  disabled,
  onChange,
}: {
  readonly combatant: Combatant;
  readonly disabled: boolean;
  readonly onChange: (conditions: ReadonlyArray<string>) => void;
}) {
  const [word, setWord] = useState("");
  const held = combatant.conditions;
  const others = held.filter(
    (condition) => !(COMMON_CONDITIONS as ReadonlyArray<string>).includes(condition),
  );
  const toggle = (condition: string, on: boolean) =>
    onChange(on ? [...held, condition] : held.filter((other) => other !== condition));

  const trimmed = word.trim();
  const addable =
    trimmed !== "" &&
    trimmed.length <= MAX_CONDITION_LENGTH &&
    !held.some((condition) => condition.toLowerCase() === trimmed.toLowerCase());
  const add = () => {
    if (!addable || disabled) return;
    onChange([...held, trimmed]);
    setWord("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={`Conditions on ${combatant.displayName}`}
      >
        {[...COMMON_CONDITIONS, ...others].map((condition) => (
          <Toggle
            key={condition}
            size="sm"
            pressed={held.includes(condition)}
            disabled={disabled}
            onPressedChange={(on) => toggle(condition, on)}
          >
            {condition}
          </Toggle>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`Another condition for ${combatant.displayName}`}
          placeholder="Another condition"
          value={word}
          maxLength={MAX_CONDITION_LENGTH}
          disabled={disabled}
          className="min-w-0 flex-1"
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
            if (event.key === "Escape") setWord("");
          }}
        />
        <Button variant="outline" size="sm" disabled={!addable || disabled} onClick={add}>
          <Icon name="plus" size={13} />
          Add
        </Button>
      </div>
    </div>
  );
}

export function CombatantPanel({
  combatant,
  hp,
  creatures,
  active,
  following,
  disabled,
  conditionsBusy,
  onTheirTurn,
  onEdit,
  onFollow,
  onDamage,
  onConditions,
  onRoll,
}: {
  readonly combatant: Combatant | undefined;
  readonly hp: number;
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
  /** Whether this is whose turn it is. */
  readonly active: boolean;
  /** Whether the panel is tracking the turn rather than a manual pick. */
  readonly following: boolean;
  readonly disabled: boolean;
  /** A condition write is in flight; the chips wait for its answer. */
  readonly conditionsBusy: boolean;
  readonly onTheirTurn: () => void;
  readonly onEdit: () => void;
  readonly onFollow: () => void;
  /** Positive damages, negative heals. */
  readonly onDamage: (amount: number) => void;
  readonly onConditions: (conditions: ReadonlyArray<string>) => void;
  /** Roll into the DM's local dice, under a label that already names the combatant. */
  readonly onRoll: (label: string, notation: string) => void;
}) {
  if (combatant === undefined) {
    return (
      <Card role="region" aria-label="Selected combatant">
        <CardContent className="pt-card">
          <p className="text-body-s leading-body text-muted-foreground">
            Pick a line in the initiative list and whoever is on it shows up here, stat block and
            all.
          </p>
        </CardContent>
      </Card>
    );
  }

  const creature = combatant.creatureId === null ? undefined : creatures.get(combatant.creatureId);
  const subtitle = subtitleOf(combatant);
  const cr = creature === undefined ? undefined : creature.cr;

  return (
    <Card role="region" aria-label="Selected combatant">
      <CardHeader className="p-panel pb-0">
        <div className="flex items-start gap-2">
          <CardTitle className="min-w-0 flex-1 text-heading">{combatant.displayName}</CardTitle>
          {combatant.kind === "pc" ? (
            <Badge variant="info">Party</Badge>
          ) : (
            <Badge variant="destructive">Hostile</Badge>
          )}
        </div>
        {subtitle !== undefined && (
          <p className="mb-0 font-serif text-body-s leading-snug italic text-muted-foreground">
            {subtitle}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5 p-panel">
        <div className="flex flex-wrap items-center gap-2">
          {active ? (
            <Badge>
              <Icon name="swords" size={11} />
              Their turn
            </Badge>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={onTheirTurn}
              aria-label={`Make it ${combatant.displayName}'s turn`}
            >
              Make it their turn
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
            <Icon name="pencil" size={13} />
            Edit
          </Button>
          {!following && (
            <Button variant="ghost" size="sm" onClick={onFollow}>
              Follow the turn
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="AC" value={combatant.ac === null ? "—" : String(combatant.ac)} />
          <Tile label="HP" value={`${String(hp)}/${String(combatant.hpMax)}`} />
          {cr !== undefined ? (
            <Tile label="CR" value={cr} />
          ) : (
            <Tile label="Init" value={String(combatant.initiative)} />
          )}
        </div>

        <HitPoints combatant={combatant} disabled={disabled} onApply={onDamage} />

        <Conditions
          // A new combatant is a new word being typed, not the last one's.
          key={combatant.id}
          combatant={combatant}
          disabled={disabled || conditionsBusy}
          onChange={onConditions}
        />

        {creature !== undefined ? (
          <StatBlockBody
            creature={creature}
            emptyNote="This creature has no stat block written yet. Its numbers above are what the fight is using."
            onRoll={(label, notation) => onRoll(`${combatant.displayName} · ${label}`, notation)}
          />
        ) : combatant.creatureId !== null ? (
          <p className="border-t border-hairline pt-3.5 text-caption leading-body text-muted-foreground">
            The bestiary entry this was seeded from is gone, or belongs to someone else. The numbers
            above are what the fight is using — they were copied when it started.
          </p>
        ) : combatant.kind === "pc" ? (
          <p className="border-t border-hairline pt-3.5 text-body-s leading-body text-muted-foreground">
            {combatant.playerName === null || combatant.playerName === ""
              ? "Their sheet stays with their player; track HP and conditions here."
              : `Played by ${combatant.playerName}. Their sheet stays with them; track HP and conditions here.`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
