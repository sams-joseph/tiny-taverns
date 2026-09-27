import {
  ACT_TITLE_MAX,
  type CampaignAct,
  type CampaignId,
  type Session,
  type Visibility,
} from "@taverns/api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState, type FormEvent } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { ActionsMenu } from "../ui/ActionsMenu";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { actStartingAt } from "./acts";

/**
 * The DM's hand on the acts: starting one inside an opened night, and renaming,
 * sharing and removing one from its heading.
 *
 * **Every write names `reads.acts` and nothing else.** An act is a title and a
 * night's number (`CampaignAct.ts`); starting, renaming or removing one moves
 * no night, and the grouping is arithmetic the screen redoes from the list.
 *
 * A player's Chronicle draws none of this: the acts they read are the shared
 * ones, and the endpoints behind these controls answer anybody but the
 * creator `NotFound`.
 */

/** A title as the schema will take it: trimmed, and something besides space. */
const titleProblem = (title: string): string | undefined =>
  title.trim() === ""
    ? "An act needs a title."
    : title.trim().length > ACT_TITLE_MAX
      ? `An act's title is at most ${String(ACT_TITLE_MAX)} characters.`
      : undefined;

const SHARED = "Players see this title over the nights of it they can read.";
const KEPT =
  "Only you see this act. Players read its nights under the shared act before it, or under none.";

/**
 * The end of an act's heading, for the DM: whether the table can see it, and
 * the commands on it. Each command opens a dialog; nothing here writes.
 */
export function ActActions({
  campaignId,
  act,
}: {
  readonly campaignId: CampaignId;
  readonly act: CampaignAct;
}) {
  const [open, setOpen] = useState<"edit" | "remove" | undefined>();
  const close = () => setOpen(undefined);

  return (
    <>
      {act.visibility === "shared" && (
        <Badge variant="outline" className="shrink-0">
          Shared
        </Badge>
      )}
      <ActionsMenu
        label={`Act actions: ${act.title}`}
        items={[
          { label: "Rename or share", icon: "pencil", onSelect: () => setOpen("edit") },
          {
            label: "Remove act",
            icon: "trash-2",
            destructive: true,
            onSelect: () => setOpen("remove"),
          },
        ]}
      />
      {open === "edit" && <EditActDialog campaignId={campaignId} act={act} onClose={close} />}
      {open === "remove" && <RemoveActDialog campaignId={campaignId} act={act} onClose={close} />}
    </>
  );
}

/** Renaming an act, and sharing or unsharing it: `PATCH …/acts/:a`. */
function EditActDialog({
  campaignId,
  act,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly act: CampaignAct;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [title, setTitle] = useState(act.title);
  const [visibility, setVisibility] = useState<Visibility>(act.visibility);
  const [tried, setTried] = useState(false);
  const problem = titleProblem(title);

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setTried(true);
    if (problem !== undefined) return;
    const saved = await submit(
      (client) =>
        client.acts.update({
          params: { campaignId, actId: act.id },
          payload: { title: title.trim(), visibility },
        }),
      [reads.acts(campaignId)],
    );
    if (Result.isSuccess(saved)) onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label="Rename or share an act">
        <DialogHeader>
          <DialogTitle>Rename or share the act</DialogTitle>
          <DialogDescription>It starts at session {act.firstSessionNumber}.</DialogDescription>
        </DialogHeader>

        <form
          id="act-edit"
          className="flex flex-col gap-5 px-gutter py-3"
          onSubmit={(event) => void save(event)}
        >
          <Field label="Title" htmlFor="act-title" error={tried ? problem : undefined}>
            <Input
              id="act-title"
              value={title}
              maxLength={ACT_TITLE_MAX}
              aria-invalid={tried && problem !== undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <VisibilityField
            id="act-visibility"
            value={visibility}
            onChange={setVisibility}
            shared={SHARED}
            hidden={KEPT}
          />
        </form>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="act-edit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Save act"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Removing an act, after asking: `DELETE …/acts/:a`. Only the heading goes —
 * its nights stay where they are and read under the act before it.
 */
function RemoveActDialog({
  campaignId,
  act,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly act: CampaignAct;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit(
      (client) => client.acts.remove({ params: { campaignId, actId: act.id } }),
      [reads.acts(campaignId)],
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label="Remove an act">
        <DialogHeader>
          <DialogTitle>Remove {act.title}?</DialogTitle>
          <DialogDescription>Its nights stay in the Chronicle.</DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The title goes, and the nights from session {act.firstSessionNumber} read under the act
            before it, or under none.
          </p>
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
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove act"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * *Start a new act here*, inside an opened night: a title, and `POST …/acts`
 * starting at this night's number. A night that already starts an act offers
 * nothing — its heading is directly above it, with the commands on it.
 *
 * The act starts kept to the DM, as every row does (`VisibilityField`); sharing
 * it is the heading's.
 */
export function StartActHere({
  campaignId,
  session,
  acts,
}: {
  readonly campaignId: CampaignId;
  readonly session: Session;
  readonly acts: ReadonlyArray<CampaignAct>;
}) {
  const { busy, failure, clear, submit } = useMutation();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [tried, setTried] = useState(false);

  if (actStartingAt(session, acts) !== undefined) return null;

  const problem = titleProblem(title);
  const fieldId = `act-start-${session.id}`;

  const cancel = () => {
    setWriting(false);
    setTitle("");
    setTried(false);
    clear();
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (problem !== undefined) return;
    const made = await submit(
      (client) =>
        client.acts.create({
          params: { campaignId },
          payload: { title: title.trim(), firstSessionNumber: session.number },
        }),
      [reads.acts(campaignId)],
    );
    if (Result.isSuccess(made)) cancel();
  };

  if (!writing) {
    return (
      <div className="border-t border-hairline pt-3.5">
        <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
          <Icon name="flag" size={14} />
          Start a new act here
        </Button>
      </div>
    );
  }

  return (
    <form
      aria-label="Start a new act"
      className="flex flex-col gap-3 border-t border-hairline pt-3.5"
      onSubmit={(event) => void start(event)}
    >
      <Field
        label="Act title"
        htmlFor={fieldId}
        hint={`Starts at session ${String(session.number)} and runs until the next act. Only you see it until you share it.`}
        error={tried ? problem : undefined}
      >
        <Input
          id={fieldId}
          autoFocus
          placeholder="Act II · The salt road"
          value={title}
          maxLength={ACT_TITLE_MAX}
          aria-invalid={tried && problem !== undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      {failure !== undefined && <SaveFailure failure={failure} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          {busy ? "Starting…" : "Start act"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
