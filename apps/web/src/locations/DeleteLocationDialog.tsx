import type { Location } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loading,
} from "@taverns/ui";
import { Result } from "effect";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { locationAppearancesAtom } from "./load";

/**
 * Deleting one of the owner's places: `DELETE /library/locations/:id`, after
 * asking. It takes every place under it too, and takes them from every
 * campaign and Shared World they are in, so the confirmation names those
 * first — read from `appearances` — and waits for that read before offering
 * the delete.
 */
export function DeleteLocationDialog({
  place,
  inside,
  onClose,
  onDeleted,
}: {
  readonly place: Location;
  /** How many of the owner's places sit under this one, at any depth. */
  readonly inside: number;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const [appearances, retry] = useApiAtom(locationAppearancesAtom(place.id));
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit(
      (client) => client.libraryLocations.remove({ params: { locationId: place.id } }),
      // Every table and world reading the place answers this key too.
      [reads.libraryLocations],
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Delete ${place.name}`}>
        <DialogHeader>
          <DialogTitle>Delete {place.name}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-gutter py-3 text-body-s leading-body text-muted-foreground">
          <p>
            {inside === 0
              ? "The place and everything written about it are deleted."
              : `The place and the ${String(inside)} ${inside === 1 ? "place" : "places"} inside it are deleted, with everything written about them.`}
          </p>
          {appearances.state === "loading" && <Loading label="Finding where it is used…" />}
          {appearances.state === "failed" && (
            <ApiFailureNotice failure={appearances.failure} onRetry={retry} />
          )}
          {appearances.state === "ready" &&
            (appearances.value.length === 0 ? (
              <p>It is in no campaign.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p>It is taken from every table it is in:</p>
                <ul className="flex flex-col gap-1">
                  {appearances.value.map((appearance) => (
                    <li key={appearance.contextId} className="text-foreground">
                      {appearance.worldName === null
                        ? appearance.campaigns.map((campaign) => campaign.name).join(", ")
                        : `${appearance.worldName}${
                            appearance.campaigns.length === 0
                              ? ""
                              : `: ${appearance.campaigns.map((campaign) => campaign.name).join(", ")}`
                          }`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || appearances.state !== "ready"}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete place"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
