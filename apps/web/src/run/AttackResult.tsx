import { Button, Icon, cn } from "@taverns/ui";
import { attackLands } from "@taverns/api";
import { damageLine, hitLine, VERDICT, type AttackOutcome } from "./attack";

/**
 * The attack's two pieces of screen (`Encounter Runner.dc.html`): the banner
 * that asks for a target while one is being picked, and the result card on the
 * attacker's panel once one was.
 */

/** "Pick a target for Longsword", with the way out of it. */
export function TargetBanner({
  action,
  onCancel,
}: {
  readonly action: string;
  readonly onCancel: () => void;
}) {
  return (
    <div
      role="status"
      data-slot="run-target-banner"
      className="pointer-events-auto flex items-center gap-3 rounded-card border border-danger bg-surface-raised py-1.5 pr-1.5 pl-3.5 shadow-3"
    >
      <Icon name="crosshair" size={16} className="shrink-0 text-danger" />
      <span className="min-w-0 text-label leading-snug font-medium text-heading">
        Pick a target for {action}
      </span>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * What the attack came to: the verdict, the d20 against the AC, each damage
 * die, the save a concentrating target owes, and what was done with the damage.
 *
 * A hit applies itself (the maintainer's call of 2026-10-17, from `Encounter
 * Canvas.dc.html`): the runner sends the damage as it resolves, and the card
 * says what was sent with *Undo*, which heals back what the target lost, and
 * *Half instead* for a target that resists. Undone, or never sent, it offers
 * *Apply* / *Half*. Once the damage is sent, *Roll save* rolls the target's
 * Con save into the DM's dice. The card stays until it is dismissed or the
 * turn moves.
 */
export function AttackResultCard({
  outcome,
  applied,
  concentrationDc,
  disabled,
  onApply,
  onRollSave,
  onDismiss,
  range,
  next,
  sent,
  onUndo,
}: {
  readonly outcome: AttackOutcome;
  /** The damage was sent, whole or halved. */
  readonly applied: boolean;
  /** How much was sent, once it was. */
  readonly sent?: number | undefined;
  /** Take back what was sent; absent while it cannot be. */
  readonly onUndo?: (() => void) | undefined;
  /** The save a concentrating target owes for what was, or would be, sent. */
  readonly concentrationDc: number | undefined;
  /** The fight is over or a dialog holds the screen. */
  readonly disabled: boolean;
  /** Half rounds down, as the SRD does. */
  readonly onApply: (amount: number) => void;
  /** Offered once the damage is sent, for a target whose Con save is written, until rolled. */
  readonly onRollSave: (() => void) | undefined;
  readonly onDismiss: () => void;
  /**
   * Where the target stood against the line's reach and range, when it was not
   * plainly within them (`run/options.ts`). Said, never refused.
   */
  readonly range?: "out" | "long" | undefined;
  /** The next strike of a multiattack, while one is being run. */
  readonly next?: { readonly label: string; readonly onNext: () => void } | undefined;
}) {
  const landed = attackLands(outcome.verdict);
  return (
    <section
      aria-label={`Attack result, ${outcome.title}`}
      className={cn(
        "flex flex-col gap-2.5 rounded-md border bg-surface-page p-3",
        landed ? "border-accent" : "border-strong",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-body-s leading-snug font-semibold text-heading">
          {outcome.title}
        </span>
        <span
          className={cn(
            "shrink-0 text-body-s leading-none font-semibold",
            outcome.verdict === "critical"
              ? "text-success"
              : outcome.verdict === "natural-1"
                ? "text-danger"
                : landed
                  ? "text-accent-ink"
                  : "text-muted-foreground",
          )}
        >
          {VERDICT[outcome.verdict]}
        </span>
      </div>
      <div className="flex flex-col gap-1 font-mono text-caption leading-snug text-muted-foreground">
        <span>{hitLine(outcome)}</span>
        {landed && outcome.damage.length > 0 && <span>{damageLine(outcome.damage)}</span>}
      </div>
      {range !== undefined && (
        <p data-slot="attack-range" className="mb-0 text-caption leading-snug text-danger-ink">
          {range === "out"
            ? `${outcome.target} was beyond its reach and range.`
            : `${outcome.target} was at long range: the attack was rolled at disadvantage.`}
        </p>
      )}
      {concentrationDc !== undefined && (
        <div className="flex items-center gap-2">
          <p className="mb-0 min-w-0 flex-1 text-caption leading-snug text-magic-ink">
            {outcome.target} is concentrating. Con save DC {concentrationDc}.
          </p>
          {onRollSave !== undefined && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Roll ${outcome.target}'s Con save`}
              disabled={disabled}
              onClick={onRollSave}
            >
              <Icon name="dice-5" size={13} />
              Roll save
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {landed && applied && sent !== undefined && (
          <>
            <span
              data-slot="attack-sent"
              className="text-caption leading-snug font-medium text-danger-ink"
            >
              {sent} damage applied
            </span>
            {onUndo !== undefined && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={onUndo}>
                Undo
              </Button>
            )}
            {onUndo !== undefined && sent === outcome.amount && outcome.amount >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Half instead, ${String(Math.floor(outcome.amount / 2))} damage`}
                disabled={disabled}
                onClick={() => onApply(Math.floor(outcome.amount / 2))}
              >
                Half instead
              </Button>
            )}
          </>
        )}
        {landed && outcome.amount > 0 && !applied && (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={disabled}
              onClick={() => onApply(outcome.amount)}
            >
              Apply {outcome.amount} damage
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Apply half, ${String(Math.floor(outcome.amount / 2))} damage`}
              disabled={disabled || outcome.amount < 2}
              onClick={() => onApply(Math.floor(outcome.amount / 2))}
            >
              Half
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onDismiss}>
          Dismiss
        </Button>
        {next !== undefined && (
          <Button variant="outline" size="sm" disabled={disabled} onClick={next.onNext}>
            <Icon name="swords" size={13} />
            {next.label}
          </Button>
        )}
      </div>
    </section>
  );
}
