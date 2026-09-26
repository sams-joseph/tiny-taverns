import type { EncounterRunCheck, EncounterSkillChallenge } from "@taverns/api";
import { challengeTally } from "@taverns/api";
import { cn, Icon, SectionHeading } from "@taverns/ui";

/**
 * A skill challenge's progress: so many successes before so many failures, as
 * pips, counted from the log against the snapshot the run took of the prep
 * (`challengeTally`, the one rule the server refuses a settled challenge by).
 *
 * **Settled, it says so, and says what the prep said would happen** — the
 * challenge's own *If they make it* / *If it goes wrong* lines when the DM wrote
 * them (the captain's call), and nothing more when they did not. The drawing
 * borrows the first or last tactic line instead, which is a guess at which line
 * means what. Removing a check that settled it reopens it.
 */

function Pips({
  label,
  count,
  filled,
  tone,
}: {
  readonly label: string;
  readonly count: number;
  readonly filled: number;
  readonly tone: "success" | "failure";
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label-s leading-none text-muted-foreground">
        {label} · {filled} of {count}
      </span>
      <div
        className="flex flex-wrap gap-1.5"
        role="img"
        aria-label={`${label}: ${String(filled)} of ${String(count)}`}
      >
        {Array.from({ length: count }, (_, index) => {
          const on = index < filled;
          return (
            <span
              key={index}
              className={cn(
                "flex size-10 items-center justify-center rounded-control border transition-control",
                !on && "border-hairline bg-surface-sunken",
                on && tone === "success" && "border-success bg-success-soft text-success",
                on && tone === "failure" && "border-danger bg-danger-soft text-danger",
              )}
            >
              {on && <Icon name={tone === "success" ? "check" : "x"} size={18} />}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function SceneChallenge({
  challenge,
  checks,
}: {
  readonly challenge: EncounterSkillChallenge;
  readonly checks: ReadonlyArray<EncounterRunCheck>;
}) {
  const tally = challengeTally(challenge, checks);
  const outcome =
    tally.settled === "won"
      ? { title: "They made it", text: challenge.onSuccess }
      : tally.settled === "lost"
        ? { title: "It went wrong", text: challenge.onFailure }
        : undefined;

  return (
    <section
      aria-label="The challenge"
      className="flex flex-col gap-4.5 rounded-card border border-hairline bg-surface-card p-panel shadow-1"
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <SectionHeading as="h2" size="title">
          {challenge.successes} {challenge.successes === 1 ? "success" : "successes"} before{" "}
          {challenge.failures} {challenge.failures === 1 ? "failure" : "failures"}
        </SectionHeading>
        <span className="ml-auto font-mono text-mono leading-none text-muted-foreground">
          DC {challenge.dc}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Pips
          label="Successes"
          count={challenge.successes}
          filled={Math.min(tally.successes, challenge.successes)}
          tone="success"
        />
        <Pips
          label="Failures"
          count={challenge.failures}
          filled={Math.min(tally.failures, challenge.failures)}
          tone="failure"
        />
      </div>
      {outcome !== undefined && (
        <div
          role="status"
          className={cn(
            "flex flex-col gap-1 rounded-control border bg-surface-raised px-4 py-3.5",
            tally.settled === "won" ? "border-success" : "border-danger",
          )}
        >
          <span
            className={cn(
              "text-body leading-snug font-semibold",
              tally.settled === "won" ? "text-success" : "text-danger",
            )}
          >
            {outcome.title}
          </span>
          {outcome.text !== undefined && (
            <span className="text-body-s leading-body text-pretty text-foreground">
              {outcome.text}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
