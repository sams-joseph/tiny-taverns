import type { CampaignId, Creature, CreatureId } from "@taverns/api";
import { Badge, Button, FilterInput, Icon, Loading } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * Choosing what is in an encounter, over the bestiary the campaign can reach.
 *
 * `creatures.list` is campaign-scoped in the path and returns the campaign's own
 * creatures *and* the global `system` corpus in one list — see `Api.ts`. So this
 * is the whole reachable set with no client-side union, and a creature that does
 * not appear here is one the roster may not point at either.
 *
 * **The search term goes to the server, not to a `.filter` here.** The server
 * matches the name by `ILIKE` *and* the stat block by full text, so "nimble
 * escape" finds the Goblin Boss by a trait that is in no column. Filtering a
 * once-loaded list locally would quietly lose that half, and it is the half a DM
 * reaches for when they cannot remember a name.
 *
 * This is not the bestiary screen. There is no sort control, no environment
 * chips and no stat block: picking is one question, and browsing is its own view.
 *
 * **It reads one page and says so when there are more.** A picker is a list you
 * look down, so a corpus that does not fit in one is a corpus to narrow rather
 * than to scroll — and following the cursor here would spend round trips
 * building a list nobody reads to the end. The line under it is what keeps that
 * honest: the alternative is a DM concluding a creature is not in the bestiary
 * because it sorted past the twelfth.
 *
 * **It is part of the page, not a box that scrolls.** It sits in the encounter
 * builder's rail, and a page scrolls with the window: a list with a scroller of
 * its own is where the wheel gets stuck. So it shows few enough rows to read
 * down in place.
 */

/** As many as are worth looking down before typing another letter. */
const SHOWN = 12;

/**
 * Long enough that typing a name is one request rather than eight, short enough
 * that the list has moved by the time the eye gets to it.
 */
const SEARCH_SETTLE_MS = 250;

/**
 * One page of the campaign's reachable bestiary, keyed on the campaign and the
 * settled search term.
 *
 * A **record** key, compared structurally (see `api/atoms.ts`), and at module
 * scope because an atom is its own identity — built in the component it would
 * be a new one on every keystroke's render and never settle. It also means two
 * pickers open on the same campaign and the same term share one request.
 */
const pickerAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: string }) =>
    apiAtom(
      (client) =>
        client.creatures.list({
          params: { campaignId },
          query: { q: query, sort: "name", limit: SHOWN },
        }),
      [reads.creatures(campaignId)],
    ),
);

export function CreaturePicker({
  campaignId,
  chosen,
  onPick,
}: {
  readonly campaignId: CampaignId;
  /** Already on the roster: offered, but not addable twice — a repeat is a 409. */
  readonly chosen: ReadonlySet<CreatureId>;
  /** The whole row: the roster line carries its CR, AC, hp and XP. */
  readonly onPick: (creature: Creature) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Keyed on the settled query, not the keystroke: the key is what says "a
  // different read", so the debounce above is what the request count follows.
  const [resource, reload] = useApiAtom(pickerAtom({ campaignId, query }));

  return (
    <div className="flex flex-col gap-2">
      <FilterInput
        label="Search the bestiary"
        value={{ text: term, filters: [], match: "all" }}
        onChange={(next) => setTerm(next.text)}
        facets={[]}
        className="max-w-full"
      />

      {resource.state === "loading" && <Loading label="Reading the bestiary…" />}
      {resource.state === "failed" && (
        <ApiFailureNotice failure={resource.failure} onRetry={reload} />
      )}

      {resource.state === "ready" &&
        (resource.value.items.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            Nothing in the bestiary answers to that. Try a shorter word, or a trait.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col rounded-md border border-hairline p-0">
            {resource.value.items.map((creature, index) => {
              const already = chosen.has(creature.id);
              return (
                // The name keeps a readable width and what follows it wraps
                // under it: on a phone the CR, the badge and *On the roster*
                // would otherwise take the whole row and leave the name none.
                <li
                  key={creature.id}
                  data-slot="picker-row"
                  className={
                    index === 0
                      ? "flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2"
                      : "flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-hairline px-3 py-2"
                  }
                >
                  <span className="flex min-w-0 flex-1 basis-32 items-center gap-2.5">
                    <Icon name="skull" size={15} className="shrink-0 text-faint" />
                    <span
                      data-slot="picker-name"
                      className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground"
                    >
                      {creature.name}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
                      CR {creature.cr}
                    </span>
                    {/* The bundled corpus, against rows from the DM's own
                        Library or the group's shares — worth marking because it
                        is the one kind of row nobody wrote. */}
                    {creature.origin === "system" && <Badge variant="outline">Shared corpus</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={already}
                      aria-label={`Add ${creature.name}`}
                      onClick={() => onPick(creature)}
                    >
                      {already ? "On the roster" : <Icon name="plus" size={15} />}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ))}

      {resource.state === "ready" && resource.value.nextCursor !== null && (
        <p className="text-body-s leading-body text-muted-foreground">
          More match than fit here. Type another word — the search reads the stat blocks too, so a
          trait works.
        </p>
      )}
    </div>
  );
}
