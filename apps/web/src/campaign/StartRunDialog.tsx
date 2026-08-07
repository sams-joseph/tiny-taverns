import type {
  Campaign,
  Encounter,
  EncounterId,
  EncounterRunId,
  Session,
  SessionId,
  Visibility,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@taverns/ui";
import { DateTime, Effect, Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { useApiResource } from "../api/resource";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/**
 * *Start session* — `CampaignHome.jsx:41`, and the only way into the runner.
 *
 * The prototype's button does one thing because the prototype has one fixture.
 * Here it has to make three statements true at once, and they are three tables:
 * a **session** to hang the night off, a **run** to put an encounter on the
 * table, and the campaign's pointer at the session so the prep screen agrees
 * with the runner. So this is one `Effect` handed to one `submit`, exactly as
 * the encounter form composes its roster — two submits in a row would give this
 * dialog two busy flags and a session with no fight in it to explain.
 *
 * **A session is created only when there is not one.** `campaign.currentSessionId`
 * is the DM's current night; running a second encounter on the same night is
 * the common case and must not manufacture "Session 13" for it. When there is
 * no session at all, the number is one past the highest that exists, which is
 * what `sessions.list` is read for and the only reason it is read.
 *
 * **`startedAt` is written here and nowhere else in the app.** `Session.ts`
 * calls the lifecycle planned → running → ended; putting a fight on the table
 * is what "running" means, so this is where the stamp belongs.
 */

/** The one value the encounter select takes that is not an encounter. */
const NONE = "";

export function StartRunDialog({
  campaign,
  session,
  encounters,
  preselected,
  onClose,
  onStarted,
}: {
  readonly campaign: Campaign;
  /** The campaign's current session, if it has one. */
  readonly session: Session | undefined;
  readonly encounters: ReadonlyArray<Encounter>;
  /** The card the DM pressed Run on, if they came in that way. */
  readonly preselected: EncounterId | undefined;
  readonly onClose: () => void;
  readonly onStarted: (sessionId: SessionId, runId: EncounterRunId) => void;
}) {
  const campaignId = campaign.id;
  const needsSession = session === undefined;

  /**
   * The session numbers already used — read only when a session has to be
   * invented, because that is the only thing the answer is for.
   */
  const load = useCallback(
    (client: TavernsClient) =>
      needsSession
        ? Effect.map(client.sessions.list({ params: { campaignId } }), (rows) =>
            rows.reduce((highest, row) => Math.max(highest, row.number), 0),
          )
        : Effect.succeed(session.number - 1),
    [campaignId, needsSession, session],
  );
  const [highest, reload] = useApiResource(load);

  const [encounterId, setEncounterId] = useState<string>(preselected ?? NONE);
  const [includeParty, setIncludeParty] = useState(true);
  // `dm` for a new run: the column default, and the only safe one to fail to.
  // The prototype's switch starts on; fail closed is not negotiable here.
  const [visibility, setVisibility] = useState<Visibility>("dm");
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const chosen = encounters.find((encounter) => encounter.id === encounterId);
  const problem = chosen === undefined ? "Pick the encounter you are about to run." : undefined;

  const start = async () => {
    setShowProblems(true);
    if (chosen === undefined || highest.state !== "ready") return;
    const number = highest.value + 1;

    const started = await submit((client) =>
      Effect.gen(function* () {
        let sessionId: SessionId;
        let started: boolean;

        if (session === undefined) {
          const created = yield* client.sessions.create({
            params: { campaignId },
            payload: { number },
          });
          sessionId = created.id;
          started = created.startedAt !== null;
          // The prep screen reads the night off the campaign, so the pointer
          // has to move with the session or the two screens disagree about
          // which night this is. Fatal on purpose: a session nothing points at
          // is a night the DM cannot find again.
          yield* client.campaigns.update({
            params: { campaignId },
            payload: { currentSessionId: sessionId },
          });
        } else {
          sessionId = session.id;
          started = session.startedAt !== null;
        }

        // The thing the DM actually pressed the button for, before any
        // bookkeeping — so a fight is never lost to a failure in the paperwork
        // around it.
        const run = yield* client.runs.start({
          params: { campaignId, sessionId },
          payload: {
            encounterId: chosen.id,
            // Absent means "yes" — the server's own default, and a fight
            // without the party in initiative is not a fight. Only the
            // deliberate no is worth sending.
            ...(includeParty ? {} : { includeParty: false }),
            visibility,
          },
        });

        // `Session.ts` calls the lifecycle planned → running → ended, and a
        // fight on the table is what "running" means. **Best effort**: the
        // stamp is a record of something that has already happened, and a DM
        // standing at a table should not be told the fight did not start
        // because a timestamp did not save. Anything that would genuinely deny
        // this write has already denied `runs.start` above.
        if (!started) {
          const now = yield* DateTime.now;
          yield* Effect.ignore(
            client.sessions.update({
              params: { campaignId, sessionId },
              payload: { startedAt: now },
            }),
          );
        }

        return { sessionId, run };
      }),
    );

    if (Result.isSuccess(started)) {
      onStarted(started.success.sessionId, started.success.run.id);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Start a session">
        <DialogHeader>
          <DialogTitle>Put an encounter on the table</DialogTitle>
          <DialogDescription>
            {needsSession
              ? highest.state === "ready"
                ? `This starts session ${String(highest.value + 1)} and opens the runner.`
                : "This starts a new session and opens the runner."
              : `This runs in session ${String(session.number)} and opens the runner.`}
          </DialogDescription>
        </DialogHeader>

        {highest.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Counting the sessions…" />
          </div>
        )}
        {highest.state === "failed" && (
          <div className="px-gutter py-gutter">
            <FailureNotice failure={highest.failure} onRetry={reload} />
          </div>
        )}

        {highest.state === "ready" && (
          <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
            <Field
              label="Encounter"
              htmlFor="run-encounter"
              hint="Its roster becomes the initiative list, one row per creature."
              error={showProblems ? problem : undefined}
            >
              <Select value={encounterId} onValueChange={(value) => setEncounterId(String(value))}>
                <SelectTrigger
                  id="run-encounter"
                  aria-invalid={showProblems && problem !== undefined}
                >
                  {/* Written here rather than left to Base UI: `Select.Value`
                      with neither `items` nor children serialises the *value*,
                      so this select would render a uuid — and nothing at all
                      while it is empty. */}
                  <SelectValue>
                    {(value) =>
                      value === NONE
                        ? "Pick one"
                        : (encounters.find((encounter) => encounter.id === value)?.name ??
                          String(value))
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {encounters.map((encounter) => (
                    <SelectItem key={encounter.id} value={encounter.id}>
                      {encounter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <Switch id="run-party" checked={includeParty} onCheckedChange={setIncludeParty} />
                <Label htmlFor="run-party">Bring the party in</Label>
              </div>
              <span className="text-caption leading-body text-muted-foreground">
                {includeParty
                  ? "Every character rolls into initiative alongside the creatures."
                  : "Only the encounter's creatures. Add the party by hand later."}
              </span>
            </div>

            <VisibilityField
              id="run-visibility"
              value={visibility}
              onChange={setVisibility}
              shared="Your players can see the fight, except the lines you hide."
              hidden="Only you can see the fight. You can share it mid-combat."
            />
          </div>
        )}

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || highest.state !== "ready" || encounters.length === 0}
            onClick={() => void start()}
          >
            {busy ? "Starting…" : "Start the fight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
