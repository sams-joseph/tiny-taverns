import type { CampaignId, SessionId } from "@taverns/api";
import {
  Card,
  CardContent,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from "@taverns/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { Hob, useHobPanel } from "../hob";
import { hrefFor, type Route } from "../routes";
import { AppShell, NavContext, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadChronicle } from "./load";
import { searchCampaign, type SearchAnswer, type SearchScope } from "./search";
import { SearchResults } from "./SearchResults";
import { SessionEntry } from "./SessionEntry";

/**
 * The Chronicle — `ui_kits/dm-screen/Chronicle.jsx` against the real API.
 *
 * A vertical spine of nights, newest first, each an expandable card; a *Read
 * aloud* toggle that drops the DM-only half of the page rather than restyling
 * it; and a search box. What is different from the prototype is what the record
 * is made of: the recap of a night is assembled per read from five tables
 * (`Recap.ts`), and the search reaches notes, beats and the bestiary through the
 * one indexed path over the corpus (`repo/Search.ts`) rather than filtering the
 * recap titles a fixture had in memory.
 *
 * ### What is deliberately not here
 *
 * The delivery draws three things this screen does not, and in each case
 * building it would mean drawing a control over nothing:
 *
 * - **The *Recap session N* button and the *Redraft / Edit / Keep it* row.**
 *   Those are the assistant's — a recap the DM keeps is an `assistant` row with
 *   an `assistantTurnId`, and *"nothing is saved to the chronicle until you keep
 *   it"* is the draft's own copy. Nothing writes one yet, so there is no draft
 *   to keep and no button that would do anything. `RecapBody`'s `Drafted` badge
 *   reads `origin` instead, so the day something does write one the badge is
 *   already there.
 * - **The per-session *summary*, *quote*, *who you met*, *where you went*,
 *   *what you carried out*, *XP* and *level ups*.** None of them is a column
 *   anywhere in the product. A stubbed line is a worse lie than an absent one,
 *   so what the recap really holds — beats, fights, read-aloud, ticked prep —
 *   is what the card shows.
 * - **"Import the old notebook."** There is no importer. The spine still says
 *   where the record begins, because that is a fact about the sessions that are
 *   here; it does not offer to fix it.
 */

/** Long enough that typing a name is one request rather than eight — see the bestiary. */
const SEARCH_SETTLE_MS = 250;

const SCOPES: ReadonlyArray<{ readonly value: SearchScope; readonly label: string }> = [
  { value: "all", label: "Everything" },
  { value: "beat", label: "Beats" },
  { value: "note", label: "Notes" },
  { value: "creature", label: "Bestiary" },
];

export function ChronicleScreen({
  campaignId,
  route,
}: {
  readonly campaignId: CampaignId;
  readonly route: Route;
}) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [readAloud, setReadAloud] = useState(false);
  /**
   * Which night is open. `undefined` means nobody has chosen yet, which resolves
   * to the newest — the delivery opens that one (`Chronicle.jsx:146`) and one at
   * a time (`:164`). Kept apart from "explicitly closed" (`null`) so that
   * closing the newest card does not silently reopen it.
   */
  const [openId, setOpenId] = useState<SessionId | null | undefined>(undefined);

  useEffect(() => {
    const timer = setTimeout(() => setQ(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const load = useCallback(
    (client: TavernsClient) => loadChronicle(campaignId)(client),
    [campaignId],
  );
  const [resource, reload] = useApiResource(load);

  // Memoised on what is actually sent, for the reason every `useApiResource`
  // callback is: its identity is the instruction to load again.
  const query = useMemo(() => ({ q, scope }), [q, scope]);
  const searching = q.trim() !== "";
  const runSearch = useCallback(
    (client: TavernsClient) => searchCampaign(campaignId, query)(client),
    [campaignId, query],
  );
  const [hits] = useApiResource(runSearch);

  /**
   * The last answer that arrived, kept so the list does not blank between
   * keystrokes — the bestiary's `shown`, for the same reason.
   *
   * It carries its own query (`SearchAnswer.q`), so the count, the excerpts'
   * emphasis and the *"nothing matches"* sentence all name the search that
   * produced them rather than whatever is in the box a frame later.
   */
  const [answered, setAnswered] = useState<SearchAnswer>();
  useEffect(() => {
    if (hits.state === "ready") setAnswered(hits.value);
  }, [hits]);

  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  const hob = useHobPanel({ initialOpen: false });

  const view = resource.state === "ready" ? resource.value : undefined;
  const sessions = view?.sessions ?? [];
  const newest = sessions[0];
  const open = openId === undefined ? newest?.id : openId;
  // The record begins where the numbering does, which is not always 1: the
  // delivery's own footer says sessions 1–8 are elsewhere. Said as a fact, with
  // no offer to import them, because there is no importer.
  const earliest = sessions[sessions.length - 1];

  /** The answer to the query that is in the box now, or nothing yet. */
  const settled = answered !== undefined && answered.q === q.trim() ? answered : undefined;

  const subtitle = searching
    ? settled === undefined
      ? "Searching…"
      : `${String(settled.hits.length)} ${settled.hits.length === 1 ? "result" : "results"} for “${settled.q}”`
    : view === undefined
      ? undefined
      : `${String(sessions.length)} ${sessions.length === 1 ? "night" : "nights"} on the record`;

  return (
    <AppShell
      route={route}
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      context={
        view === undefined ? undefined : (
          <NavContext
            name={view.campaign.name}
            href={hrefFor({ screen: "campaign", campaignId })}
          />
        )
      }
      topBar={
        <TopBar title="Chronicle" subtitle={subtitle}>
          <Input
            aria-label="Search the record"
            placeholder="Search the record"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="h-control-sm w-52"
          />
          {searching && (
            <Select value={scope} onValueChange={(value) => setScope(value as SearchScope)}>
              <SelectTrigger aria-label="Search in" className="h-control-sm w-36">
                {/* Written out: `Select.Value` with neither `items` nor children
                    serialises the value, which would put `beat` on screen. */}
                <SelectValue>
                  {(value) => SCOPES.find((entry) => entry.value === value)?.label ?? "Everything"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Toggle size="sm" pressed={readAloud} onPressedChange={setReadAloud}>
            <Icon name="megaphone" size={13} />
            Read aloud
          </Toggle>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Opening the chronicle…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined && searching && (
        <div className="flex max-w-4xl flex-col gap-3">
          {hits.state === "failed" && <FailureNotice failure={hits.failure} />}
          {/* The previous answer stays on screen while the next is fetched, so
              the list does not blank on every keystroke — with a quiet line
              saying a newer one is coming. */}
          {hits.state === "loading" && (
            <Loading label={answered === undefined ? "Looking through the record…" : "Looking…"} />
          )}
          {answered !== undefined &&
            answered.q !== "" &&
            hits.state !== "failed" &&
            (answered.hits.length === 0 ? (
              <EmptyState icon="search" title="Nothing matches">
                Nothing in this campaign&rsquo;s notes, beats or bestiary answers to &ldquo;
                {answered.q}&rdquo;. Try a name you wrote down, or widen the search above.
              </EmptyState>
            ) : (
              <SearchResults
                hits={answered.hits}
                q={answered.q}
                sessions={sessions}
                onOpenSession={(session) => {
                  setOpenId(session.id);
                  setTerm("");
                  setQ("");
                }}
              />
            ))}
        </div>
      )}

      {view !== undefined && !searching && sessions.length === 0 && (
        // The state a new DM sees first, and bounded to the same width as a
        // failure notice — a card the whole width of a 1440px window reads as a
        // page that failed to load rather than one with nothing in it yet.
        <div className="max-w-3xl">
          <EmptyState icon="scroll-text" title="Nothing written down yet">
            The chronicle fills itself as you play — every beat you jot, every fight you run and
            every read-aloud you attach lands here under the night it happened on. Start a night
            from <span className="text-heading">{view.campaign.name}</span> and this page has
            something to say.
          </EmptyState>
        </div>
      )}

      {view !== undefined && !searching && sessions.length > 0 && (
        // `@4xl` (896px) is the *column's* width — `main` is the container —
        // and it is where the 340px aside earns its place beside prose that
        // wants a measure. Same threshold the campaign view docks its aside at.
        <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
          <div className={readAloud ? "mx-auto w-full max-w-measure" : "min-w-0 flex-1"}>
            {sessions.map((session) => (
              <SessionEntry
                key={session.id}
                campaignId={campaignId}
                session={session}
                latest={session.id === newest?.id}
                open={session.id === open}
                readAloud={readAloud}
                onToggle={() =>
                  setOpenId((current) => (current === session.id ? null : session.id))
                }
              />
            ))}

            {/* The spine's terminus (`Chronicle.jsx:166-173`). */}
            <div className="grid grid-cols-[auto_1fr] gap-x-4">
              <div className="flex w-4 justify-center">
                <Icon name="flag" size={13} className="mt-1 text-faint" />
              </div>
              <p className="pt-0.5 text-label leading-body text-faint">
                {earliest !== undefined && earliest.number > 1
                  ? `The record starts at session ${String(earliest.number)}. Sessions 1–${String(earliest.number - 1)} are not in it.`
                  : "That is the whole record."}
              </p>
            </div>
          </div>

          {/* Dropped whole in read-aloud mode, which is what the toggle means.

              **Not sticky**, though the delivery draws it `position: sticky; top:
              0` (`Chronicle.jsx:177`). The scroll container here is the shell's
              column, and `TopBar` is already sticky at its top — so an aside
              pinned to the same edge parks its own first line underneath the bar
              rather than beside the timeline. The offset that would fix it is
              the per-screen bar's height, which is not a token and changes with
              whether the bar has a subtitle. A short aside that scrolls away is
              a smaller cost than a heading nobody can read. */}
          {!readAloud && (
            <aside className="@4xl:w-aside @4xl:shrink-0">
              <Card tone="sunken">
                <CardContent className="flex flex-col gap-4 pt-card">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="font-display text-title leading-snug font-semibold text-heading">
                      Threads still open
                    </span>
                    <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
                      {view.openThreads.length}
                    </span>
                  </div>
                  {view.current === undefined ? (
                    <p className="text-body-s leading-body text-faint">
                      No night is being prepared, so there is no checklist to read this from.
                    </p>
                  ) : view.openThreads.length === 0 ? (
                    <p className="text-body-s leading-body text-faint">
                      Everything on session {view.current.number}&rsquo;s checklist is ticked.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {view.openThreads.map((item) => (
                        <li key={item.id} className="flex gap-2">
                          <Icon
                            name="help-circle"
                            size={13}
                            className="mt-0.5 shrink-0 text-faint"
                          />
                          <span className="text-body-s leading-body text-foreground">
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {view.current !== undefined && (
                    // Named rather than implied: these are the unticked lines of
                    // one night's checklist, not authored loose ends, and the
                    // aside says which night so the claim stays checkable.
                    <p className="text-caption leading-body text-faint">
                      Unticked on session {view.current.number}&rsquo;s checklist.
                    </p>
                  )}
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      )}
    </AppShell>
  );
}
