import type { EncounterRunCheck } from "@taverns/api";
import { Badge, Button, Icon, SectionHeading } from "@taverns/ui";
import { checkWhat } from "./scene";

/**
 * *Checks so far* — every check the DM logged in this scene, newest first,
 * each with the DC it was made against as it stood then.
 *
 * **Every line can be taken back.** The drawing has no undo, and a check
 * logged against the wrong character is a one-way door; removing it here is a
 * real delete on the log (the night's event log keeps that it happened), and a
 * skill challenge it settled reopens.
 */
export function ChecksLog({
  checks,
  disabled,
  onRemove,
}: {
  /** Oldest first, as the scene holds them. */
  readonly checks: ReadonlyArray<EncounterRunCheck>;
  readonly disabled: boolean;
  readonly onRemove: (check: EncounterRunCheck) => void;
}) {
  const newest = [...checks].reverse();
  return (
    <section
      aria-label="Checks so far"
      className="overflow-clip rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-3">
        <SectionHeading as="h2" size="title">
          Checks so far
        </SectionHeading>
        {checks.length > 0 && (
          <span className="font-mono text-mono leading-none text-muted-foreground">
            {checks.length}
          </span>
        )}
      </div>
      {newest.length === 0 ? (
        <p className="mb-0 px-panel py-4 text-body-s leading-body text-muted-foreground">
          Nobody has tried anything yet. Ask who goes first.
        </p>
      ) : (
        <ol aria-label="Logged checks" className="divide-y divide-hairline">
          {newest.map((check) => {
            const what = checkWhat(check);
            const numbers =
              check.total === null
                ? undefined
                : check.dc === null
                  ? String(check.total)
                  : `${String(check.total)} vs ${String(check.dc)}`;
            return (
              <li key={check.id} className="flex min-h-11 items-center gap-3 px-panel py-1">
                <span className="min-w-0 flex-1 text-body-s leading-snug font-medium text-heading">
                  {check.displayName} · {what}
                </span>
                {numbers !== undefined && (
                  <span className="font-mono text-mono leading-none whitespace-nowrap text-muted-foreground">
                    {numbers}
                  </span>
                )}
                <Badge variant={check.outcome === "success" ? "success" : "destructive"}>
                  {check.outcome === "success" ? "Success" : "Failure"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={`Remove ${check.displayName}'s ${what}`}
                  onClick={() => onRemove(check)}
                >
                  <Icon name="x" size={13} />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
