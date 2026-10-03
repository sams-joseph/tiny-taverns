import type { Combatant, Creature, CreatureId, DeathSaves, Visibility } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Icon,
  Input,
  SectionHeading,
  Toggle,
  cn,
} from "@taverns/ui";
import { useState } from "react";
import { apiUrl } from "../api/client";
import { StatBlockBody } from "../bestiary/StatBlock";
import { DrawnImage } from "../hob/DrawnImage";
import { ActionsMenu, type ActionsMenuItem } from "../ui/ActionsMenu";
import { actionDetail, type ActionLine } from "./actions";
import { deathStatusOf, dotPressed, type DeathStatus } from "./deathSaves";
import { attacks, rolls, type AttackOutcome } from "./attack";
import { AttackResultCard } from "./AttackResult";
import { subtitleOf } from "./load";

/**
 * Whoever the DM is looking at: the creature panel of `Encounter Runner.dc.html`,
 * floating at the right of the canvas (and the selected card of the narrow
 * grid). Its header is the creature — a disc ringed by side, the name, *Party*
 * or *Hostile*, the subtitle — with the eye that hides it from players and an
 * overflow menu for the acts the drawing leaves out; then its numbers, the
 * damage box, a party member's death saves while they are at zero, its last
 * attack's result (`AttackResult.tsx`), what it rolls for — *Attack* for
 * whoever is up, *Roll* otherwise — its stat block and its conditions.
 *
 * The panel is layered honestly, because a combatant is a *snapshot* and its
 * creature is a template that may have been edited, deleted, or never been
 * visible to this credential:
 *
 *  - **The combatant's own numbers always render.** They are the fight, they
 *    are on the wire, and a party member has no stat block at all. Speed is the
 *    one tile that is not on a combatant: it is the front of the stat block's
 *    or sheet's speed, the same reading the board's range uses (`speedOf`), and
 *    a row with neither shows a dash rather than a guess.
 *  - **The Actions list and the stat block render when there is something to
 *    read** (`run/actions.ts`): a creature still readable, or a sheet the party
 *    read carries. `Combatant.creatureId` is provenance and not an access path —
 *    nothing is *read through* it — so a miss is an ordinary outcome, said
 *    plainly, rather than an error.
 *  - **Conditions are an open vocabulary** (`Combatant.ts`). The drawing's
 *    fourteen are toggles; any other word the row carries is a toggle too,
 *    pressed, so it can be cleared; and any word can be added (*Blessed*). They
 *    are written through to the character, so a condition set here is the one
 *    the party sees.
 *
 * It takes its natural height, however long the stat block runs; on the canvas
 * the panel region scrolls (`RunStage.tsx`), and in the grid the window does.
 */

/**
 * The drawing's toggles (`CONDS`): the SRD's conditions but Exhaustion, which
 * has levels and so is a word ("Exhaustion 2"), plus Concentrating.
 */
const RUNNER_CONDITIONS = [
  "Blinded",
  "Charmed",
  "Concentrating",
  "Deafened",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;

/** `Combatant.ts`'s `Condition`: one to forty characters. */
const MAX_CONDITION_LENGTH = 40;

function Tile({
  label,
  value,
  danger = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly danger?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-control border border-hairline bg-surface-sunken px-1 py-2">
      <span className="text-micro leading-none text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-full truncate font-mono text-mono-l leading-none font-medium",
          danger ? "text-danger" : "text-heading",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** A section's heading, with what it counts at the far end when it counts something. */
function SectionTitle({ title, aside }: { readonly title: string; readonly aside?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <SectionHeading as="h3" className="text-label leading-none font-semibold">
        {title}
      </SectionHeading>
      {aside !== undefined && (
        <span className="text-label-s leading-none text-muted-foreground">{aside}</span>
      )}
    </div>
  );
}

/**
 * The drawing's disc: the token's initials (or the character's portrait when
 * its seat lets this reader see one) in a ring the side's colour, dashed while
 * the row is hidden from players — the strip's and the board's ring.
 */
function Disc({ combatant, label }: { readonly combatant: Combatant; readonly label: string }) {
  const portrait = combatant.kind === "pc" ? combatant.portrait : null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-raised font-sans text-body-s leading-none font-semibold text-heading",
        combatant.kind === "pc" ? "border-info" : "border-danger",
        combatant.visibility === "dm" && "border-dashed",
      )}
    >
      {label}
      <DrawnImage
        src={portrait === null ? undefined : apiUrl(portrait.thumbUrl)}
        className="object-top"
      />
    </span>
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
        placeholder="Amount"
        value={text}
        disabled={disabled}
        className="min-w-0 flex-1"
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
        <Icon name="skull" size={13} />
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

const STATUS: Record<DeathStatus, { readonly word: string; readonly tone: string }> = {
  dying: { word: "Dying", tone: "text-muted-foreground" },
  stable: { word: "Stable", tone: "text-success" },
  dead: { word: "Dead", tone: "text-danger" },
};

/** One row of three dots, each a button that sets the row's count (`dotPressed`). */
function SaveDots({
  kind,
  count,
  disabled,
  onSet,
}: {
  readonly kind: "Success" | "Fail";
  readonly count: number;
  readonly disabled: boolean;
  readonly onSet: (count: number) => void;
}) {
  const plural = kind === "Success" ? "successes" : "failures";
  return (
    <div className="flex items-center" role="group" aria-label={`Death save ${plural}`}>
      <span className="min-w-12 text-label-s leading-none text-muted-foreground">{kind}</span>
      {/* The drawing's 14px dot inside a button a pointer can hit (24px, WCAG 2.5.8). */}
      {[0, 1, 2].map((index) => (
        <button
          key={index}
          type="button"
          aria-label={`${kind} ${String(index + 1)} of 3`}
          aria-pressed={count > index}
          disabled={disabled}
          onClick={() => onSet(dotPressed(count, index))}
          className="flex size-6 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-3.5 rounded-full border-2 transition-control",
              kind === "Success" ? "border-success" : "border-danger",
              count > index && (kind === "Success" ? "bg-success" : "bg-danger"),
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A party member at zero hit points: three successes, three failures, where
 * that leaves them, and a roll. The dots set the counts outright (the DM's
 * `setDeathSaves`); *Roll death save* rolls the d20 in the browser and the server reads
 * it (`deathSaveRolled`), so the rule has one home. At three of either there
 * is nothing left to roll for. A stable character hit again starts dying
 * again — the server's rule, which the row it answers with carries here.
 */
function DeathSaveBlock({
  combatant,
  saves,
  disabled,
  onSet,
  onRoll,
}: {
  readonly combatant: Combatant;
  readonly saves: DeathSaves;
  readonly disabled: boolean;
  readonly onSet: (saves: DeathSaves) => void;
  readonly onRoll: () => void;
}) {
  const status = STATUS[deathStatusOf(saves)];
  const settled = saves.successes >= 3 || saves.failures >= 3;
  return (
    <section
      aria-label={`Death saves of ${combatant.displayName}`}
      className="-mx-panel flex flex-col gap-2.5 border-t border-hairline bg-danger/6 px-panel py-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <SectionHeading as="h3" className="text-label leading-none font-semibold text-danger">
          Death saves
        </SectionHeading>
        <span className={cn("text-label-s leading-none font-medium", status.tone)}>
          {status.word}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SaveDots
          kind="Success"
          count={saves.successes}
          disabled={disabled}
          onSet={(successes) => onSet({ ...saves, successes })}
        />
        <SaveDots
          kind="Fail"
          count={saves.failures}
          disabled={disabled}
          onSet={(failures) => onSet({ ...saves, failures })}
        />
      </div>
      <Button variant="outline" size="sm" disabled={disabled || settled} onClick={onRoll}>
        <Icon name="dice-5" size={14} />
        Roll death save
      </Button>
    </section>
  );
}

/**
 * What the selected creature rolls for, one line each (`actionsOf`). Whoever is
 * up attacks: *Attack* asks for a target and the result lands on this card.
 * Anyone else, and a line with no to-hit, *Roll*s into the dock — the to-hit
 * and the damage together, with no target. *Attack* is `outline` so that *Next
 * turn* stays the screen's one peach.
 */
function Actions({
  combatant,
  actions,
  active,
  disabled,
  targeting,
  onAttack,
  onRoll,
}: {
  readonly combatant: Combatant;
  readonly actions: ReadonlyArray<ActionLine>;
  readonly active: boolean;
  readonly disabled: boolean;
  /** The line whose target is being picked, if one is. */
  readonly targeting: ActionLine | undefined;
  readonly onAttack: (action: ActionLine) => void;
  readonly onRoll: (action: ActionLine) => void;
}) {
  return (
    <section aria-label={`Actions of ${combatant.displayName}`} className="flex flex-col gap-2">
      <SectionTitle title="Actions" />
      <ul className="flex flex-col">
        {actions.map((action) => (
          <li key={action.key} className="flex items-center gap-2.5 border-t border-hairline py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body-s leading-snug font-semibold text-heading">
                {action.name}
              </span>
              <span className="font-mono text-caption leading-snug text-muted-foreground">
                {actionDetail(action)}
              </span>
            </div>
            {active && attacks(action) ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Attack with ${action.name}`}
                aria-pressed={targeting?.key === action.key}
                disabled={disabled}
                onClick={() => onAttack(action)}
              >
                <Icon name="swords" size={14} />
                Attack
              </Button>
            ) : (
              rolls(action) && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Roll ${action.name}`}
                  onClick={() => onRoll(action)}
                >
                  <Icon name="dice-5" size={14} />
                  Roll
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The whole stat block, folded under its name until the DM wants it. */
function StatBlockDisclosure({
  combatant,
  creature,
  onRoll,
}: {
  readonly combatant: Combatant;
  readonly creature: Creature;
  readonly onRoll: (label: string, notation: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className="-mx-2 justify-start self-start"
        onClick={() => setOpen((now) => !now)}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        Stat block
      </Button>
      {open && (
        <StatBlockBody
          creature={creature}
          emptyNote="This creature has no stat block written yet. Its numbers above are what the fight is using."
          onRoll={(label, notation) => onRoll(`${combatant.displayName} · ${label}`, notation)}
        />
      )}
    </div>
  );
}

export function Conditions({
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
    (condition) => !(RUNNER_CONDITIONS as ReadonlyArray<string>).includes(condition),
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
        {[...RUNNER_CONDITIONS, ...others].map((condition) => (
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
  label,
  speed,
  actions,
  creatures,
  active,
  following,
  disabled,
  conditionsBusy,
  deathSavesBusy,
  hiding,
  rolling,
  onTheirTurn,
  onEdit,
  onFollow,
  onTakeOff,
  onRemove,
  onDamage,
  onConditions,
  onVisibility,
  onRoll,
  onDeathSaves,
  onDeathSaveRoll,
  targeting,
  result,
  onAttack,
  onRollAction,
  onApplyResult,
  onDismissResult,
}: {
  readonly combatant: Combatant | undefined;
  readonly hp: number;
  /** The initials its token wears (`tokenLabels`), for the disc. */
  readonly label: string;
  /** Feet, from the front of its stat block's or sheet's speed; absent when neither says. */
  readonly speed: number | undefined;
  readonly actions: ReadonlyArray<ActionLine>;
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
  /** Whether this is whose turn it is. */
  readonly active: boolean;
  /** Whether the panel is tracking the turn rather than a manual pick. */
  readonly following: boolean;
  readonly disabled: boolean;
  /** A condition write is in flight; the chips wait for its answer. */
  readonly conditionsBusy: boolean;
  /** A death-save write or roll is in flight; the dots and the roll wait for its answer. */
  readonly deathSavesBusy: boolean;
  /** A visibility write is in flight; the eye waits for its answer. */
  readonly hiding: boolean;
  /** Rolling initiative: nobody is up yet, so nobody can be made up. */
  readonly rolling: boolean;
  readonly onTheirTurn: () => void;
  readonly onEdit: () => void;
  readonly onFollow: () => void;
  /** Present only while its token stands on a board the DM may change. */
  readonly onTakeOff: (() => void) | undefined;
  /** Asks first (`RemoveCombatantDialog`). */
  readonly onRemove: () => void;
  /** Positive damages, negative heals. */
  readonly onDamage: (amount: number) => void;
  readonly onConditions: (conditions: ReadonlyArray<string>) => void;
  readonly onVisibility: (visibility: Visibility) => void;
  /** Roll into the DM's local dice, under a label that already names the combatant. */
  readonly onRoll: (label: string, notation: string) => void;
  /** The dots: both counts, set outright. */
  readonly onDeathSaves: (saves: DeathSaves) => void;
  /** *Roll death save*: the d20 is rolled by the caller, the rule applied by the server. */
  readonly onDeathSaveRoll: () => void;
  /** The line this combatant is picking a target for, if it is. */
  readonly targeting: ActionLine | undefined;
  /** This combatant's last attack, until it is dismissed or the turn moves. */
  readonly result: { readonly outcome: AttackOutcome; readonly applied: boolean } | undefined;
  /** Start picking a target for one of its lines (`attack.ts`). */
  readonly onAttack: (action: ActionLine) => void;
  /** Roll a line with no target, into the dock. */
  readonly onRollAction: (action: ActionLine) => void;
  /** Send the attack's damage, whole or halved, to its target. */
  readonly onApplyResult: (amount: number) => void;
  readonly onDismissResult: () => void;
}) {
  if (combatant === undefined) {
    return (
      <Card role="region" aria-label="Selected combatant">
        <CardContent className="flex flex-col items-center gap-2.5 p-panel py-8 text-center">
          <Icon name="mouse-pointer-2" size={28} className="text-muted-foreground" />
          <p className="mb-0 max-w-56 text-body-s leading-body text-muted-foreground">
            {rolling
              ? "Nothing selected. Pick a name while you roll initiative."
              : "Nothing selected. Click a token, or a name in the initiative."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const creature = combatant.creatureId === null ? undefined : creatures.get(combatant.creatureId);
  const subtitle = subtitleOf(combatant);
  const hidden = combatant.visibility === "dm";
  // The drawing's words as the tooltip; the name in the accessible one, since
  // the board's dock has a *Hide from players* of its own for every monster.
  const eye = hidden ? "Hidden from players. Click to reveal." : "Hide from players";
  const eyeName = hidden
    ? `${combatant.displayName} is hidden from players. Reveal them.`
    : `Hide ${combatant.displayName} from players`;

  // The acts the drawing leaves out (the captain's call of 2026-09-25): each
  // offered only where it does something, and none that writes once the fight
  // is over or a dialog holds the screen.
  const menu: Array<ActionsMenuItem> = [
    ...(disabled || rolling || active
      ? []
      : [{ label: "Make it their turn", icon: "swords" as const, onSelect: onTheirTurn }]),
    ...(following
      ? []
      : [{ label: "Follow the turn", icon: "crosshair" as const, onSelect: onFollow }]),
    ...(disabled ? [] : [{ label: "Edit", icon: "pencil" as const, onSelect: onEdit }]),
    ...(disabled || onTakeOff === undefined
      ? []
      : [{ label: "Take off the board", icon: "map-pin" as const, onSelect: onTakeOff }]),
    ...(disabled
      ? []
      : [
          {
            label: "Remove from the fight",
            icon: "trash-2" as const,
            onSelect: onRemove,
            destructive: true,
          },
        ]),
  ];

  return (
    <Card role="region" aria-label="Selected combatant">
      <div className="flex items-start gap-3 border-b border-hairline p-panel">
        <Disc combatant={combatant} label={label} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SectionHeading as="h2" size="display" className="min-w-0 truncate font-semibold">
              {combatant.displayName}
            </SectionHeading>
            {combatant.kind === "pc" ? (
              <Badge variant="info">Party</Badge>
            ) : (
              <Badge variant="destructive">Hostile</Badge>
            )}
          </div>
          {subtitle !== undefined && (
            <p
              className={cn(
                "mt-0.5 mb-0 leading-snug text-muted-foreground",
                // A party member's line is a fact about a person; a monster's
                // is the stat block's flavour, in the block's own face.
                combatant.kind === "pc" ? "text-caption" : "font-serif text-body-s italic",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-control-sm", hidden ? "text-magic-ink" : "text-muted-foreground")}
            aria-label={eyeName}
            title={eye}
            disabled={disabled || hiding}
            onClick={() => onVisibility(hidden ? "shared" : "dm")}
          >
            <Icon name={hidden ? "eye-off" : "eye"} size={16} />
          </Button>
          {menu.length > 0 && (
            <ActionsMenu label={`More for ${combatant.displayName}`} items={menu} />
          )}
        </div>
      </div>

      <CardContent className="flex flex-col gap-3.5 p-panel">
        <div className="grid grid-cols-4 gap-1.5">
          <Tile label="AC" value={combatant.ac === null ? "—" : String(combatant.ac)} />
          <Tile label="HP" value={`${String(hp)}/${String(combatant.hpMax)}`} danger={hp === 0} />
          <Tile label="Speed" value={speed === undefined ? "—" : String(speed)} />
          <Tile
            label="Init"
            value={combatant.initiative === null ? "—" : String(combatant.initiative)}
          />
        </div>

        <HitPoints combatant={combatant} disabled={disabled} onApply={onDamage} />

        {/* Only at zero: above it a party member makes no saves, and healing
            off zero clears them (the server's rule). An NPC has none. */}
        {combatant.deathSaves !== null && hp === 0 && (
          <DeathSaveBlock
            combatant={combatant}
            saves={combatant.deathSaves}
            disabled={disabled || deathSavesBusy}
            onSet={onDeathSaves}
            onRoll={onDeathSaveRoll}
          />
        )}

        {result !== undefined && (
          <AttackResultCard
            outcome={result.outcome}
            applied={result.applied}
            disabled={disabled}
            onApply={onApplyResult}
            onDismiss={onDismissResult}
          />
        )}

        {actions.length > 0 && (
          <div className="border-t border-hairline pt-3.5">
            <Actions
              combatant={combatant}
              actions={actions}
              active={active}
              disabled={disabled}
              targeting={targeting}
              onAttack={onAttack}
              onRoll={onRollAction}
            />
          </div>
        )}

        {creature !== undefined ? (
          <div className="border-t border-hairline pt-2">
            <StatBlockDisclosure
              // A new creature opens folded, as the first one did.
              key={combatant.id}
              combatant={combatant}
              creature={creature}
              onRoll={onRoll}
            />
          </div>
        ) : (
          combatant.creatureId !== null && (
            <p className="mb-0 border-t border-hairline pt-3.5 text-caption leading-body text-muted-foreground">
              The bestiary entry this was seeded from is gone, or belongs to someone else. The
              numbers above are what the fight is using — they were copied when it started.
            </p>
          )
        )}

        <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
          <SectionTitle
            title="Conditions"
            aside={
              combatant.conditions.length === 0
                ? "None"
                : `${String(combatant.conditions.length)} active`
            }
          />
          <Conditions
            // A new combatant is a new word being typed, not the last one's.
            key={combatant.id}
            combatant={combatant}
            disabled={disabled || conditionsBusy}
            onChange={onConditions}
          />
        </div>
      </CardContent>
    </Card>
  );
}
