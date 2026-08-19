import type {
  Campaign,
  CampaignId,
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
import { Effect, Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { nextSessionNumber, startSession } from "../session/start";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/**
 * Putting an encounter on the table — the way into the runner.
 *
 * The prototype's button does one thing because the prototype has one fixture.
 * Here it may have to make three statements true at once, and they are three
 * tables: a **session** to hang the night off, a **run** to put an encounter on
 * the table, and the campaign's pointer at the session so the prep screen agrees
 * with the runner. So this is one `Effect` handed to one `submit`, exactly as
 * the encounter form composes its roster — two submits in a row would give this
 * dialog two busy flags and a session with no fight in it to explain.
 *
 * **A session is created only when there is not one.** `campaign.currentSessionId`
 * is the DM's current night; running a second encounter on the same night is
 * the common case and must not manufacture "Session 13" for it.
 *
 * **This is no longer the only way into a night, and the branch that opens one
 * is deliberately kept.** `StartSessionDialog` opens a night with no fight in
 * it — a session can start in a tavern, and an encounter goes on the table when
 * the party reaches one. That is a second door rather than a replacement: a DM
 * who goes straight from a cold campaign to a fight must not be made to open the
 * night first, so the cold branch stays and both doors go through
 * `session/start.ts`, which is where the numbering, the pointer and the stamp
 * live once.
 *
 * **`startedAt` belongs to the night, not to the fight.** It used to be written
 * here on the reasoning that a fight on the table is what `Session.ts`'s
 * "running" means. It is not, since a night can be running with nothing on the
 * table: the stamp goes on when the session opens, wherever it was opened from,
 * and this dialog writes it only in the case where it is the thing that opened
 * one.
 */

/** The one value the encounter select takes that is not an encounter. */
const NONE = "";

/**
 * The number this fight's night will carry.
 *
 * **Read from the server only when a session has to be invented**, because that
 * is the only thing the answer is for; with one already open it is that
 * session's, and no request. That branch is in the *key* rather than in the
 * component, so "already known" and "must be asked" are two different atoms
 * rather than one atom that changes its mind.
 */
const runNumberAtom = Atom.family(
  ({
    campaignId,
    known,
  }: {
    readonly campaignId: CampaignId;
    readonly known: number | undefined;
  }) =>
    apiAtom((client) =>
      known === undefined ? nextSessionNumber(campaignId)(client) : Effect.succeed<number>(known),
    ),
);

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

  const [number, reload] = useApiAtom(runNumberAtom({ campaignId, known: session?.number }));

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
    if (chosen === undefined || number.state !== "ready") return;
    const opening = number.value;

    const started = await submit((client) =>
      Effect.gen(function* () {
        // Opening the night — numbering, the campaign's pointer and the stamp,
        // all of it `session/start.ts`'s, so the two doors into a session
        // cannot come to mean different things. With a night already open this
        // is skipped entirely: running a second encounter tonight must not
        // manufacture a session for it.
        const sessionId =
          session === undefined ? yield* startSession(campaignId, opening)(client) : session.id;

        // The thing the DM actually pressed the button for.
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
              ? number.state === "ready"
                ? `This starts session ${String(number.value)} and opens the runner.`
                : "This starts a new session and opens the runner."
              : `This runs in session ${String(session.number)} and opens the runner.`}
          </DialogDescription>
        </DialogHeader>

        {number.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Counting the sessions…" />
          </div>
        )}
        {number.state === "failed" && (
          <div className="px-gutter py-gutter">
            <FailureNotice failure={number.failure} onRetry={reload} />
          </div>
        )}

        {/* Nothing to put on the table, said out loud rather than left as a
            select with no options and a button that will not press. It is
            reachable from the campaign row now: opening a night no longer needs
            an encounter, so a DM can be one press from here with none built. */}
        {number.state === "ready" && encounters.length === 0 && (
          <div className="px-gutter py-3">
            <p className="text-body-s leading-body text-muted-foreground">
              Nothing is built for this table yet. Write an encounter with{" "}
              <span className="text-heading">New encounter</span> and it can go on the table.
            </p>
          </div>
        )}

        {number.state === "ready" && encounters.length > 0 && (
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
            disabled={busy || number.state !== "ready" || encounters.length === 0}
            onClick={() => void start()}
          >
            {busy ? "Starting…" : "Start the fight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
