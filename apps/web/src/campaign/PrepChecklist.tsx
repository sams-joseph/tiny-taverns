import type { CampaignId, PrepItem, SessionId } from "@taverns/api";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Icon,
  Input,
  Label,
} from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useMutation } from "../api/mutation";
import { runApiResult } from "../api/resource";
import { useCredential } from "../auth/credential";
import { SaveFailure } from "../ui/form";

/**
 * "Before you sit down" — the checklist, and writing to it.
 *
 * The checklist hangs off the session, not the campaign (`PrepItem.ts`), so with
 * no session there is nothing to check off yet and the card says so rather than
 * rendering an empty box. Adding is offered only when there is a session to add
 * to, for the same reason.
 *
 * ### Two write idioms, on purpose
 *
 * **The tick is optimistic and reverts on failure.** A checkbox that waits for a
 * round trip before it moves feels broken at a table, and the worst case is one
 * boolean going back with a line saying so. Its state is a **map of overrides
 * keyed by id**, not a copy of the rows: copying them would mean rebuilding
 * `PrepItem` instances out of spreads, and the copy would go stale the moment
 * the screen reloads. The override map layers over whatever the server last
 * said.
 *
 * **Adding, renaming and removing wait, and then reload the screen.** They
 * change the shape of the list rather than one field of one row, and a list that
 * grew a line locally would be a second answer to a question the server already
 * answers — the first reload would be where the two disagreed. They are also
 * rare: a DM writes the checklist once and ticks it all night.
 *
 * A prep item carries a `visibility` and this card does not offer it. That is
 * the column default — `dm` — applying untouched, which is what makes "the
 * checklist is unreachable by players" a property of the table rather than a
 * rule someone has to remember. There is nothing to decide here, so there is no
 * control.
 */
export function PrepChecklist({
  campaignId,
  sessionId,
  items,
  onChanged,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId | undefined;
  readonly items: ReadonlyArray<PrepItem>;
  /** Re-reads the campaign. Called after a line is added, renamed or removed. */
  readonly onChanged: () => void;
}) {
  const fetchCredential = useCredential();
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [error, setError] = useState<string | undefined>();

  const { busy, failure, submit } = useMutation();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [editText, setEditText] = useState("");

  const override = useCallback((id: string, done: boolean | undefined) => {
    setOverrides((current) => {
      const next = new Map(current);
      if (done === undefined) next.delete(id);
      else next.set(id, done);
      return next;
    });
  }, []);

  const setDone = useCallback(
    async (item: PrepItem, done: boolean) => {
      if (sessionId === undefined) return;
      setError(undefined);
      override(item.id, done);

      const token = await fetchCredential();
      const result = await runApiResult(
        (client) =>
          client.prep.update({
            params: { campaignId, sessionId, prepItemId: item.id },
            payload: { done },
          }),
        token,
      );

      if (Result.isFailure(result)) {
        override(item.id, undefined);
        setError("That did not save. Try it again.");
      }
    },
    [campaignId, sessionId, fetchCredential, override],
  );

  const add = async () => {
    const label = draft.trim();
    if (sessionId === undefined || label === "") return;
    const saved = await submit((client) =>
      client.prep.create({ params: { campaignId, sessionId }, payload: { label } }),
    );
    if (Result.isSuccess(saved)) {
      setDraft("");
      onChanged();
    }
  };

  const rename = async (item: PrepItem) => {
    const label = editText.trim();
    if (sessionId === undefined) return;
    // Nothing to save is not a failure; it is the DM changing their mind.
    if (label === "" || label === item.label) {
      setEditing(undefined);
      return;
    }
    const saved = await submit((client) =>
      client.prep.update({
        params: { campaignId, sessionId, prepItemId: item.id },
        payload: { label },
      }),
    );
    if (Result.isSuccess(saved)) {
      setEditing(undefined);
      onChanged();
    }
  };

  const remove = async (item: PrepItem) => {
    if (sessionId === undefined) return;
    // 204, so the success carries nothing — which is exactly why `submit`
    // answers with a `Result` rather than the value or `undefined`.
    const gone = await submit((client) =>
      client.prep.remove({ params: { campaignId, sessionId, prepItemId: item.id } }),
    );
    if (Result.isSuccess(gone)) onChanged();
  };

  const isDone = (item: PrepItem): boolean => overrides.get(item.id) ?? item.done;
  const done = items.filter(isDone).length;

  return (
    <Card tone="sunken">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2.5">
          <CardTitle>Before you sit down</CardTitle>
          {items.length > 0 && (
            <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
              {done}/{items.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            {sessionId === undefined
              ? "No session in the works. The checklist belongs to the night you are preparing."
              : "Nothing on the list. Whatever you must not forget goes here."}
          </p>
        ) : (
          items.map((item) =>
            editing === item.id ? (
              <div key={item.id} className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  aria-label={`Rename ${item.label}`}
                  value={editText}
                  disabled={busy}
                  className="h-control-sm"
                  onChange={(event) => setEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void rename(item);
                    if (event.key === "Escape") setEditing(undefined);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Save the new name"
                  disabled={busy}
                  onClick={() => void rename(item)}
                >
                  <Icon name="check" size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Keep the old name"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  <Icon name="x" size={14} />
                </Button>
              </div>
            ) : (
              <div key={item.id} className="group flex items-start gap-2.5">
                <Checkbox
                  id={item.id}
                  checked={isDone(item)}
                  onCheckedChange={(checked) => void setDone(item, checked)}
                />
                <Label
                  htmlFor={item.id}
                  className="flex-1 cursor-pointer text-body-s leading-body font-normal"
                >
                  {item.label}
                </Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`Rename ${item.label}`}
                  disabled={busy}
                  onClick={() => {
                    setEditing(item.id);
                    setEditText(item.label);
                  }}
                >
                  <Icon name="pencil" size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={`Remove ${item.label}`}
                  disabled={busy}
                  onClick={() => void remove(item)}
                >
                  <Icon name="x" size={13} />
                </Button>
              </div>
            ),
          )
        )}

        {sessionId !== undefined && (
          <div className="flex items-center gap-1.5 border-t border-hairline pt-3">
            <Input
              aria-label="Add to the checklist"
              placeholder="Reread the reeds ambush"
              value={draft}
              disabled={busy}
              className="h-control-sm"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void add();
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || draft.trim() === ""}
              onClick={() => void add()}
            >
              <Icon name="plus" size={14} />
              Add
            </Button>
          </div>
        )}

        {error !== undefined && (
          <p role="alert" className="text-body-s leading-body text-danger">
            {error}
          </p>
        )}
        {failure !== undefined && <SaveFailure failure={failure} />}
      </CardContent>
    </Card>
  );
}
