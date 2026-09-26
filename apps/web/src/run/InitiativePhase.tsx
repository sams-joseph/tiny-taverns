import {
  initiativeFrom,
  type Combatant,
  type CombatantId,
  type EncounterRun,
  type InitiativeEntry,
} from "@taverns/api";
import {
  Button,
  Card,
  Icon,
  Input,
  Label,
  SectionHeading,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@taverns/ui";
import { Result } from "effect";
import { useEffect, useState } from "react";
import { useMutation } from "../api/mutation";
import { signed } from "../characters/rolls";
import { SaveFailure } from "../ui/form";
import type { RunPath } from "./load";
import { newRequestId } from "./state";

/**
 * The fight before its first turn: the redesign's *Roll initiative* panel
 * (`Campaign Overview.dc.html`, the initiative phase), in the initiative list's
 * place while `run.phase` is `initiative`.
 *
 * Every number on it is the server's, written through as it is entered — typed
 * or rolled, one row or every monster at once, each through the fight's one
 * initiative write (`runs.setInitiative`). So a number a player sends from
 * their Table (`table.setInitiative`) turns up in its box on the next re-read,
 * and the DM overwrites it by typing over it. A box being typed in keeps what
 * is typed until it is sent: a re-read never snatches it away.
 *
 * Where it parts from the drawing:
 *
 *  - **A monster's number can be typed.** The drawing only rolls them, which
 *    leaves a DM rolling real dice with no way to enter what came up.
 *  - **Roll for them is d20 plus the row's initiative bonus**, the sheet's
 *    written initiative or its DEX (`Initiative.ts`), not always DEX; a
 *    character whose sheet gives no usable bonus is not rolled for.
 *  - **Ties go to the bonus**, which is the rule the server orders by
 *    (`initiativeOrderKeys`), so the hint says bonus rather than DEX.
 *  - **The d20 behind a rolled number is this screen's alone.** Only the total
 *    is state; the face the drawing prints beside it (and colours on a 1 or a
 *    20) is shown while that total is still the row's, and not after a reload.
 */

/** A d20 this screen rolled, and the total it made, so the face is shown only while it is current. */
interface Rolled {
  readonly face: number;
  readonly total: number;
}

const d20 = (): number => 1 + Math.floor(Math.random() * 20);

/** `d20 7 + 2`, the drawing's line for a rolled number. */
const rolledLine = (rolled: Rolled, bonus: number): string =>
  `d20 ${String(rolled.face)} ${bonus < 0 ? "−" : "+"} ${String(Math.abs(bonus))}`;

/** Party first, then the monsters, each by name, so a row does not jump as numbers arrive. */
const byName = (a: Combatant, b: Combatant): number =>
  a.displayName.localeCompare(b.displayName, undefined, { numeric: true }) ||
  a.id.localeCompare(b.id);

const count = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/**
 * What *Start round N* is waiting for, or the tie rule once it is waiting for
 * nothing. Hidden rows count: the server will not begin with one unnumbered.
 */
const startHint = (party: ReadonlyArray<Combatant>, monsters: ReadonlyArray<Combatant>): string => {
  const partyToGo = party.filter((row) => row.initiative === null).length;
  const monstersToGo = monsters.filter((row) => row.initiative === null).length;
  const parts = [
    partyToGo > 0 ? `${count(partyToGo, "player", "players")} to go` : undefined,
    monstersToGo === 0
      ? undefined
      : monstersToGo === monsters.length
        ? "monsters not rolled"
        : `${count(monstersToGo, "monster", "monsters")} to go`,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0
    ? parts.join(" · ")
    : "Ties go to the higher initiative bonus, then the players.";
};

function PhaseRow({
  combatant,
  rolled,
  shared,
  selected,
  disabled,
  onSelect,
  onCommit,
  onRoll,
}: {
  readonly combatant: Combatant;
  /** The d20 this screen last rolled for the row, if any. */
  readonly rolled: Rolled | undefined;
  readonly shared: boolean;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  /** Send a typed number, or `null` for a box emptied. */
  readonly onCommit: (initiative: number | null) => Promise<boolean>;
  /** Absent when there is nothing to add to a d20 for a character. */
  readonly onRoll: (() => void) | undefined;
}) {
  const pc = combatant.kind === "pc";
  // What is typed and not yet the server's. `undefined` shows the server's.
  const [draft, setDraft] = useState<string | undefined>();
  const typed =
    draft === undefined ? undefined : draft.trim() === "" ? null : initiativeFrom(draft);
  const invalid = draft !== undefined && typed === undefined;

  // Once the server holds what was typed, the box goes back to following it —
  // which is how a player's later number, or a roll, shows up in it.
  useEffect(() => {
    if (draft !== undefined && typed === combatant.initiative) setDraft(undefined);
  }, [draft, typed, combatant.initiative]);

  const commit = () => {
    if (draft === undefined || typed === undefined || typed === combatant.initiative) return;
    void onCommit(typed);
  };

  const current =
    rolled !== undefined && rolled.total === combatant.initiative ? rolled : undefined;
  const bonus = combatant.initiativeBonus;
  const detail =
    current !== undefined
      ? rolledLine(current, bonus ?? 0)
      : pc
        ? [
            bonus === null ? undefined : `Init ${signed(bonus)}`,
            combatant.playerName,
            combatant.initiativeSetBy === "player" ? "sent from their table" : undefined,
          ]
            .filter((part) => part !== undefined && part !== null && part !== "")
            .join(" · ")
        : `d20 ${signed(bonus ?? 0)}`;
  const name = combatant.displayName;

  return (
    <li
      aria-label={name}
      className={`flex min-h-row items-center gap-2.5 border-b border-hairline py-1 pr-3 pl-panel ${
        selected ? "bg-surface-raised" : ""
      }`}
    >
      <Icon
        name={pc ? "shield" : "skull"}
        size={15}
        className={`shrink-0 ${pc ? "text-info" : "text-danger"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {/* The name opens the row on the selected card, where it is edited
              or removed; the number is the box beside it. */}
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="min-w-0 cursor-pointer truncate rounded-control text-left text-body-s leading-snug font-semibold text-heading outline-none focus-visible:ring-focus"
          >
            {name}
          </button>
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
        {detail !== "" && (
          <div
            className={`truncate text-caption leading-snug text-muted-foreground ${
              pc && current === undefined ? "" : "font-mono"
            }`}
          >
            {detail}
          </div>
        )}
      </div>
      <Input
        mono
        inputMode="numeric"
        placeholder="–"
        aria-label={`${name} initiative`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={draft ?? (combatant.initiative === null ? "" : String(combatant.initiative))}
        // The drawing's filter: digits and a minus, three characters.
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9-]/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={`w-15 shrink-0 text-center ${
          current?.face === 20 ? "text-success" : current?.face === 1 ? "text-danger" : ""
        }`}
      />
      {onRoll === undefined ? (
        // Holds the column so every box lines up.
        <span className="size-control shrink-0" aria-hidden />
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={pc ? `Roll for ${name}` : `Reroll ${name}`}
                disabled={disabled}
                onClick={onRoll}
                className="shrink-0"
              >
                <Icon name={pc ? "dice-5" : "refresh-cw"} size={14} />
              </Button>
            }
          />
          <TooltipContent>{pc ? "Roll for them" : "Reroll"}</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

export function InitiativePhase({
  path,
  run,
  combatants,
  selectedId,
  disabled,
  starting,
  onSelect,
  onAdd,
  onWritten,
  onBegin,
}: {
  readonly path: RunPath;
  readonly run: EncounterRun;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly selectedId: CombatantId | undefined;
  readonly disabled: boolean;
  /** *Start round N* is in flight. */
  readonly starting: boolean;
  readonly onSelect: (combatant: Combatant) => void;
  readonly onAdd: () => void;
  /** A number landed; the list is re-read, since the order moved. */
  readonly onWritten: () => void;
  readonly onBegin: () => void;
}) {
  const write = useMutation();
  // The drawing's default: every goblin archer on one d20. A preference of
  // this screen's, not the fight's, so it is not sent anywhere.
  const [grouped, setGrouped] = useState(true);
  const [rolled, setRolled] = useState<ReadonlyMap<CombatantId, Rolled>>(() => new Map());

  const party = combatants.filter((row) => row.kind === "pc").sort(byName);
  const monsters = combatants.filter((row) => row.kind === "npc").sort(byName);
  const shared = run.visibility === "shared";
  const ready = combatants.length > 0 && combatants.every((row) => row.initiative !== null);

  const send = async (entries: ReadonlyArray<InitiativeEntry>): Promise<boolean> => {
    const sent = await write.submit(
      (client) =>
        client.runs.setInitiative({
          params: path,
          payload: { entries: [...entries], requestId: newRequestId() },
        }),
      // Initiative is the fight's alone, and the fight is re-read by the
      // controller rather than by an atom.
      [],
    );
    if (Result.isFailure(sent)) return false;
    onWritten();
    return true;
  };

  /**
   * A d20 plus its bonus for each row, in one write. With `grouped`, rows of
   * one bestiary creature share a d20 (and so a total); a row added by hand
   * has no creature and rolls its own.
   */
  const roll = (rows: ReadonlyArray<Combatant>, shareByCreature: boolean) => {
    if (rows.length === 0) return;
    const faces = new Map<string, number>();
    const results = rows.map((row) => {
      const key = shareByCreature ? row.creatureId : null;
      const face = key === null ? d20() : (faces.get(key) ?? d20());
      if (key !== null) faces.set(key, face);
      return { row, face, total: face + (row.initiativeBonus ?? 0) };
    });
    setRolled((current) => {
      const next = new Map(current);
      for (const { row, face, total } of results) next.set(row.id, { face, total });
      return next;
    });
    void send(results.map(({ row, total }) => ({ combatantId: row.id, initiative: total })));
  };

  const anyMonsterRolled = monsters.some((row) => row.initiative !== null);

  const rowFor = (combatant: Combatant) => (
    <PhaseRow
      key={combatant.id}
      combatant={combatant}
      rolled={rolled.get(combatant.id)}
      shared={shared}
      selected={combatant.id === selectedId}
      disabled={disabled}
      onSelect={() => onSelect(combatant)}
      onCommit={(initiative) => send([{ combatantId: combatant.id, initiative }])}
      onRoll={
        combatant.kind === "pc" && combatant.initiativeBonus === null
          ? undefined
          : () => roll([combatant], false)
      }
    />
  );

  return (
    // `clip` keeps the rows inside the card's corners without making the card
    // a scroll container: the window scrolls it, as it does the list.
    <Card
      role="region"
      aria-label="Roll initiative"
      className="overflow-clip border-t-3 border-t-accent"
    >
      <div className="flex flex-col gap-2.5 border-b border-hairline px-panel pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="dices" size={16} className="text-accent-ink" />
          <SectionHeading as="h2" size="title">
            Roll initiative
          </SectionHeading>
        </div>
        <p className="mb-0 text-body-s leading-body text-muted-foreground">
          Ask the table for their totals, or let them send their own. You roll for the monsters.
        </p>
        {monsters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => roll(monsters, grouped)}
            >
              <Icon name="dices" size={13} />
              {anyMonsterRolled ? "Reroll monsters" : "Roll for monsters"}
            </Button>
            <span className="flex items-center gap-2">
              <Switch
                id="run-group-roll"
                checked={grouped}
                disabled={disabled}
                onCheckedChange={(next) => setGrouped(next)}
              />
              <Label htmlFor="run-group-roll">One roll per creature type</Label>
            </span>
          </div>
        )}
      </div>

      {combatants.length === 0 ? (
        <p className="px-panel py-8 text-center text-body-s leading-body text-muted-foreground">
          Nobody is in the order. Add whoever is at the table, or end the fight and start one with a
          roster.
        </p>
      ) : (
        <>
          {party.length > 0 && (
            <>
              <p className="mb-0 px-panel pt-2 pb-1 text-caption leading-none font-medium text-muted-foreground">
                Party
              </p>
              <ul aria-label="Party">{party.map(rowFor)}</ul>
            </>
          )}
          {monsters.length > 0 && (
            <>
              <p className="mb-0 px-panel pt-3.5 pb-1 text-caption leading-none font-medium text-muted-foreground">
                Monsters
              </p>
              <ul aria-label="Monsters">{monsters.map(rowFor)}</ul>
            </>
          )}
        </>
      )}

      <div className="flex flex-col gap-2 px-panel pt-3.5 pb-4">
        {write.failure !== undefined && <SaveFailure failure={write.failure} />}
        <Button disabled={disabled || starting || !ready} onClick={onBegin} className="w-full">
          <Icon name="swords" size={14} />
          {starting ? "Starting…" : `Start round ${String(run.round)}`}
        </Button>
        <p className="mb-0 text-center text-caption leading-snug text-faint">
          {combatants.length === 0 ? "Add somebody to start." : startHint(party, monsters)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onAdd}
          className="self-start"
        >
          <Icon name="plus" size={13} />
          Add combatant
        </Button>
      </div>
    </Card>
  );
}
