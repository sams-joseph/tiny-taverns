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
import { type WheelEvent, useEffect, useRef } from "react";
import { apiUrl } from "../api/client";
import { DrawnImage } from "../hob/DrawnImage";
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
 * drawn: every chip is a button the keyboard reaches, scrolled into view as it
 * takes focus; whoever is up is scrolled into view when the turn moves; and on
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

  const scroller = useRef<HTMLOListElement>(null);
  const activeId = run.activeCombatantId;
  useEffect(() => {
    if (activeId === null) return;
    const chip = scroller.current?.querySelector<HTMLElement>(`[data-combatant="${activeId}"]`);
    // `nearest` moves the strip only when the chip is off it, and never the page.
    chip?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  // A mouse wheel has no sideways axis, and on the canvas nothing scrolls
  // down under it: the wheel walks the strip along instead.
  const walk = (event: WheelEvent<HTMLOListElement>) => {
    const strip = event.currentTarget;
    if (!floating || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += event.deltaY;
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
        <span className="text-title leading-none font-semibold text-heading">{run.round}</span>
      </div>

      {combatants.length === 0 ? (
        <p className="mb-0 min-w-0 flex-1 text-body-s leading-snug text-muted-foreground">
          Nobody is in the order. Add whoever is at the table, or end the fight and start one with a
          roster.
        </p>
      ) : (
        <ol
          ref={scroller}
          aria-label="Initiative order"
          onWheel={walk}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]"
        >
          {combatants.map((combatant) => (
            <li key={combatant.id} className="flex min-w-28 max-w-37.5 flex-1 basis-0">
              <StripChip
                combatant={combatant}
                label={labels.get(combatant.id) ?? "?"}
                hp={hpOf(combatant)}
                active={combatant.id === activeId}
                selected={combatant.id === selectedId}
                hidden={shared && combatant.visibility === "dm"}
                unplaced={board && combatant.position === null}
                onSelect={() => onSelect(combatant)}
              />
            </li>
          ))}
        </ol>
      )}

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
    </section>
  );
}

function StripChip({
  combatant,
  label,
  hp,
  active,
  selected,
  hidden,
  unplaced,
  onSelect,
}: {
  readonly combatant: Combatant;
  readonly label: string;
  readonly hp: number;
  readonly active: boolean;
  readonly selected: boolean;
  /** Held back from players while they can see the fight. */
  readonly hidden: boolean;
  /** On a fight with a board, and not on it. */
  readonly unplaced: boolean;
  readonly onSelect: () => void;
}) {
  const out = outOfTheFight(combatant, hp);
  const party = combatant.kind === "pc";
  const max = combatant.hpMax;
  const name = [
    combatant.displayName,
    `initiative ${combatant.initiative === null ? "not rolled" : String(combatant.initiative)}`,
    `${String(hp)} of ${String(max)} hit points`,
    combatant.ac === null ? undefined : `AC ${String(combatant.ac)}`,
    combatant.conditions.length === 0 ? undefined : combatant.conditions.join(", "),
    active ? "up now" : undefined,
    out ? "out of the fight" : undefined,
    hidden ? "hidden from players" : undefined,
    unplaced ? "not on the board" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(", ");

  return (
    <button
      type="button"
      data-combatant={combatant.id}
      aria-label={name}
      aria-pressed={selected}
      aria-current={active ? "step" : undefined}
      onClick={onSelect}
      // The browser's own focus scroll can stop short of the strip's end.
      onFocus={(event) =>
        event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" })
      }
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
        {combatant.initiative ?? "—"}
      </span>
      <StripDisc
        label={label}
        party={party}
        hidden={hidden}
        conditions={combatant.conditions.length}
        portrait={party && combatant.portrait !== null ? combatant.portrait.thumbUrl : undefined}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "min-w-0 truncate text-label leading-none font-semibold text-heading",
              out && "line-through",
            )}
          >
            {combatant.displayName}
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
        <span className="flex items-center gap-1.5">
          <HpBar fraction={max <= 0 ? 0 : hp / max} className="h-1 min-w-0 flex-1" />
          <span
            className={cn(
              "font-mono text-micro leading-none whitespace-nowrap",
              hp === 0 ? "text-danger" : "text-muted-foreground",
            )}
          >
            {hp}/{max}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The drawing's disc: the board's initials, ringed in the side's colour — the
 * party's info, everyone else's danger — and dashed while held back from
 * players. A PC's portrait, when its seat lets the DM see one, is laid over the
 * initials, which stand under one still loading or failed (`DrawnImage`).
 * The conditions it carries are counted on its shoulder, as the drawing counts
 * them on a token; the words are the selected card's and the chip's name.
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
