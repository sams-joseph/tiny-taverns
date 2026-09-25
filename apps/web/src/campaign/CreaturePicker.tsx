import { type CampaignId, type Creature, creatureXp, type CreatureId } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  FilterInput,
  Icon,
  Loading,
  SectionHeading,
  Toggle,
} from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { CR_PILLS, type CrPill, crRange } from "./encounterDraft";

/**
 * The encounter builder's bestiary: what an encounter's roster is added from,
 * over the bestiary the campaign can reach — the redesign's rail card
 * (`Campaign Overview.dc.html`).
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
 * reaches for when they cannot remember a name. The CR pills are the same
 * query's `crMin`/`crMax`, and the list is sorted by CR, weakest first.
 *
 * **A search box and pills, not one filter control.** The rule elsewhere is one
 * `FilterInput` whose conditions are its pills; the drawing puts four fixed CR
 * bands beside the box, one pressed at a time, and the captain kept them
 * (`docs/internals/web-screens.md`). Choosing a band is one press, where a CR
 * range condition is four.
 *
 * This is not the bestiary screen. There is no sort control, no environment
 * chips and no stat block: picking is one question, and browsing is its own view.
 *
 * **Adding is always one more.** The server holds one roster row per creature,
 * so *+* on a creature already there raises its line's count in the draft
 * rather than asking for a second row; the row says how many are on it.
 *
 * **It reads one page and says so when there are more.** A picker is a list you
 * look down, so a corpus that does not fit in one is a corpus to narrow rather
 * than to scroll — and following the cursor here would spend round trips
 * building a list nobody reads to the end. The line under it is what keeps that
 * honest: the alternative is a DM concluding a creature is not in the bestiary
 * because it sorted past the twelfth.
 *
 * **It is part of the page, not a box that scrolls.** The drawing gives the list
 * a scroller of its own, and a page scrolls with the window: a list with a
 * scroller of its own is where the wheel gets stuck. So it shows few enough rows
 * to read down in place.
 */

/** As many as are worth looking down before typing another letter. */
const SHOWN = 12;

/**
 * Long enough that typing a name is one request rather than eight, short enough
 * that the list has moved by the time the eye gets to it.
 */
const SEARCH_SETTLE_MS = 250;

/**
 * One page of the campaign's reachable bestiary, keyed on the campaign, the
 * settled search term and the CR band.
 *
 * A **record** key, compared structurally (see `api/atoms.ts`), and at module
 * scope because an atom is its own identity — built in the component it would
 * be a new one on every keystroke's render and never settle.
 */
const pickerAtom = Atom.family(
  ({
    campaignId,
    query,
    band,
  }: {
    readonly campaignId: CampaignId;
    readonly query: string;
    readonly band: CrPill;
  }) =>
    apiAtom(
      (client) =>
        client.creatures.list({
          params: { campaignId },
          query: { q: query, ...crRange(band), sort: "cr", limit: SHOWN },
        }),
      [reads.creatures(campaignId)],
    ),
);

/** `"Humanoid · 200 xp"`: what it is and what it is worth, as the drawing's second line. */
const kindAndXp = (creature: Creature): string => {
  const xp = creatureXp({ cr: creature.cr, statBlockXp: creature.statBlock.xp ?? null });
  const kind = creature.type.trim();
  const worth = xp === null ? "no XP" : `${xp.toLocaleString("en")} xp`;
  return kind === "" ? worth : `${kind} · ${worth}`;
};

export function CreaturePicker({
  campaignId,
  counts,
  onPick,
}: {
  readonly campaignId: CampaignId;
  /** How many of each creature the roster holds, for the row's ×N. */
  readonly counts: ReadonlyMap<CreatureId, number>;
  /** The whole row: the roster line carries its CR, AC, hp and XP. */
  readonly onPick: (creature: Creature) => void;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<CrPill>("any");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Keyed on the settled query, not the keystroke: the key is what says "a
  // different read", so the debounce above is what the request count follows.
  const [resource, reload] = useApiAtom(pickerAtom({ campaignId, query, band }));

  return (
    <Card
      role="region"
      aria-labelledby="bestiary-heading"
      data-slot="encounter-bestiary"
      className="min-w-0 overflow-hidden"
    >
      <div className="flex flex-col gap-3 border-b border-hairline px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="footprints" size={15} className="shrink-0 text-muted-foreground" />
          <SectionHeading id="bestiary-heading" size="title">
            Bestiary
          </SectionHeading>
        </div>
        <FilterInput
          label="Search the bestiary"
          placeholder="Search creatures"
          value={{ text: term, filters: [], match: "all" }}
          onChange={(next) => setTerm(next.text)}
          facets={[]}
          className="max-w-full"
        />
        <div role="group" aria-label="Challenge rating" className="flex flex-wrap gap-1.5">
          {CR_PILLS.map(([pill, label]) => (
            <Toggle
              key={pill}
              size="sm"
              className="rounded-pill"
              pressed={band === pill}
              onPressedChange={() => setBand(pill)}
            >
              {label}
            </Toggle>
          ))}
        </div>
      </div>

      {resource.state === "loading" && (
        <div className="px-5 py-4">
          <Loading label="Reading the bestiary…" />
        </div>
      )}
      {resource.state === "failed" && (
        <div className="px-5 py-4">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {resource.state === "ready" &&
        (resource.value.items.length === 0 ? (
          <p className="mb-0 px-5 py-6 text-center text-body-s leading-body text-muted-foreground">
            Nothing lives here. Loosen a filter, or try another word — the search reads the stat
            blocks too.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {resource.value.items.map((creature) => {
              const count = counts.get(creature.id);
              return (
                // The name keeps a readable width and the CR and the + wrap
                // under it before they take it: on a phone they would
                // otherwise leave the name none.
                <li
                  key={creature.id}
                  data-slot="picker-row"
                  className="flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-hairline py-1 pr-3 pl-5 first:border-t-0"
                >
                  <div className="min-w-0 flex-1 basis-32">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        data-slot="picker-name"
                        className="min-w-0 truncate text-body-s leading-snug font-semibold text-heading"
                      >
                        {creature.name}
                      </span>
                      {count !== undefined && (
                        <Badge
                          variant="secondary"
                          className="shrink-0"
                          aria-label={`${count} on the roster`}
                        >
                          ×{count}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-serif text-body-s leading-snug text-muted-foreground italic">
                      {kindAndXp(creature)}
                    </div>
                  </div>
                  <span className="ml-auto flex shrink-0 items-center gap-2.5">
                    <span className="font-mono text-mono leading-none font-medium whitespace-nowrap text-muted-foreground">
                      CR {creature.cr}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-muted-foreground hover:text-heading"
                      aria-label={`Add ${creature.name}`}
                      onClick={() => onPick(creature)}
                    >
                      <Icon name="plus" size={14} />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ))}

      {resource.state === "ready" && resource.value.nextCursor !== null && (
        <p className="mb-0 border-t border-hairline px-5 py-3 text-caption leading-body text-muted-foreground">
          More match than fit here. Narrow the CR, or type another word — the search reads the stat
          blocks too, so a trait works.
        </p>
      )}
    </Card>
  );
}
