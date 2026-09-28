import { Button } from "@taverns/ui";
import type { SaveStatus } from "./autosave";

/**
 * *Saving…*, *Saved*, or *Couldn't save* with a way to try again — what a form
 * that saves as you type (`ui/autosave.ts`) says about itself. Quiet, and
 * announced politely rather than as an alert, since it changes every time the
 * writer stops typing.
 */
export function SaveState({
  status,
  onRetry,
}: {
  readonly status: SaveStatus;
  readonly onRetry: () => void;
}) {
  return (
    <span
      role="status"
      data-slot="save-state"
      className="flex items-center gap-2 text-caption leading-none text-faint"
    >
      {status.state === "saving" && "Saving…"}
      {status.state === "saved" && "Saved"}
      {status.state === "failed" && (
        <>
          <span className="text-danger-ink">Couldn&rsquo;t save</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </span>
  );
}
