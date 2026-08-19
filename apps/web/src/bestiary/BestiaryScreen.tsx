import type { CampaignId, CreatureId, CreatureSort, PageCursor } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";
import { apiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { CorpusControls, CreatureGrid, EnvironmentChips, MorePages } from "./CorpusParts";
import { useCorpus } from "./corpus";
import { CreatureDialog } from "./CreatureDialog";
import { loadBestiary, moreOfBestiary, type CorpusQuery } from "./load";

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
 * ### One campaign's reach, and the Library beside it
 *
 * **This screen is no longer in the nav.** The sixth delivery puts a *Library*
 * on the global row, `GET /library/creatures` is the read behind it, and
 * `LibraryScreen` is the screen — so the item moved up a tier and out of the
 * campaign row, which is that delivery's *"nothing appears on both rows"*.
 *
 * **The route stayed**, and that is a decision rather than an oversight: this is
 * the only list in the product that answers *"what can **this** campaign reach"*.
 * The Library's filter is `LibraryFilter` — a search, the chips and a sort — and
 * carries no campaign narrowing at all, so it cannot be asked that question. A
 * link somebody bookmarked still lands on a screen that works, and the campaign
 * row's title is still the way back. See `AGENTS.md`.
 *
 * ### Every control is the server's, and the grid is a page
 *
 * `load.ts` argues it and `corpus.ts` implements the reading behaviour this
 * shares with the Library — the debounce, the chip vocabulary, the pages, the
 * last-good list that keeps the grid from blanking on every keystroke, and the
 * "is it empty *at all*" flag that tells the two silences apart. In short: the
 * search reaches the stat block's full text as well as the name, which a
 * substring match over an already-loaded list cannot; the CR sort orders by
 * `crSort` so `"1/4"` lands where it reads; and the chips are a Postgres array
 * overlap rather than a `.filter` over what came back, which they had to become
 * the moment the list stopped arriving whole.
 */

/**
 * What the top bar says about the list.
 *
 * **`more` is why this takes three arguments.** The grid is a page, so `n` is
 * what has been read rather than what there is, and a bare count would read as
 * the size of the corpus. Saying "the first 24" is the honest version and is
 * also the sentence that makes the *Show more* button below make sense.
 */
const countOf = (n: number, narrowed: boolean, more: boolean): string => {
  const creatures = `${n} ${n === 1 ? "creature" : "creatures"}`;
  if (more) return narrowed ? `The first ${creatures} that match` : `The first ${creatures}`;
  if (narrowed) return `${creatures} ${n === 1 ? "matches" : "match"} what you're looking for`;
  // "0 creatures — this campaign's own, and the shared corpus" is a sentence
  // about a list that is not there. The card below says the rest.
  return n === 0
    ? "Nothing in reach yet"
    : `${creatures} — this campaign's own, and the shared corpus`;
};

/**
 * One page of this campaign's reachable bestiary, keyed on the campaign and the
 * whole settled query.
 *
 * `CorpusQuery` carries an array of environment chips, and `Atom.family`
 * compares it structurally all the way down — measured, and pinned in
 * `api/atoms.test.tsx` — so an equal query is the same atom however the object
 * was built. That is what lets `useCorpus` take a plain arrow rather than a
 * `useCallback`.
 */
const bestiaryAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: CorpusQuery }) =>
    apiAtom(loadBestiary(campaignId, query)),
);

export function BestiaryScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const [opened, setOpened] = useState<CreatureId | undefined>();

  const more = useCallback(
    (query: CorpusQuery, cursor: PageCursor<CreatureSort>) => (client: TavernsClient) =>
      moreOfBestiary(campaignId, query, cursor)(client),
    [campaignId],
  );
  const corpus = useCorpus((query) => bestiaryAtom({ campaignId, query }), more);

  const opening = corpus.creatures.find((creature) => creature.id === opened);
  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  const hob = useHobPanel({ initialOpen: false });

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} campaignId={campaignId} />}
      campaignName={corpus.shown?.campaign.name}
      topBar={
        <TopBar
          title="Bestiary"
          subtitle={
            corpus.shown === undefined
              ? undefined
              : countOf(corpus.creatures.length, corpus.narrowed, corpus.hasMore)
          }
        >
          <CorpusControls corpus={corpus} label="Search creatures" />
        </TopBar>
      }
    >
      {corpus.shown === undefined && corpus.resource.state === "loading" && (
        <Loading label="Reading the bestiary…" />
      )}
      {corpus.resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={corpus.resource.failure} onRetry={corpus.reload} />
        </div>
      )}

      {corpus.shown !== undefined && corpus.resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          <EnvironmentChips corpus={corpus} />

          {corpus.creatures.length === 0 ? (
            /* The designers' own empty state (`Bestiary.jsx:57-68`), with its
               second sentence answering whichever question was asked. Their
               *Add a creature* button is absent: authoring is not built, and a
               button that opened nothing is the same lie as a stubbed field. */
            <EmptyState icon="footprints" title="Nothing lives here">
              {corpus.narrowed && corpus.barren !== true ? (
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
            /* No `homeOf`: every row here is either the campaign you are
               already in or the global corpus, so naming a table would put the
               same word on every card. The Library is where that changes. */
            <CreatureGrid creatures={corpus.creatures} onOpen={setOpened} />
          )}

          <MorePages corpus={corpus} />
        </div>
      )}

      {opening !== undefined && (
        <CreatureDialog key={opening.id} creature={opening} onClose={() => setOpened(undefined)} />
      )}
    </AppShell>
  );
}
