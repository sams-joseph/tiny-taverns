import type { Combatant, CombatantId, EncounterRun } from "@taverns/api";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HpBar,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@taverns/ui";
import { type ReactNode, type WheelEvent, useEffect, useRef } from "react";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
import { wheelUnit } from "./canvas";
import { outOfTheFight } from "./load";

/**
 * The initiative while the fight takes turns: the encounter runner drawing's
 * strip (`Encounter Runner.dc.html`), a row of chips in the server's order with
 * the round boxed at its head. On the canvas it floats across the top of the
 * board (`RunStage.tsx`); in the narrow grid it heads the page
 * (`RunLayout.tsx`). While the fight rolls initiative *Roll initiative*
 * (`InitiativePhase.tsx`) stands in for it.
 *
 * - **The order is the server's**, unsorted: it is what `nextTurn` walks, so a
 *   second sort here could disagree with the marker.
 * - **Zero hit points is a state, not a removal.** An NPC at zero, or a PC
 *   with three failed death saves, is faded and struck through where it stands
 *   (`outOfTheFight`). A PC at zero who is still making death saves is not:
 *   they still take a turn, and the DM still has to look at them.
 * - **A chip selects.** It opens that creature on the selected card; *Next
 *   turn* puts the selection back on whoever is up (`RunScreen.tsx`).
 * - **The hidden ring only marks something worth marking.** Every row defaults
 *   to `dm`, so while the fight itself is not shared every ring would be
 *   dashed and none would say anything; once it is, the rows *still* held back
 *   are the exception, and those wear the dashed ring.
 * - **A token nobody has put down is marked**, on a fight with a board, so
 *   the DM can find who still needs a square: select the chip, then click one.
 *
 * Too many chips for the width scroll sideways with the scrollbar hidden, as
 * drawn: every chip is a button the keyboard reaches, brought onto the strip as
 * it takes focus; whoever is up is brought onto it when the turn moves; and on
 * the canvas, where no page scrolls under the pointer, a wheel walks the strip
 * along. In the window-scrolling grid the wheel stays the page's, and a
 * trackpad, a finger or shift and the wheel scroll the strip sideways.
 */
export function InitiativeStrip({
  run,
  combatants,
  labels,
  hpOf,
  selectedId,
  board,
  floating,
  disabled,
  onSelect,
  onAdd,
  onReroll,
}: {
  readonly run: EncounterRun;
  readonly combatants: ReadonlyArray<Combatant>;
  /** The board's initials for each row (`tokenLabels`), so a chip and its token read alike. */
  readonly labels: ReadonlyMap<CombatantId, string>;
  readonly hpOf: (combatant: Combatant) => number;
  readonly selectedId: CombatantId | undefined;
  /** Whether the fight has a board, which is what makes a token nobody put down worth a mark. */
  readonly board: boolean;
  /** Over the canvas (`RunStage.tsx`) rather than heading the page, so a wheel is the strip's. */
  readonly floating: boolean;
  readonly disabled: boolean;
  readonly onSelect: (combatant: Combatant) => void;
  readonly onAdd: () => void;
  /**
   * Back to rolling initiative, numbers kept, where *Roll initiative* takes the
   * strip's place. Offered while turns are taken.
   */
  readonly onReroll: () => void;
}) {
  const shared = run.visibility === "shared";
  const held = combatants.filter((combatant) => combatant.visibility === "dm").length;
  const standing = combatants
    .filter((combatant) => combatant.kind === "npc")
    .filter((combatant) => hpOf(combatant) > 0).length;
  const rows = combatants.map((combatant): StripRow => {
    const hp = hpOf(combatant);
    return {
      id: combatant.id,
      displayName: combatant.displayName,
      initiative: combatant.initiative,
      party: combatant.kind === "pc",
      health: { hp, max: combatant.hpMax },
      ac: combatant.ac,
      conditions: combatant.conditions,
      portrait:
        combatant.kind === "pc" && combatant.portrait !== null
          ? combatant.portrait.thumbUrl
          : undefined,
      out: outOfTheFight(combatant, hp),
      hidden: shared && combatant.visibility === "dm",
      unplaced: board && combatant.position === null,
    };
  });
  const byId = new Map(combatants.map((combatant) => [combatant.id, combatant]));

  return (
    <StripFrame
      round={run.round}
      rows={rows}
      labels={labels}
      activeId={run.activeCombatantId}
      selectedId={selectedId}
      floating={floating}
      empty="Nobody is in the order. Add whoever is at the table, or end the fight and start one with a roster."
      onSelect={(row) => {
        const combatant = byId.get(row.id);
        if (combatant !== undefined) onSelect(combatant);
      }}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Add combatant"
                disabled={disabled}
                onClick={onAdd}
                className="h-13 w-9 border-dashed"
              >
                <Icon name="plus" size={16} />
              </Button>
            }
          />
          <TooltipContent>Add combatant</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More about the order"
            render={<Button variant="ghost" size="icon" className="h-13 w-9" />}
          >
            <Icon name="ellipsis" size={16} className="pointer-events-none" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-72">
            {/* What the vertical list said under its rows, kept one press away:
                the two visibility levels in one sentence, and who is left. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="h-auto py-1.5 whitespace-normal">
                {standing} {standing === 1 ? "hostile" : "hostiles"} standing.{" "}
                {visibilitySentence(shared, held, combatants.length)}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {run.phase === "turns" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={disabled} onClick={onReroll}>
                  <Icon name="refresh-cw" size={14} className="pointer-events-none" />
                  Reroll initiative
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </StripFrame>
  );
}

/**
 * A row of the strip, whoever's strip it is: the DM's, from a `Combatant`, or a
 * seated player's, from a row of their order (`play/PlayerStrip.tsx`). Each
 * caller says only what its reader may know — a player's strip has a band for
 * a creature's health and no armour class but their own.
 */
export interface StripRow {
  readonly id: CombatantId;
  readonly displayName: string;
  readonly initiative: number | null;
  /** The party's colour rather than everyone else's. */
  readonly party: boolean;
  /** Exact hit points, or the word a player is told for a creature's (`PlayerLiveHpBand`). */
  readonly health:
    | { readonly hp: number; readonly max: number }
    | { readonly band: string; readonly down: boolean };
  readonly ac: number | null;
  readonly conditions: ReadonlyArray<string>;
  readonly portrait: string | undefined;
  /** Faded and struck through (`outOfTheFight`). */
  readonly out: boolean;
  /** Held back from players while they can see the fight: the DM's ring, dashed. */
  readonly hidden: boolean;
  /** On a fight with a board, and not on it. */
  readonly unplaced: boolean;
  /** Said in its accessible name after the name: `"you"`. */
  readonly note?: string;
}

/**
 * The strip itself: the round, boxed, then a chip per row in the order given,
 * with whatever the caller adds at its end (the DM's *Add* and menu). Read-only
 * but for selection, so a player's table draws the same strip as the DM's.
 */
export function StripFrame({
  round,
  rows,
  labels,
  activeId,
  selectedId,
  floating,
  empty,
  onSelect,
  children,
}: {
  readonly round: number;
  readonly rows: ReadonlyArray<StripRow>;
  readonly labels: ReadonlyMap<CombatantId, string>;
  readonly activeId: CombatantId | null;
  readonly selectedId: CombatantId | undefined;
  readonly floating: boolean;
  /** What an empty order says. */
  readonly empty: string;
  readonly onSelect: (row: StripRow) => void;
  readonly children?: ReactNode;
}) {
  const scroller = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (activeId === null) return;
    const chip = scroller.current?.querySelector<HTMLElement>(`[data-combatant="${activeId}"]`);
    if (chip) reveal(chip);
  }, [activeId]);

  // A mouse wheel has no sideways axis, and on the canvas nothing scrolls
  // down under it: the wheel walks the strip along instead.
  const walk = (event: WheelEvent<HTMLOListElement>) => {
    const strip = event.currentTarget;
    if (!floating || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += event.deltaY * wheelUnit(event);
  };

  return (
    <section
      aria-label="Initiative"
      data-slot="initiative-strip"
      className="flex min-w-0 items-center gap-2.5 rounded-card border border-strong bg-surface-card p-2 shadow-3"
    >
      <div
        data-slot="initiative-round"
        className="flex h-13 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-hairline bg-surface-sunken"
      >
        <span className="text-caption leading-none text-muted-foreground">Round</span>
        <span className="text-title leading-none font-semibold text-heading">{round}</span>
      </div>

      {rows.length === 0 ? (
        <p className="mb-0 min-w-0 flex-1 text-body-s leading-snug text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ol
          ref={scroller}
          aria-label="Initiative order"
          onWheel={walk}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]"
        >
          {rows.map((row) => (
            <li key={row.id} className="flex min-w-38 max-w-44 flex-1 basis-0">
              <StripChip
                row={row}
                label={labels.get(row.id) ?? "?"}
                active={row.id === activeId}
                selected={row.id === selectedId}
                onSelect={() => onSelect(row)}
              />
            </li>
          ))}
        </ol>
      )}

      {children}
    </section>
  );
}

function StripChip({
  row,
  label,
  active,
  selected,
  onSelect,
}: {
  readonly row: StripRow;
  readonly label: string;
  readonly active: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { out, hidden, unplaced, health } = row;
  const exact = "hp" in health;
  const down = exact ? health.hp === 0 : health.down;
  const name = [
    `${row.displayName}${row.note === undefined ? "" : ` (${row.note})`}`,
    `initiative ${row.initiative === null ? "not rolled" : String(row.initiative)}`,
    exact ? `${String(health.hp)} of ${String(health.max)} hit points` : health.band.toLowerCase(),
    row.ac === null ? undefined : `AC ${String(row.ac)}`,
    row.conditions.length === 0 ? undefined : row.conditions.join(", "),
    active ? "up now" : undefined,
    out ? "out of the fight" : undefined,
    hidden ? "hidden from players" : undefined,
    unplaced ? "not on the board" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(", ");

  const chip = (
    <button
      type="button"
      data-combatant={row.id}
      aria-label={name}
      aria-pressed={selected}
      aria-current={active ? "step" : undefined}
      onClick={onSelect}
      // The browser's own focus scroll can stop short of the strip's end.
      onFocus={(event) => reveal(event.currentTarget)}
      className={cn(
        "flex h-13 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-1.5 text-left",
        "transition-control outline-none focus-visible:ring-focus",
        active
          ? "border-accent bg-accent-soft"
          : selected
            ? "border-faint bg-surface-page"
            : "border-hairline bg-surface-page hover:bg-surface-raised",
        out && "opacity-45",
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-right font-mono text-mono leading-none font-medium",
          active ? "text-accent-ink" : "text-muted-foreground",
        )}
      >
        {row.initiative ?? "—"}
      </span>
      <span className="flex shrink-0 flex-col items-center gap-0.5">
        <StripDisc
          label={label}
          party={row.party}
          hidden={hidden}
          conditions={row.conditions.length}
          portrait={row.portrait}
        />
        {row.ac !== null && (
          <span
            aria-hidden="true"
            data-slot="strip-ac"
            className="text-micro leading-none whitespace-nowrap text-muted-foreground"
          >
            AC {row.ac}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1">
          <span
            data-slot="strip-name"
            className={cn(
              "min-w-0 truncate text-label leading-none font-semibold text-heading",
              out && "line-through",
            )}
          >
            {row.displayName}
          </span>
          {unplaced && (
            <Icon
              name="map-pin"
              size={11}
              data-slot="strip-unplaced"
              className="shrink-0 text-faint"
            />
          )}
        </span>
        {exact ? (
          <span className="flex items-center gap-1.5">
            <HpBar
              fraction={health.max <= 0 ? 0 : health.hp / health.max}
              className="h-1 min-w-0 flex-1"
            />
            <span
              className={cn(
                "font-mono text-micro leading-none whitespace-nowrap",
                down ? "text-danger" : "text-muted-foreground",
              )}
            >
              {health.hp}/{health.max}
            </span>
          </span>
        ) : (
          // A player is told a creature's band, never a number, so no bar
          // pretends to a fraction the table does not have.
          <span
            data-slot="strip-band"
            className={cn(
              "text-micro leading-none whitespace-nowrap",
              down ? "text-danger" : "text-muted-foreground",
            )}
          >
            {health.band}
          </span>
        )}
      </span>
    </button>
  );

  // The full name, which a crowded strip cuts short, and the conditions the
  // disc only counts.
  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent>{[row.displayName, ...row.conditions].join(", ")}</TooltipContent>
    </Tooltip>
  );
}

/** Scroll the strip, and never the page under it, so a chip stands whole on it. */
const reveal = (chip: HTMLElement) => {
  const strip = chip.closest("ol");
  if (strip === null) return;
  const box = strip.getBoundingClientRect();
  const at = chip.getBoundingClientRect();
  if (at.left < box.left) strip.scrollLeft -= box.left - at.left;
  else if (at.right > box.right) strip.scrollLeft += at.right - box.right;
};

/**
 * The drawing's disc: the board's initials, ringed in the side's colour — the
 * party's info, everyone else's danger — and dashed while held back from
 * players. A PC's portrait, when its seat lets the DM see one, is laid over the
 * initials, which stand under one still loading or failed (`DrawnImage`).
 * The conditions it carries are counted on its shoulder, as the drawing counts
 * them on a token; the chip's tooltip and accessible name say which.
 */
function StripDisc({
  label,
  party,
  hidden,
  conditions,
  portrait,
}: {
  readonly label: string;
  readonly party: boolean;
  readonly hidden: boolean;
  readonly conditions: number;
  readonly portrait: string | undefined;
}) {
  return (
    <span aria-hidden="true" className="relative shrink-0">
      <span
        data-slot="strip-disc"
        className={cn(
          "relative flex size-7 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-raised",
          "text-micro leading-none font-semibold text-heading",
          party ? "border-info" : "border-danger",
          hidden ? "border-dashed" : "border-solid",
        )}
      >
        {label}
        <DrawnImage
          src={portrait === undefined ? undefined : apiUrl(portrait)}
          className="object-top"
        />
      </span>
      {conditions > 0 && (
        <span
          data-slot="strip-conditions"
          className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-pill bg-magic px-0.5 font-mono text-micro leading-none font-semibold text-on-solid"
        >
          {conditions}
        </span>
      )}
    </span>
  );
}

/**
 * The two-level visibility state, in one sentence: the master switch first and
 * the per-row exceptions second, so the switch in the header can never imply
 * more than it does. All-hidden is written out rather than folded into the
 * middle case: "everyone but the 8" when there are 8 is arithmetic the DM should
 * not have to do to find their players are looking at an empty order.
 */
const visibilitySentence = (shared: boolean, held: number, total: number): string => {
  if (!shared) return "DM only — nothing here is on the players' screen.";
  if (held === 0) return "Players see everyone here.";
  if (held === total) return "Players see the fight, but every line in it is hidden from them.";
  return `Players see everyone but the ${String(held)} you are holding back.`;
};
