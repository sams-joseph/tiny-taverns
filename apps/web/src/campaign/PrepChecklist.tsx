import type { CampaignId, PrepItem, SessionId } from "@taverns/api";
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Label } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { runApiResult } from "../api/resource";
import { useCredential } from "../auth/credential";

/**
 * "Before you sit down" — the one thing on this screen that writes.
 *
 * The checklist hangs off the session, not the campaign (`PrepItem.ts`), so
 * with no session there is nothing to check off yet and the card says so rather
 * than rendering an empty box.
 *
 * The tick is optimistic and reverts on failure: a checkbox that waits for a
 * round trip before it moves feels broken at a table, and the worst case here is
 * one boolean going back with a line saying so.
 *
 * State is a **map of overrides keyed by id**, not a copy of the rows. Copying
 * them would mean rebuilding `PrepItem` instances out of spreads, and a local
 * copy would then go stale the moment the screen reloads — the override map
 * layers over whatever the server last said instead.
 */
export function PrepChecklist({
  campaignId,
  sessionId,
  items,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId | undefined;
  readonly items: ReadonlyArray<PrepItem>;
}) {
  const fetchCredential = useCredential();
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [error, setError] = useState<string | undefined>();

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
          items.map((item) => (
            <div key={item.id} className="flex items-start gap-2.5">
              <Checkbox
                id={item.id}
                checked={isDone(item)}
                onCheckedChange={(checked) => void setDone(item, checked)}
              />
              <Label
                htmlFor={item.id}
                className="cursor-pointer text-body-s leading-body font-normal"
              >
                {item.label}
              </Label>
            </div>
          ))
        )}

        {error !== undefined && (
          <p role="alert" className="text-body-s leading-body text-danger">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
