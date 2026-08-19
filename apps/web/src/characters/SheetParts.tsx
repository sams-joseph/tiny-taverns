import type { Ability } from "@taverns/api";
import { Badge, Card, cn } from "@taverns/ui";
import type { ReactNode } from "react";
import { hpFraction, initialsOf } from "./sheet";

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
      <div className="flex items-center gap-2.5 border-b border-hairline px-card py-2.5">
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
  readonly size?: "sm" | "lg";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center border border-strong bg-accent-soft font-display leading-none font-semibold text-accent-ink",
        size === "lg" ? "size-16 text-display-m" : "size-13 text-display-s",
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
