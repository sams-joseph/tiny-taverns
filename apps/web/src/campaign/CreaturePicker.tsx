import type { CampaignId, CreatureId } from "@taverns/api";
import { Badge, Button, Icon, Input } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { FailureNotice, Loading } from "../ui/states";

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
 * because it sorted past the fiftieth.
 */

/** As many as are worth looking down before typing another letter. */
const SHOWN = 25;

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
    apiAtom((client) =>
      client.creatures.list({
        params: { campaignId },
        query: { q: query, sort: "name", limit: SHOWN },
      }),
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
  readonly onPick: (creature: { readonly id: CreatureId; readonly name: string }) => void;
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
      <Input
        aria-label="Search the bestiary"
        placeholder="Search the bestiary"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />

      {resource.state === "loading" && <Loading label="Reading the bestiary…" />}
      {resource.state === "failed" && <FailureNotice failure={resource.failure} onRetry={reload} />}

      {resource.state === "ready" &&
        (resource.value.items.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            Nothing in the bestiary answers to that. Try a shorter word, or a trait.
          </p>
        ) : (
          <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-hairline">
            {resource.value.items.map((creature, index) => {
              const already = chosen.has(creature.id);
              return (
                <li
                  key={creature.id}
                  className={
                    index === 0
                      ? "flex items-center gap-2.5 px-3 py-2"
                      : "flex items-center gap-2.5 border-t border-hairline px-3 py-2"
                  }
                >
                  <Icon name="skull" size={15} className="shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
                    {creature.name}
                  </span>
                  <span className="shrink-0 font-mono text-mono leading-none font-medium text-muted-foreground">
                    CR {creature.cr}
                  </span>
                  {/* The corpus a DM shares between their own campaigns, not one
                      they wrote. Worth marking, because deriving is how you edit it. */}
                  {creature.origin === "system" && <Badge variant="outline">Shared corpus</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={already}
                    aria-label={`Add ${creature.name}`}
                    onClick={() => onPick({ id: creature.id, name: creature.name })}
                  >
                    {already ? "On the roster" : <Icon name="plus" size={15} />}
                  </Button>
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
