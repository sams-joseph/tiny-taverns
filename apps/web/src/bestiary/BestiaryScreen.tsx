import type { CampaignId, Creature, CreatureId, CreatureSort } from "@taverns/api";
import {
  Button,
  Input,
  Label,
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
import { CreatureCard } from "./CreatureCard";
import { CreatureDialog } from "./CreatureDialog";
import { inEnvironments, loadBestiary, NO_QUERY, type BestiaryQuery } from "./load";

/**
 * The bestiary — `ui_kits/dm-screen/Bestiary.jsx`, against the real API.
 *
 * The prototype's shape is kept: a search box and a sort in the top bar, a row
 * of environment chips, a grid of cards, and the empty state the designers drew.
 * What is different is everything a real list has and a fixture does not — three
 * provenances in one grid, an environment vocabulary that is the DM's rather
 * than a hard-coded four, and the four states (loading, failed, empty, and
 * empty-because-you-narrowed) that are the whole difference between this and a
 * scaffold.
 *
 * ### The search is the server's answer; the chips are not
 *
 * The search and the sort are query parameters and the environment chips are
 * not, and `load.ts` is where both halves of that are argued. In short: the
 * search reaches the stat block's full text as well as the name, which a
 * substring match over an already-loaded list cannot, and the CR sort orders by
 * `crSort` so `"1/4"` lands where it reads — while the chips are an any-of over
 * a field every row already carries, so applying them here loses nothing and
 * sidesteps a one-element-array defect on the wire. The cost of the search is a
 * request per settled keystroke, which is what the debounce below is for.
 *
 * **The last good list stays on screen while the next one loads.** A grid that
 * blanked to "Loading…" on every keystroke would flicker through the whole of a
 * DM typing a name; `shown` is the last thing the server said, and the top bar
 * says quietly that a newer answer is on its way.
 */

/**
 * Long enough that typing a name is one request rather than eight, short enough
 * that the list has moved by the time the eye gets to it. Same number as
 * `CreaturePicker`, for the same reason.
 */
const SEARCH_SETTLE_MS = 250;

const SORTS: ReadonlyArray<{ readonly value: CreatureSort; readonly label: string }> = [
  { value: "cr", label: "Sort: CR" },
  { value: "name", label: "Sort: Name" },
  { value: "recent", label: "Sort: Recent" },
];

const countOf = (n: number, narrowed: boolean): string => {
  const creatures = `${n} ${n === 1 ? "creature" : "creatures"}`;
  if (narrowed) return `${creatures} ${n === 1 ? "matches" : "match"} what you're looking for`;
  // "0 creatures — this campaign's own, and the shared corpus" is a sentence
  // about a list that is not there. The card below says the rest.
  return n === 0
    ? "Nothing in reach yet"
    : `${creatures} — this campaign's own, and the shared corpus`;
};

export function BestiaryScreen({
  campaignId,
  route,
}: {
  readonly campaignId: CampaignId;
  readonly route: Route;
}) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [environments, setEnvironments] = useState<ReadonlyArray<string>>([]);
  const [sort, setSort] = useState<CreatureSort>(NO_QUERY.sort);
  const [opened, setOpened] = useState<CreatureId | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setQ(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  /**
   * Narrowed by anything the DM did, which is what tells "nothing lives here at
   * all" apart from "nothing matches what you asked for". Sort is not part of it:
   * reordering a list is not filtering it.
   */
  const narrowed = q.trim() !== "" || environments.length > 0;

  // The environments are deliberately absent: they are applied to what comes
  // back rather than sent (see `inEnvironments`), so pressing a chip is not a
  // reload. Memoised on what *is* sent, because its identity is what tells
  // `useApiResource` to load again — an inline closure here would load forever
  // and the debounce above would buy nothing.
  const query = useMemo<BestiaryQuery>(() => ({ q, sort }), [q, sort]);
  const load = useCallback(
    (client: TavernsClient) => loadBestiary(campaignId, query)(client),
    [campaignId, query],
  );
  const [resource, reload] = useApiResource(load);

  /** The last answer, kept so a re-query does not blank the grid. */
  const [shown, setShown] = useState<{
    readonly campaign: { readonly name: string };
    readonly creatures: ReadonlyArray<Creature>;
  }>();

  /**
   * The chips are the environments this campaign's creatures actually live in,
   * not the prototype's hard-coded four (`Bestiary.jsx:4`) — `environments` is
   * an open vocabulary in a `text[]` and a DM's own list in reality.
   *
   * Accumulated rather than recomputed, because a search narrows the list this
   * reads: typing "goblin" would otherwise take every chip the goblins do not
   * live in off the row. The screen opens unsearched, so the first answer is the
   * whole vocabulary and later ones can only add to it.
   */
  const [vocabulary, setVocabulary] = useState<ReadonlyArray<string>>([]);

  /** Whether the bestiary is empty *at all*, as opposed to empty for this filter. */
  const [barren, setBarren] = useState<boolean>();

  useEffect(() => {
    if (resource.state !== "ready") return;
    const { campaign, creatures } = resource.value;
    setShown({ campaign, creatures });
    setVocabulary((current) => {
      const merged = new Set(current);
      for (const creature of creatures) {
        for (const environment of creature.environments) merged.add(environment);
      }
      return merged.size === current.length
        ? current
        : [...merged].sort((left, right) => left.localeCompare(right));
    });
    // An unsearched answer *is* the whole bestiary — the chips never reach the
    // server, so nothing else can have narrowed it.
    if (q.trim() === "") setBarren(creatures.length === 0);
  }, [resource, q]);

  const creatures = (shown?.creatures ?? []).filter((creature) =>
    inEnvironments(creature, environments),
  );
  const opening = creatures.find((creature) => creature.id === opened);
  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  const hob = useHobPanel({ initialOpen: false });

  const clear = () => {
    setTerm("");
    setQ("");
    setEnvironments([]);
  };

  return (
    <AppShell
      route={route}
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} campaignId={campaignId} />}
      context={
        shown === undefined ? undefined : (
          // The campaign's name is the way back to prep, exactly as it is from a
          // fight: this screen is inside a campaign, and the top nav is where
          // that is said.
          <NavContext
            name={shown.campaign.name}
            href={hrefFor({ screen: "campaign", campaignId })}
          />
        )
      }
      topBar={
        <TopBar
          title="Bestiary"
          subtitle={shown === undefined ? undefined : countOf(creatures.length, narrowed)}
        >
          <Input
            aria-label="Search creatures"
            placeholder="Search creatures"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="h-control-sm w-44"
          />
          <Select value={sort} onValueChange={(value) => setSort(value as CreatureSort)}>
            <SelectTrigger aria-label="Sort creatures" className="h-control-sm w-36">
              {/* Written out rather than left to Base UI: `Select.Value` with
                  neither `items` nor children serialises the *value*, which
                  would put `cr` on screen. */}
              <SelectValue>
                {(value) => SORTS.find((entry) => entry.value === value)?.label ?? "Sort: CR"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TopBar>
      }
    >
      {shown === undefined && resource.state === "loading" && (
        <Loading label="Reading the bestiary…" />
      )}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {shown !== undefined && resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          {vocabulary.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mr-1 text-faint">Environment</Label>
              {vocabulary.map((environment) => (
                <Toggle
                  key={environment}
                  size="sm"
                  pressed={environments.includes(environment)}
                  onPressedChange={() =>
                    setEnvironments((current) =>
                      current.includes(environment)
                        ? current.filter((entry) => entry !== environment)
                        : [...current, environment],
                    )
                  }
                >
                  {environment}
                </Toggle>
              ))}
              {narrowed && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  Clear
                </Button>
              )}
              {resource.state === "loading" && (
                <span role="status" className="text-caption leading-body text-faint">
                  Looking…
                </span>
              )}
            </div>
          )}

          {creatures.length === 0 ? (
            /* The designers' own empty state (`Bestiary.jsx:57-68`), with its
               second sentence answering whichever question was asked. Their
               *Add a creature* button is absent: authoring is not built, and a
               button that opened nothing is the same lie as a stubbed field. */
            <EmptyState icon="footprints" title="Nothing lives here">
              {narrowed && barren !== true ? (
                "Loosen a filter, or clear the search — the shared corpus is in this list too."
              ) : (
                <>
                  This campaign has no creatures of its own, and the shared corpus has not been
                  imported.{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server bestiary:import
                  </code>{" "}
                  brings it in.
                </>
              )}
            </EmptyState>
          ) : (
            /* The column's width, not the viewport's — `main` is the container.
               The prototype fills at `minmax(300px, 1fr)`: with a `gap-4` two
               cards need 616px and three need 932px, which is where `@2xl`
               (672) and `@5xl` (1024) are the first steps that fit. */
            <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {creatures.map((creature) => (
                <CreatureCard
                  key={creature.id}
                  creature={creature}
                  onOpen={() => setOpened(creature.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {opening !== undefined && (
        <CreatureDialog key={opening.id} creature={opening} onClose={() => setOpened(undefined)} />
      )}
    </AppShell>
  );
}
