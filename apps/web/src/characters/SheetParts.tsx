import type { Ability } from "@taverns/api";
import { Badge, Card, cn, Icon } from "@taverns/ui";
import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { hpFraction, initialsOf, type SheetSectionId, type SheetSectionSpec } from "./sheet";

/**
 * `ui_kits/dm-screen/PlayerParts.jsx` in shipped components and theme names.
 *
 * **A control here is drawn live exactly when there is a write behind it, and
 * drawn as a value when there is not.** Since `PATCH /me/characters/:id` landed
 * that line runs through the middle of the drawing rather than around it: the
 * document is writable, so the prototype's clickable `DeathSaves` are real
 * buttons here — but its `AbilityBlock` rolls a check into a dice tray the
 * product has no endpoint for, its `Portrait` uploads to nowhere, and spending
 * a spell pip has no drawn place to put the result, so those three stay the
 * information they carry. A control that looks live and does nothing is worse
 * than an absent one, and that has not changed; what changed is which ones are
 * live.
 *
 * `Portrait` and `Seat` are two different plates in the delivery: a character's
 * and a person's. Only the first is here, because these two screens draw
 * characters. `party/RosterCard.tsx` is where the other one lives.
 */

/**
 * A titled block. Everything on the sheet is one of these, so the sheet reads as
 * one grid rather than a pile of cards.
 *
 * Not `Card` + `CardHeader`: the delivery's header is a `--pad-card` row with a
 * hairline under it and an 11px caps label, which is a different recipe from the
 * card title `CardHeader` draws. The surface underneath is the same one `Card`
 * uses, named through the same tokens.
 */
export function SheetSection({
  title,
  aside,
  action,
  children,
  className,
}: {
  readonly title: string;
  /** The muted right-hand note — a spell save DC, a count. Never a control. */
  readonly aside?: ReactNode;
  /**
   * The delivery's own header slot, and the one place a section's write lives:
   * *Edit* on the backstory, *Add* on the carried list. Kept apart from `aside`
   * because the two are different promises — one is something to read, the
   * other something to press — and a section that offered both would put them
   * in the same 2.5 gap and let the eye pick.
   */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={className}>
      {/* `flex-wrap`, so a header carrying two actions drops them under the
          title in a narrow column rather than squeezing the title against them. */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-card py-2.5">
        <h2 className="flex-1 text-label-s leading-none font-semibold tracking-caps uppercase text-muted-foreground">
          {title}
        </h2>
        {aside}
        {action}
      </div>
      <div className="p-card">{children}</div>
    </Card>
  );
}

/**
 * The lettered plate. There is no art in the system and none on the row, so this
 * is honest about being a placeholder — and, unlike the drawing, it carries no
 * upload button, because there is nothing behind one.
 */
export function Portrait({
  name,
  size = "sm",
}: {
  readonly name: string;
  /** `xs` is the 40px plate of the narrow sheet's summary header. */
  readonly size?: "xs" | "sm" | "lg";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center border border-strong bg-accent-soft font-display leading-none font-semibold text-accent-ink",
        size === "lg"
          ? "size-16 text-display-m"
          : size === "xs"
            ? "size-10 text-title"
            : "size-13 text-display-s",
      )}
    >
      {initialsOf(name)}
    </div>
  );
}

/** A small labelled number — AC, speed, initiative, proficiency. */
export function StatPill({
  label,
  value,
  accent = false,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 border border-hairline bg-surface-sunken px-1 py-2">
      <span
        className={cn(
          "font-display text-display-s leading-tight font-semibold",
          accent ? "text-accent-ink" : "text-heading",
        )}
      >
        {value}
      </span>
      <span className="text-micro leading-none font-medium tracking-caps uppercase text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/**
 * Where they are, right now — the live half of the row since `0014`.
 *
 * The bar is drawn only when there is a maximum to draw it against. `hpCurrent`
 * null means *nobody has said*, so the number shown is the maximum and the bar
 * is full: that is what every reader in the product substitutes, and it is the
 * one place a substitution is right, because a fight seeds from the same value.
 */
export function HpTrack({
  current,
  max,
  temp,
  hitDice,
}: {
  readonly current: number | null;
  readonly max: number | null;
  readonly temp: number;
  readonly hitDice?: string;
}) {
  const fraction = hpFraction(current, max);
  const shown = current ?? max;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        {shown !== null && (
          <span className="font-display text-display-m leading-none font-semibold text-heading">
            {shown}
          </span>
        )}
        {max !== null && (
          <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
            / {max} hp
          </span>
        )}
        {temp > 0 && <Badge variant="info">+{temp} temp</Badge>}
        {hitDice !== undefined && hitDice !== "" && (
          <span className="ml-auto text-micro leading-none text-faint">Hit dice {hitDice}</span>
        )}
      </div>
      {fraction !== undefined && (
        <div className="h-2 overflow-hidden rounded-pill bg-surface-sunken">
          <div
            className={cn(
              "h-full",
              fraction === 0
                ? "bg-crimson-400"
                : fraction <= 0.34
                  ? "bg-danger"
                  : fraction <= 0.67
                    ? "bg-accent"
                    : "bg-success",
            )}
            style={{ width: `${String(Math.round(fraction * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One ability cell — the modifier big, the score under it, the saving throw
 * beneath that.
 *
 * A `<div>` and not the delivery's `<button>`: the press rolls a check into the
 * DM's dice tray, and there is no dice tray. `bestiary/StatBlock.tsx` made the
 * same call about a monster's rollable trait and for the same reason — the
 * notation is rendered as what it is, something you read.
 */
export function AbilityCell({ ability }: { readonly ability: Ability }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-sm border border-hairline bg-surface-sunken px-1 pt-2.5 pb-2">
      <span className="text-micro leading-none font-semibold tracking-caps text-muted-foreground">
        {ability.label}
      </span>
      <span className="font-display text-display-m leading-tight font-semibold text-heading">
        {ability.modifier}
      </span>
      <span className="font-mono text-micro leading-none text-faint">{ability.score}</span>
      {ability.save !== undefined && ability.save !== "" && (
        <span
          className={cn(
            "mt-1 flex items-center gap-1 text-micro leading-none",
            ability.proficient === true ? "text-accent-ink" : "text-faint",
          )}
        >
          <Mark on={ability.proficient === true} />
          save {ability.save}
        </span>
      )}
    </div>
  );
}

/**
 * The filled-or-not dot the sheet uses everywhere a boolean is drawn rather than
 * written: a proficient skill, a proficient save, a prepared spell.
 *
 * `aria-hidden`, because in every place it is used the row beside it already
 * names what it is marking and a screen reader hearing "bullet" learns nothing.
 * The rows carry the meaning in words instead.
 */
export function Mark({
  on,
  tone = "accent",
}: {
  readonly on: boolean;
  readonly tone?: "accent" | "magic";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-pill border",
        on
          ? tone === "magic"
            ? "border-magic bg-magic"
            : "border-accent bg-accent"
          : "border-strong bg-transparent",
      )}
    />
  );
}

/**
 * Three up, three down — **pressable, because a death save is the player's own
 * to mark.**
 *
 * It is a `deathSaves` key on the sheet document rather than a column, and that
 * has not moved: `Character.ts` argues it at length, and the reason is still
 * that **no delivery of `EncounterRunner.jsx` draws one**, so there is no second
 * holder for a column to be kept in step with. What did move is who may write
 * the document — `PATCH /me/characters/:id` — so the drawing's buttons are real
 * here where the rest of its write affordances still are not.
 *
 * **The drawing's promise beside them is not repeated.** `CharacterSheet.jsx`
 * says the marks *"show on your DM's initiative row straight away"* and nothing
 * reads them, so the screen says what is true instead. The DM-side read is its
 * own piece of work; a sentence here cannot stand in for it.
 *
 * Pressing the pip that is already the last filled one clears it, which is
 * `PlayerParts.jsx`'s own rule and the only way back from a mis-tap: with three
 * pips and no undo, a fourth control would be a fourth thing to hit by mistake.
 */
export function DeathSaveRow({
  label,
  count,
  tone,
  onMark,
  busy = false,
}: {
  readonly label: string;
  readonly count: number;
  readonly tone: "success" | "danger";
  /** Absent, and the row is what the document holds and nothing more. */
  readonly onMark?: (next: number) => void;
  readonly busy?: boolean;
}) {
  const fill = (pip: number) =>
    cn(
      "size-4 rounded-pill border",
      pip <= count
        ? tone === "success"
          ? "border-success bg-success"
          : "border-danger bg-danger"
        : "border-strong bg-transparent",
    );

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-micro leading-none text-muted-foreground">{label}</span>
      {onMark === undefined ? (
        <span className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((pip) => (
            <span key={pip} className={fill(pip)} />
          ))}
        </span>
      ) : (
        <span className="flex gap-1.5">
          {[1, 2, 3].map((pip) => (
            <button
              key={pip}
              type="button"
              disabled={busy}
              // Named rather than marked: the pips carry no text, so the label
              // is the only thing a screen reader has, and `aria-pressed` is
              // what says which of the three are filled.
              aria-label={`${label} ${String(pip)}`}
              aria-pressed={pip <= count}
              onClick={() => onMark(pip === count ? pip - 1 : pip)}
              className={cn(
                fill(pip),
                "cursor-pointer transition-control hover:border-strong disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-focus",
              )}
            />
          ))}
        </span>
      )}
      <span className="sr-only">
        {count} of 3 {label.toLowerCase()}
      </span>
    </div>
  );
}

/** A labelled line of prose — the Story tab's bond, ideal, flaw, personality. */
export function KeyVal({ k, v }: { readonly k: string; readonly v: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5">
      <span className="w-24 shrink-0 text-micro leading-body tracking-caps uppercase text-faint">
        {k}
      </span>
      <span className="min-w-0 flex-1 text-body-s leading-body text-foreground">{v}</span>
    </div>
  );
}

/**
 * The spine — the continuous sheet's table of contents, and the one place the
 * seventh delivery draws two controls for one job.
 *
 * `CharacterSheetB.jsx`'s `Spine` is a vertical list in the sticky right
 * column; its `SpineRail` is a sticky horizontal row of pills under the summary
 * header. **They are one `nav` here, restyled by the column's width**, and that
 * is a jsdom decision as much as a layout one: two elements would put every
 * section's button in the tree twice, and a test that asked for *Gear & coin*
 * would find two of them with no way to say which is the drawn one. The
 * accessible name is the long label either way (`aria-label`); the visible word
 * is the short one on the rail, where seven long labels will not fit, and the
 * long one on the spine.
 *
 * The container is the shell's `main`, so the same `@3xl` that turns the sheet
 * into three columns turns this from a rail into a spine — one threshold, not
 * two kept in step. Sticky in both shapes, at the top of the scroller the screen
 * owns: on the rail that means a page-coloured band the document slides under
 * (bled to the page edge, as the drawing does), on the spine it means the column
 * stays put while the document scrolls beside it.
 *
 * `aria-current` says which section is lit; the screen's scroll-spy sets it and
 * a press on an item asks the screen to scroll there. The nav writes nothing and
 * scrolls nothing itself — `onGo` is the whole of what a press does — so the
 * only measurement it makes is its own: it keeps the lit pill in view on the
 * rail, which is a fact about this element and nothing outside it.
 */
export function SectionSpine({
  sections,
  active,
  onGo,
  ref,
}: {
  readonly sections: ReadonlyArray<SheetSectionSpec>;
  readonly active: SheetSectionId;
  readonly onGo: (id: SheetSectionId) => void;
  /** The screen measures the rail's height to scroll a section clear of it. */
  readonly ref?: Ref<HTMLElement>;
}) {
  const own = useRef<HTMLElement>(null);
  // Keep the lit pill in view on the rail. Pure decoration on the spine, where
  // nothing overflows, so the guard is "is there anything to scroll" rather than
  // "which shape" — and it runs only when the marker moves, not on every render,
  // so it never fights a thumb that is scrolling the rail by hand.
  useEffect(() => {
    const rail = own.current;
    const lit = rail?.querySelector<HTMLElement>("[data-active]");
    if (
      rail === null ||
      lit === null ||
      lit === undefined ||
      rail.scrollWidth <= rail.clientWidth ||
      typeof rail.scrollTo !== "function"
    ) {
      return;
    }
    rail.scrollTo({
      left: lit.offsetLeft - (rail.clientWidth - lit.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [active]);

  return (
    <nav
      ref={(element) => {
        own.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref !== undefined && ref !== null) ref.current = element;
      }}
      aria-label="Sheet sections"
      className={cn(
        // The rail: a sticky band across the document column, bled to the page
        // edge so the pills can scroll off it, on the page's own surface so the
        // sheet visibly slides underneath.
        // Second of the three flex items narrow (card, rail, document) and
        // third wide (card, document, spine) — the drawing's two orders, held
        // here so the document needs only its own pair.
        "sticky top-0 z-chrome order-2 -mx-page-sm flex gap-1.5 overflow-x-auto border-b border-hairline bg-surface-page px-page-sm py-2 [scrollbar-width:none] sm:-mx-page sm:px-page",
        // The spine: a plain column with no band and no bleed, sized as the
        // delivery's third grid track.
        "@3xl:z-auto @3xl:order-3 @3xl:mx-0 @3xl:w-46.5 @3xl:shrink-0 @3xl:flex-col @3xl:gap-px @3xl:overflow-visible @3xl:border-b-0 @3xl:bg-transparent @3xl:px-0 @3xl:py-0",
      )}
    >
      {sections.map((section) => {
        const lit = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            aria-label={section.label}
            aria-current={lit ? "true" : undefined}
            data-active={lit ? "true" : undefined}
            onClick={() => onGo(section.id)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 text-left text-caption leading-none transition-control focus-visible:outline-none focus-visible:ring-focus",
              // A pill on the rail.
              "min-h-8.5 rounded-pill border px-3",
              lit
                ? "border-accent bg-accent-soft font-medium text-accent-ink"
                : "border-hairline bg-surface-sunken font-medium text-muted-foreground hover:text-foreground",
              // A raised row on the spine, the lit one bordered by a hairline.
              "@3xl:min-h-0 @3xl:rounded-none @3xl:px-2.25 @3xl:py-1.75",
              lit
                ? "@3xl:border-hairline @3xl:bg-surface-raised @3xl:font-semibold @3xl:text-heading"
                : "@3xl:border-transparent @3xl:bg-transparent @3xl:font-normal @3xl:text-muted-foreground",
            )}
          >
            <Icon
              name={section.icon}
              size={12}
              className={cn("shrink-0", lit ? "text-accent-ink" : "text-faint")}
            />
            <span aria-hidden="true" className="@3xl:hidden">
              {section.short}
            </span>
            <span aria-hidden="true" className="hidden @3xl:inline">
              {section.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
