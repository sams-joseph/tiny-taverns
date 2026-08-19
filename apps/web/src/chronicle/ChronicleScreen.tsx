import type { CampaignId, SessionId } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
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
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import type { Resource } from "../api/failure";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadChronicleSpine, type ChronicleSpine } from "./load";
import { RecapBody } from "./RecapBody";
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
 *
 * ### It is one of the campaign's destinations, so it wears the campaign's frame
 *
 * It composed `AppShell` itself for as long as it predated the sixth delivery's
 * split — and that is how it came to draw no session badge and no campaign
 * action, since both are props of a shell this screen was assembling by hand.
 * `CampaignChrome` computes them once for every destination. What is left here
 * is the spine (`loadChronicleSpine`), the search — which is its own resource
 * because it re-runs on every settled keystroke and the frame must not reload
 * with it — and the screen's own three controls.
 */

/** Long enough that typing a name is one request rather than eight — see the bestiary. */
const SEARCH_SETTLE_MS = 250;

const SCOPES: ReadonlyArray<{ readonly value: SearchScope; readonly label: string }> = [
  { value: "all", label: "Everything" },
  { value: "beat", label: "Beats" },
  { value: "note", label: "Notes" },
  { value: "creature", label: "Bestiary" },
  { value: "character", label: "Party" },
];

/**
 * A campaign-wide search, keyed on exactly what is sent.
 *
 * **Its own atom rather than part of the frame's load**, which is the decision
 * this screen already made: it re-runs on every settled keystroke, and
 * composing it into `CampaignChrome`'s Effect would re-read the whole campaign
 * each time and blank the spine underneath. It is the one thing on this screen
 * that is not a fact about the campaign.
 *
 * The key is the record the request is built from, which `Atom.family` compares
 * structurally — so the `useMemo` this replaced is no longer load-bearing, and
 * a search the DM has run before is answered from the registry.
 */
const searchAtom = Atom.family(
  ({
    campaignId,
    q,
    scope,
  }: {
    readonly campaignId: CampaignId;
    readonly q: string;
    readonly scope: SearchScope;
    // **A ranking rather than a corpus, and it names nothing.** It reaches four
    // tables at once, so keying it on all four would re-run every settled
    // keystroke's search whenever anything in the campaign was written — for a
    // list the DM has already read. It re-runs when the term changes, which is
    // what a search box means.
  }) => apiAtom(searchCampaign(campaignId, { q, scope }), []),
);

/**
 * The spine of nights, keyed on the campaign. The recaps themselves are
 * `RecapBody`'s own atoms — one per card the DM opens, which is the whole
 * reason this screen does not compose them.
 */
const spineAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadChronicleSpine(campaignId), [reads.sessions(campaignId)]),
);

export function ChronicleScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
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

  const searching = q.trim() !== "";
  /**
   * The search is deliberately its **own** resource rather than part of the
   * frame's load: it re-runs on every settled keystroke, and composing it into
   * `CampaignChrome`'s Effect would re-read the whole campaign each time and
   * blank the spine underneath. It is the one thing on this screen that is not
   * a fact about the campaign.
   */
  const [hits] = useApiAtom(searchAtom({ campaignId, q, scope }));

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

  /** The answer to the query that is in the box now, or nothing yet. */
  const settled = answered !== undefined && answered.q === q.trim() ? answered : undefined;

  return (
    <CampaignChrome<ChronicleSpine>
      campaignId={campaignId}
      title="Chronicle"
      extra={spineAtom(campaignId)}
      subtitle={({ extra }) =>
        searching
          ? settled === undefined
            ? "Searching…"
            : `${String(settled.hits.length)} ${settled.hits.length === 1 ? "result" : "results"} for “${settled.q}”`
          : `${String(extra.sessions.length)} ${extra.sessions.length === 1 ? "night" : "nights"} on the record`
      }
      actions={() => (
        <>
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
        </>
      )}
    >
      {(slots) => (
        <Chronicle
          slots={slots}
          readAloud={readAloud}
          searching={searching}
          hits={hits}
          answered={answered}
          openId={openId}
          onOpen={setOpenId}
          onClearSearch={() => {
            setTerm("");
            setQ("");
          }}
        />
      )}
    </CampaignChrome>
  );
}

/**
 * The record itself: the spine, or what a search found in it.
 *
 * Split out so the screen above holds only what the top bar sets — the search
 * term, the scope, the *Read aloud* toggle and which night is open — which is
 * the rule `EncountersScreen` and `NotesScreen` already follow, and the reason
 * none of it can be two answers.
 */
function Chronicle({
  slots,
  readAloud,
  searching,
  hits,
  answered,
  openId,
  onOpen,
  onClearSearch,
}: {
  readonly slots: CampaignChromeSlots<ChronicleSpine>;
  readonly readAloud: boolean;
  readonly searching: boolean;
  readonly hits: Resource<SearchAnswer>;
  readonly answered: SearchAnswer | undefined;
  readonly openId: SessionId | null | undefined;
  readonly onOpen: (id: SessionId | null | undefined) => void;
  readonly onClearSearch: () => void;
}) {
  const { view, extra } = slots;
  const campaignId = view.campaign.id;
  const sessions = extra.sessions;
  const newest = sessions[0];
  const open = openId === undefined ? newest?.id : openId;
  // The record begins where the numbering does, which is not always 1: the
  // delivery's own footer says sessions 1–8 are elsewhere. Said as a fact, with
  // no offer to import them, because there is no importer.
  const earliest = sessions[sessions.length - 1];

  /**
   * *"Threads still open"* — the unticked half of the night being prepared.
   *
   * Both halves are the frame's: `CampaignView.session` is the night
   * `campaign.currentSessionId` names, and `CampaignView.prep` is that night's
   * checklist. This screen used to read both itself, which was a second answer
   * to a question the frame was already asking in the same round.
   */
  const current = view.session;
  const openThreads = view.prep.filter((item) => !item.done);

  return (
    <>
      {searching && (
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
                  onOpen(session.id);
                  onClearSearch();
                }}
              />
            ))}
        </div>
      )}

      {!searching && sessions.length === 0 && (
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

      {!searching && sessions.length > 0 && (
        // `@4xl` (896px) is the *column's* width — `main` is the container —
        // and it is where the 340px aside earns its place beside prose that
        // wants a measure. Same threshold the campaign view docks its aside at.
        <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
          <div className={readAloud ? "mx-auto w-full max-w-measure" : "min-w-0 flex-1"}>
            {sessions.map((session) => (
              <SessionEntry
                key={session.id}
                session={session}
                latest={session.id === newest?.id}
                open={session.id === open}
                readAloud={readAloud}
                onToggle={() => onOpen(open === session.id ? null : session.id)}
              >
                <RecapBody campaignId={campaignId} sessionId={session.id} readAloud={readAloud} />
              </SessionEntry>
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
                      {openThreads.length}
                    </span>
                  </div>
                  {current === undefined ? (
                    <p className="text-body-s leading-body text-faint">
                      No night is being prepared, so there is no checklist to read this from.
                    </p>
                  ) : openThreads.length === 0 ? (
                    <p className="text-body-s leading-body text-faint">
                      Everything on session {current.number}&rsquo;s checklist is ticked.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {openThreads.map((item) => (
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
                  {current !== undefined && (
                    // Named rather than implied: these are the unticked lines of
                    // one night's checklist, not authored loose ends, and the
                    // aside says which night so the claim stays checkable.
                    <p className="text-caption leading-body text-faint">
                      Unticked on session {current.number}&rsquo;s checklist.
                    </p>
                  )}
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
