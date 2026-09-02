import type { CharacterOption, Feat, OptionKind } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { Hob, useHobPanel } from "../hob";
import { FilterBar, FilterSearch } from "../library/filters";
import { LibraryNav } from "../library/LibraryNav";
import { AppShell, TopBar } from "../shell/AppShell";
import { FailureNotice, Loading } from "../ui/states";
import { ClassProgressionDialog } from "./ClassProgressionDialog";
import { isLibraryFeatOriginal } from "./feat";
import { FeatForm } from "./FeatForm";
import { FeatSection } from "./FeatSection";
import { libraryRulesAtom } from "./load";
import { isLibraryOriginal } from "./option";
import { OptionForm } from "./OptionForm";
import { OptionSection } from "./OptionSection";
import { EmptyState } from "../ui/states";

/**
 * **Your library of classes, races and backgrounds** — where one is written,
 * in no campaign at all.
 *
 * `#/library/rules`, inside the global *Library* destination, which is where a
 * monster is already authored. It is the second screen over the Library model
 * and it is the same model: `character_option` carries the ownership pair
 * `creature` does, and the four predicates behind both were already generic
 * over a table name.
 *
 * ### The captain's model, and what each part of it is on this screen
 *
 * > The library should be where you create the entities; when you use them in a
 * > campaign they are copied in, so the library should only show the raw entity
 * > and not anything in campaigns, as the campaign is a copied state of the
 * > entity.
 *
 * 1. **An option can be an account's.** `accountId` on the wire is what says
 *    so, and `option.ts`'s `isLibraryOriginal` is the one place a screen asks
 *    it. *May I edit this* is that question and never `origin`.
 * 2. **Authoring happens here.** The three *Write a …* buttons in the top bar,
 *    *Edit* on every row you own, and delete inside the form. The Rules
 *    screen's own *Write a class* is the same act with a copy on the end of it,
 *    for a DM who is standing at a table when they think of one.
 * 3. **Using one copies it in.** Not from here: a copy names a campaign, and
 *    this screen names none. `CopyOptionIn`, on a campaign's Rules screen, is
 *    the control — reached from the table the copy is going to, which is the
 *    one place the destination is not a guess.
 * 4. **Originals only.** Nothing on this screen filters for that and nothing
 *    should: `libraryRowReadable` is anchored on `campaign_id is null`, so a
 *    campaign's copy is not in the answer. A client-side "only originals" would
 *    be a second answer to a question the predicate has already settled.
 *
 * ### What a reader gets, and the one thing that is not a campaign question
 *
 * **The bundle plus their own, and nobody else's ever** — `account_id` is
 * compared to the account the credential resolved to and to nothing a caller
 * supplied. There is **no campaign gate in the predicate at all**, because an
 * option in no campaign has no membership to check; so an account that is a
 * member of nothing still has a library, which is what
 * authoring-is-not-an-act-inside-a-campaign means for a brand new reader. A
 * player cannot read their DM's library through this screen or any other, and
 * that refusal is what makes the copy-into-a-campaign step necessary rather
 * than convenient.
 *
 * ### The list is not paged, and the search filters what is already here
 *
 * A vocabulary is bounded by what it hangs off — `CharacterOption.ts` says so
 * and `OPTION_LIMIT` is a sanity bound rather than a page. So unlike the other
 * shelves the search narrows the loaded list in the client, instantly and with
 * no debounce, and the sections that end up empty under it are hidden rather
 * than drawing four "nothing at all" cards about a corpus that is merely
 * filtered. The bar itself is the shared Library pattern — same place, same
 * controls — because *"the filters are located in different places"* was the
 * complaint that standardised it.
 */

/**
 * The subtitle: what is in here, and how much of it is yours.
 *
 * Counted the same way `RulesScreen`'s is and by kind rather than by
 * subtraction, so a fourth kind arriving is a fourth clause rather than a
 * silently wrong race count.
 */
const summaryOf = (options: ReadonlyArray<CharacterOption>): string => {
  const count = (kind: OptionKind) => options.filter((row) => row.kind === kind).length;
  const classes = count("class");
  const backgrounds = count("background");
  const mine = options.filter(isLibraryOriginal).length;
  const counted =
    `${String(classes)} class${classes === 1 ? "" : "es"}, ` +
    `${String(count("race"))} race, ` +
    `${String(backgrounds)} background${backgrounds === 1 ? "" : "s"}`;
  // Absence is what says "the bundle and nothing else" — a "0 written by you"
  // would be a number nobody needs on the one screen whose whole job is to fill
  // it in.
  return mine === 0 ? `${counted} — the bundled ruleset` : `${counted} · ${String(mine)} yours`;
};

export function OptionLibraryScreen() {
  /** The option being written or edited, and which kind it is. */
  const [editing, setEditing] = useState<{
    readonly kind: OptionKind;
    readonly option: CharacterOption | undefined;
  }>();
  const [progression, setProgression] = useState<CharacterOption>();
  const [editingFeat, setEditingFeat] = useState<Feat | null>();
  const [term, setTerm] = useState("");

  const [resource, reload] = useApiAtom(libraryRulesAtom);

  // No campaign in view, so no campaign for Hob's tools to hang off — the panel
  // says so rather than offering a composer with nowhere to send. Same as the
  // campaign list and the monster Library, and for the same reason.
  const hob = useHobPanel({ initialOpen: false });

  const options = resource.state === "ready" ? resource.value.options : undefined;
  const vocabulary = resource.state === "ready" ? resource.value.vocabulary : undefined;
  const feats = resource.state === "ready" ? resource.value.feats : undefined;
  const searching = term.trim() !== "";
  const of = (kind: OptionKind) =>
    filterOptions(
      (options ?? []).filter((option) => option.kind === kind),
      term,
    );
  const shownFeats = filterFeats(feats ?? [], term);
  const nothingMatches =
    searching &&
    of("class").length === 0 &&
    of("race").length === 0 &&
    of("background").length === 0 &&
    shownFeats.length === 0;

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar title="Library" subtitle={options === undefined ? undefined : summaryOf(options)}>
          <LibraryNav />
          {/* **Three controls, so they wrap** — `RulesScreen` records the same
              thing about its four: the shell's action slot is one unwrapped
              row, which is right for the two every other screen has, and the
              `min-w-0` is what lets the title beside it give way first. */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing({ kind: "background", option: undefined })}
            >
              <Icon name="plus" size={14} />
              Write a background
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing({ kind: "race", option: undefined })}
            >
              <Icon name="plus" size={14} />
              Write a race
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditingFeat(null)}>
              <Icon name="plus" size={14} />
              Write a feat
            </Button>
            <Button size="sm" onClick={() => setEditing({ kind: "class", option: undefined })}>
              <Icon name="plus" size={14} />
              Write a class
            </Button>
          </div>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Opening your library…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {options !== undefined && (
        <div className="flex flex-col gap-8">
          <FilterBar narrowed={searching} onClear={() => setTerm("")}>
            <FilterSearch label="Search the rules" value={term} onChange={setTerm} />
          </FilterBar>
          {nothingMatches && (
            <EmptyState icon="book-open" title="Nothing matches">
              No class, race, background or feat answers that — clear the search to see the whole
              shelf.
            </EmptyState>
          )}
          {/* **`isLibraryOriginal`, and never `origin`** — the shipped write
              predicate rendered rather than restated. A bundled row is readable
              here and not writable, so it gets no *Edit*; deleting one you own
              is inside the form, beside the sentence about what happens to the
              copies. No `onRemove` at all on this list: there is no table for a
              row to be taken off. */}
          {!(searching && of("class").length === 0) && (
            <OptionSection
              title="Classes"
              options={of("class")}
              empty="No classes at all"
              emptyBody={emptyBody("class")}
              onEdit={(option) =>
                isLibraryOriginal(option) ? () => setEditing({ kind: "class", option }) : undefined
              }
              onProgression={(option) => () => setProgression(option)}
            />
          )}
          {!(searching && of("race").length === 0) && (
            <OptionSection
              title="Race"
              options={of("race")}
              empty="No race at all"
              emptyBody={emptyBody("race")}
              onEdit={(option) =>
                isLibraryOriginal(option) ? () => setEditing({ kind: "race", option }) : undefined
              }
            />
          )}
          {/* **Third, and last, for the reason it is third on `RulesScreen` and
              on the create form**: 2014 backgrounds carry proficiencies,
              languages, equipment and feature text. Ability-score arithmetic
              belongs to races and contained subraces. */}
          {!(searching && of("background").length === 0) && (
            <OptionSection
              title="Backgrounds"
              options={of("background")}
              empty="No backgrounds at all"
              emptyBody={emptyBody("background")}
              onEdit={(option) =>
                isLibraryOriginal(option)
                  ? () => setEditing({ kind: "background", option })
                  : undefined
              }
            />
          )}
          {!(searching && shownFeats.length === 0) && (
            <FeatSection
              feats={shownFeats}
              emptyBody={emptyFeatBody}
              onEdit={(feat) =>
                isLibraryFeatOriginal(feat) ? () => setEditingFeat(feat) : undefined
              }
            />
          )}
        </div>
      )}

      {editing !== undefined && vocabulary !== undefined && (
        <OptionForm
          key={editing.option?.id ?? `new-${editing.kind}`}
          kind={editing.kind}
          option={editing.option}
          onClose={() => setEditing(undefined)}
          // No `reload()` beside this: `OptionForm` names `reads.libraryOptions`
          // on its save and its delete, so this list reads itself again — and
          // so does the copy control on every campaign's Rules screen, which
          // reads the same atom. Calling both would be two requests for one
          // answer, the second interrupting the first.
          onSaved={() => setEditing(undefined)}
          vocabulary={vocabulary}
        />
      )}

      {editingFeat !== undefined && vocabulary !== undefined && (
        <FeatForm
          feat={editingFeat ?? undefined}
          source="library"
          campaignId={undefined}
          vocabulary={vocabulary}
          onClose={() => setEditingFeat(undefined)}
          onSaved={() => setEditingFeat(undefined)}
        />
      )}

      {progression !== undefined && (
        <ClassProgressionDialog option={progression} onClose={() => setProgression(undefined)} />
      )}
    </AppShell>
  );
}

const filterOptions = (
  options: ReadonlyArray<CharacterOption>,
  query: string,
): ReadonlyArray<CharacterOption> => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return options;
  return options.filter((option) => option.name.toLowerCase().includes(needle));
};

const filterFeats = (feats: ReadonlyArray<Feat>, query: string): ReadonlyArray<Feat> => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return feats;
  return feats.filter(
    (feat) =>
      feat.name.toLowerCase().includes(needle) ||
      feat.description.some((line) => line.toLowerCase().includes(needle)) ||
      feat.prerequisites.some((row) => row.ability.name.toLowerCase().includes(needle)),
  );
};

/**
 * The empty state, which on this screen is genuinely reachable: every account
 * reads the bundle, so this is what a database that has never run
 * `ruleset:import` looks like — and it names the fix rather than implying the
 * reader has done something wrong.
 */
const emptyFeatBody = (
  <>
    Write a feat and it lives here, in no campaign until you copy it into one. The bundled 2014
    baseline arrives with{" "}
    <code className="font-mono text-mono text-slate-300">pnpm -F server ruleset:import</code>.
  </>
);

const emptyBody = (kind: OptionKind) => (
  <>
    Write {kind === "class" ? "a class" : kind === "race" ? "a race" : "a background"} and it lives
    here, in no campaign until you copy it into one. The bundled ruleset arrives with{" "}
    <code className="font-mono text-mono whitespace-nowrap text-slate-300">
      pnpm -F server ruleset:import
    </code>
    .
  </>
);
