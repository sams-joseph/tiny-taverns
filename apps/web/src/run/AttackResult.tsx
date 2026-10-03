import { Button, Icon, cn } from "@taverns/ui";
import { damageLine, hitLine, lands, VERDICT, type AttackOutcome } from "./attack";

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
 * die, the save a concentrating target owes, and *Apply* / *Half* / *Dismiss*.
 * *Apply* and *Half* send the damage through the panel's own write, once; the
 * card stays, without them, until it is dismissed or the turn moves.
 */
export function AttackResultCard({
  outcome,
  applied,
  concentrationDc,
  disabled,
  onApply,
  onDismiss,
}: {
  readonly outcome: AttackOutcome;
  /** The damage was sent, whole or halved. */
  readonly applied: boolean;
  /** The save a concentrating target owes for what was, or would be, sent. */
  readonly concentrationDc: number | undefined;
  /** The fight is over or a dialog holds the screen. */
  readonly disabled: boolean;
  /** Half rounds down, as the SRD does. */
  readonly onApply: (amount: number) => void;
  readonly onDismiss: () => void;
}) {
  const landed = lands(outcome.verdict);
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
      {concentrationDc !== undefined && (
        <p className="mb-0 text-caption leading-snug text-magic-ink">
          {outcome.target} is concentrating. Con save DC {concentrationDc}.
        </p>
      )}
      <div className="flex items-center gap-1.5">
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
      </div>
    </section>
  );
}
