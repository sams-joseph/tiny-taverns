import type { Visibility } from "@taverns/api";
import { Label, Switch, cn } from "@taverns/ui";
import type { ComponentProps, ReactNode } from "react";
import type { ApiFailure } from "../api/resource";

/**
 * The furniture every authoring form in this app is built from.
 *
 * Deliberately here and not in `@taverns/ui`: the package ships the designers'
 * delivered system, component for component, and `adherence.test.ts` asserts
 * that list. A labelled field group and a "share with players" switch are this
 * app's *composition* of those parts, not new primitives, so they live on this
 * side of the line.
 */

/** A label, its control, and — when there is one — the reason it is refused. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: ReactNode;
  /** A validation message. Also drives `aria-invalid` on the control you pass. */
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error !== undefined ? (
        <span
          id={`${htmlFor}-error`}
          role="alert"
          className="text-caption leading-body text-danger-ink"
        >
          {error}
        </span>
      ) : (
        hint !== undefined && (
          <span className="text-caption leading-body text-muted-foreground">{hint}</span>
        )
      )}
    </div>
  );
}

/**
 * A multi-line control, matching `Input` at every point except its height.
 *
 * `@taverns/ui` ships no textarea — the designers drew none — and adding one
 * there would change the delivered component list. Read-aloud prose in a
 * single-line input is the worse answer, so the element is written here against
 * the same theme names `Input` uses rather than restating any value.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-24 w-full min-w-0 resize-y rounded-control border border-strong bg-surface-card px-3 py-2",
        "font-sans text-body-s leading-body text-foreground transition-control outline-none",
        "placeholder:text-faint",
        "focus-visible:border-accent focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:focus-visible:border-danger",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Who may see this row.
 *
 * One control, written once, because getting it wrong quietly undoes a boundary
 * the server enforces carefully. Two rules it exists to keep:
 *
 * - **Off is `dm`, and off is where a new row starts.** That is the column
 *   default, the schema default and the read predicate's default — a form that
 *   opened with the switch on would be the one place in the product that failed
 *   open.
 * - **It says what the DM is deciding, not what the column is called.** The
 *   vocabulary on the wire is `dm` / `shared`; the question at the table is
 *   whether the players get to see it.
 */
export function VisibilityField({
  id,
  value,
  onChange,
  shared,
  hidden,
  disabled = false,
}: {
  readonly id: string;
  readonly value: Visibility;
  readonly onChange: (next: Visibility) => void;
  /** What being shared means for this row, in one clause. */
  readonly shared: string;
  /** What keeping it to yourself means. */
  readonly hidden: string;
  readonly disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Switch
          id={id}
          checked={value === "shared"}
          disabled={disabled}
          onCheckedChange={(next) => onChange(next ? "shared" : "dm")}
        />
        <Label htmlFor={id}>Players can see this</Label>
      </div>
      <span className="text-caption leading-body text-muted-foreground">
        {value === "shared" ? shared : hidden}
      </span>
    </div>
  );
}

/** The sentence a failed *write* gets. `FailureNotice` is the read-side card. */
const sentenceFor = (failure: ApiFailure): string => {
  switch (failure.kind) {
    case "unauthorized":
      return "That credential is not good for this.";
    case "missing":
      return `That ${failure.resource} is gone, or it belongs to someone else.`;
    case "conflict":
      return failure.message;
    case "invalid":
      return "That will not save as written.";
    case "unreachable":
      return "The server did not answer. Check it is running, then try again.";
    default:
      return "That did not save. Try it again.";
  }
};

/** The detail worth keeping under the sentence, when there is one. */
const detailFor = (failure: ApiFailure): string | undefined => {
  switch (failure.kind) {
    case "invalid":
    case "unknown":
      return failure.detail;
    default:
      return undefined;
  }
};

/**
 * A failed save, inside the form that failed.
 *
 * One `role="alert"` line, so a screen reader hears it when it appears and the
 * DM's eye lands on it next to the button they just pressed — not a card, which
 * is the shape a failed *load* takes because there is nothing else on screen.
 */
export function SaveFailure({ failure }: { readonly failure: ApiFailure }) {
  const detail = detailFor(failure);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p role="alert" className="text-body-s leading-body text-danger">
        {sentenceFor(failure)}
      </p>
      {/* One truncated line, never a wrapped paragraph. A transport failure's
          detail is a whole URL, and left to wrap it grew the footer under the
          buttons — the detail is for whoever is debugging, and the sentence
          above is the part that has to stay legible. */}
      {detail !== undefined && (
        <p
          title={detail}
          className="overflow-hidden text-caption leading-body text-ellipsis whitespace-nowrap text-muted-foreground"
        >
          {detail}
        </p>
      )}
    </div>
  );
}
