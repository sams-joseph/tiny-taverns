import type { Creature, CreatureId, CreatureSort, PageCursor } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";
import { apiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { CopyIntoCampaign } from "./CopyIntoCampaign";
import { CorpusControls, CreatureGrid, EnvironmentChips, MorePages } from "./CorpusParts";
import { useCorpus } from "./corpus";
import { CreatureDialog } from "./CreatureDialog";
import { CreatureForm } from "./CreatureForm";
import { loadLibrary, moreOfLibrary, type CorpusQuery } from "./load";
import { isLibraryEntity } from "./provenance";

/**
 * The Library: **where a monster is authored**, and the bundled corpus beside
 * what you wrote.
 *
 * The sixth delivery draws it as *Library* on the global row —
 * `AppShell.jsx:10`, `{ id: "bestiary", icon: "footprints", label: "Library" }`
 * — and the global row is *everything above a campaign*, which is exactly what
 * this is: `0015_library_creatures.ts` made a creature able to belong to an
 * **account** and sit in no campaign at all.
 *
 * ### The captain's model, and what each part of it is on this screen
 *
 * > The library should be where you create the entities; when you use them in a
 * > campaign they are copied in, so the library should only show the raw entity
 * > and not anything in campaigns, as the campaign is a copied state of the
 * > entity.
 *
 * 1. **A creature can be an account's.** `accountId` on the wire is what says
 *    so, and `provenance.ts`'s `isLibraryEntity` is the one place a screen asks
 *    it. *May I edit this* is that question and never `origin` — an imported
 *    entity is `imported` and still yours.
 * 2. **Authoring happens here.** *Write a creature* in the top bar, *Edit* on
 *    every row you own, and delete inside the form — `CreatureForm`, the only
 *    authoring surface over `creature` in the product.
 * 3. **Using one copies it in.** `CopyIntoCampaign`, in the stat block dialog,
 *    which is also where the two things about a copy that surprise people are
 *    said out loud.
 * 4. **Originals only.** Nothing on this screen filters for that and nothing
 *    should: `libraryRowReadable` is anchored on `campaign_id is null`, so a
 *    campaign's copy is not in the answer. A client-side "only originals" would
 *    be a second answer to a question the predicate has already settled — the
 *    rule `characters/load.ts` states for `GET /me/characters`.
 *
 * ### What a reader gets, and the one thing that is not a campaign question
 *
 * The bundle plus their own, and nothing else ever — `account_id` is compared to
 * the account the credential resolved to and to nothing a caller supplied. There
 * is **no campaign gate in the predicate at all**, uniquely in this product,
 * because a Library entity is in no campaign: there is no membership to check.
 * So an account that is a member of nothing still has a Library, which is what
 * authoring-is-not-an-act-inside-a-campaign means for a brand new reader.
 *
 * This reverses the shape this screen was first built against — a gathering of
 * every campaign creature the credential could reach. Those are copies, and a
 * copy shown here would have offered to be edited without the edit reaching the
 * campaign holding it.
 */

/** The list is a page, so an unqualified count would name the wrong thing —
    see `BestiaryScreen`'s own `countOf`, which this mirrors. */
const countOf = (n: number, narrowed: boolean, more: boolean): string => {
  const creatures = `${n} ${n === 1 ? "creature" : "creatures"}`;
  if (more) return narrowed ? `The first ${creatures} that match` : `The first ${creatures}`;
  if (narrowed) return `${creatures} ${n === 1 ? "matches" : "match"} what you're looking for`;
  return n === 0 ? "Nothing here yet" : `${creatures} — yours, and the bundled corpus`;
};

/**
 * One page of the Library, keyed on the query and nothing else — the whole point
 * of this read is that it names no campaign, so the query is the whole key and
 * the family can be handed to `useCorpus` bare.
 */
const libraryAtom = Atom.family((query: CorpusQuery) => apiAtom(loadLibrary(query)));

export function LibraryScreen() {
  const [opened, setOpened] = useState<CreatureId | undefined>();
  /** `undefined` closed, `null` writing a new one, a row editing that one. */
  const [editing, setEditing] = useState<Creature | null | undefined>();

  const more = useCallback(
    (query: CorpusQuery, cursor: PageCursor<CreatureSort>) => (client: TavernsClient) =>
      moreOfLibrary(query, cursor)(client),
    [],
  );
  const corpus = useCorpus(libraryAtom, more);

  const opening = corpus.creatures.find((creature) => creature.id === opened);
  const campaigns = corpus.shown?.campaigns ?? [];
  // No campaign in view, so no campaign for Hob's tools to hang off — the panel
  // says so rather than offering a composer with nowhere to send. Same as the
  // campaign list, and for the same reason.
  const hob = useHobPanel({ initialOpen: false });

  /** A write changes the shape of the list, so it re-reads. `EncounterDialog`'s rule. */
  const saved = () => {
    setEditing(undefined);
    setOpened(undefined);
    corpus.reload();
  };

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title="Library"
          subtitle={
            corpus.shown === undefined
              ? undefined
              : countOf(corpus.creatures.length, corpus.narrowed, corpus.hasMore)
          }
        >
          <CorpusControls corpus={corpus} label="Search the library" />
          <Button size="sm" onClick={() => setEditing(null)}>
            <Icon name="plus" size={13} />
            Write a creature
          </Button>
        </TopBar>
      }
    >
      {corpus.shown === undefined && corpus.resource.state === "loading" && (
        <Loading label="Opening your library…" />
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
            <EmptyState icon="footprints" title="Nothing lives here">
              {corpus.narrowed && corpus.barren !== true ? (
                "Loosen a filter, or clear the search — the bundled corpus is in this list too."
              ) : (
                /* **What fills a Library is writing something**, which is the
                   sentence the first version of this screen could not say: back
                   then the list was a gathering of campaign rows and the answer
                   was "join a table". Authoring is not an act inside a campaign,
                   so a brand new account with no table at all is one press away
                   from a full list. The bundle is named second because it is the
                   other way this fills, and because a fresh database has not
                   imported it. */
                <>
                  Write your first creature and it lives here, in no campaign until you copy it into
                  one. The bundled corpus arrives with{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server bestiary:import
                  </code>
                  .
                </>
              )}
            </EmptyState>
          ) : (
            /* *Edit* on the rows this account owns and on no others — the
               shipped write predicate rendered rather than restated. A bundled
               row is readable here and not writable, so it gets the reader and
               the copy action and nothing else. */
            <CreatureGrid
              creatures={corpus.creatures}
              onEdit={(creature) =>
                isLibraryEntity(creature) ? () => setEditing(creature) : undefined
              }
              onOpen={setOpened}
            />
          )}

          <MorePages corpus={corpus} />
        </div>
      )}

      {opening !== undefined && (
        <CreatureDialog
          key={opening.id}
          creature={opening}
          actions={<CopyIntoCampaign creature={opening} campaigns={campaigns} />}
          onClose={() => setOpened(undefined)}
        />
      )}

      {editing !== undefined && (
        <CreatureForm
          key={editing?.id ?? "new"}
          creature={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      )}
    </AppShell>
  );
}
