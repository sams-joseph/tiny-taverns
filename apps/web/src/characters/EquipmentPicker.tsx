import type { Equipment } from "@taverns/api";
import { Badge, Button, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { EQUIPMENT_FACETS, equipmentQueryOf, type EquipmentQuery } from "../equipment/load";
import { FilterBox } from "../library/filters";
import { useFilterQuery } from "../library/query";
import { FailureNotice, Loading } from "../ui/states";
import { compactGearLine } from "./gearFacts";

/**
 * Choosing gear from the equipment catalogue, inside the Gear dialog —
 * `campaign/CreaturePicker.tsx`'s shape over the equipment Library.
 *
 * **It reads the owner's Library shelf and nothing wider.** `library.equipment`
 * is the bundle plus this account's own originals, under `libraryRowReadable`
 * — the same read the Library's equipment tab makes, with the same facets
 * (`EQUIPMENT_FACETS`: category and property) in the same `FilterInput`. A
 * player picking gear onto their own sheet gets exactly what they could browse
 * on the shelf; no new predicate, no campaign in the path, because a character
 * is account-owned and campaign-scoped nowhere.
 *
 * **The search goes to the server**, as the creature picker's does: the name
 * by `ILIKE` and the document by full text, so *"climb"* finds the rope by its
 * description. A `.filter` over one loaded page would lose that half.
 *
 * **One page, and it says so when there are more.** A picker is a list you look
 * down, and the catalogue is 237 rows plus whatever was authored; the line
 * under the list is what keeps a player from concluding an item does not exist
 * because it sorted past the first page. `SHOWN` is the creature picker's.
 *
 * Picking hands the whole `Equipment` row back rather than an id: the dialog
 * writes the line (name, weight, link) from it and keeps the row to derive a
 * weapon's attack on save, so the row is read once and read here.
 */

/** As many as are worth looking down before typing another letter. */
const SHOWN = 25;

/**
 * One page of the reachable catalogue, keyed on the settled query — a record
 * key, compared structurally (see `api/atoms.ts`), at module scope because an
 * atom is its own identity. Named on `reads.libraryEquipment` so an original
 * written on the Library shelf appears here without a reload.
 */
const pickerAtom = Atom.family((query: EquipmentQuery) =>
  apiAtom(
    (client) =>
      client.library.equipment({
        query: {
          q: query.q,
          sort: "name",
          categories: query.categories,
          properties: query.properties,
          limit: SHOWN,
        },
      }),
    [reads.libraryEquipment],
  ),
);

export function EquipmentPicker({ onPick }: { readonly onPick: (row: Equipment) => void }) {
  const list = useFilterQuery(EQUIPMENT_FACETS);
  // Keyed on the settled query, not the keystroke — the key is what says "a
  // different read", so the debounce inside `useFilterQuery` is what the
  // request count follows.
  const [resource, reload] = useApiAtom(pickerAtom(equipmentQueryOf(list, "name")));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterBox label="Search equipment" list={list} facets={EQUIPMENT_FACETS} />
        {list.narrowed && (
          <Button variant="ghost" size="sm" onClick={list.clear}>
            Clear
          </Button>
        )}
      </div>

      {resource.state === "loading" && <Loading label="Reading the catalogue…" />}
      {resource.state === "failed" && <FailureNotice failure={resource.failure} onRetry={reload} />}

      {resource.state === "ready" &&
        (resource.value.items.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            Nothing in the catalogue answers to that. Try a shorter word, or type the line in by
            hand below.
          </p>
        ) : (
          <ul
            aria-label="Equipment to pick from"
            className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-hairline"
          >
            {resource.value.items.map((row, index) => (
              <li
                key={row.id}
                className={
                  index === 0
                    ? "flex items-center gap-2.5 px-3 py-2"
                    : "flex items-center gap-2.5 border-t border-hairline px-3 py-2"
                }
              >
                <Icon name="package" size={15} className="shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-s leading-body text-foreground">{row.name}</p>
                  <p className="truncate text-micro leading-body text-faint">
                    {compactGearLine(row)}
                  </p>
                </div>
                {/* The bundled corpus, against an original this account wrote
                    — worth marking because it is the one kind of row nobody
                    typed. */}
                {row.origin === "system" && <Badge variant="outline">Shared corpus</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Add ${row.name}`}
                  onClick={() => onPick(row)}
                >
                  <Icon name="plus" size={15} />
                </Button>
              </li>
            ))}
          </ul>
        ))}

      {resource.state === "ready" && resource.value.nextCursor !== null && (
        <p className="text-body-s leading-body text-muted-foreground">
          More match than fit here. Type another word, or narrow by category.
        </p>
      )}
    </div>
  );
}
