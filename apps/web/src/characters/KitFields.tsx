import type { EquipmentId, KitEquipment, KitPick, StartingKit } from "@taverns/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@taverns/ui";
import { Field } from "../ui/form";

/**
 * A starting kit as the source structures it, with its picks — the fieldset
 * the create form draws once for the class's kit and once for the
 * background's.
 *
 * The lines every member carries are said in a sentence, then one select per
 * *(a)/(b)* choice, and — where a side says *"any martial weapon"* or *"any
 * holy symbol"* — one select per pick over that category's rows. Side (a) is
 * the default so an untouched form still carries a coherent kit; a category
 * left unpicked lands on the Gear section as a line with no row behind it,
 * rather than as a thing nobody chose. Both sides are listed and the pick
 * decides, which is what `sheetGrantsFor` reads through `kitLinesFor` for the
 * class and the background alike.
 *
 * It was the class kit's JSX inline in the screen until the background grew a
 * kit of its own (2026-09-08); two copies of a fieldset with three selects in
 * it would have diverged first at the accessible names the tests drive.
 */
export function KitFields({
  idPrefix,
  legend,
  choiceLabel,
  kit,
  choices,
  rowsFor,
  onSide,
  onRow,
}: {
  /** What the control ids start with: `new-character-kit`, `new-character-background-kit`. */
  readonly idPrefix: string;
  readonly legend: string;
  /** What a side select is called: *Kit choice 1*, *Background kit choice 1*. */
  readonly choiceLabel: string;
  readonly kit: StartingKit;
  /** One entry per `kit.choices`, in order — the draft's own picks. */
  readonly choices: ReadonlyArray<KitPick>;
  /** The rows a category offers, spelled by the caller against its own option. */
  readonly rowsFor: (categoryIndex: string) => ReadonlyArray<KitEquipment>;
  readonly onSide: (index: number, option: number) => void;
  readonly onRow: (index: number, slot: number, equipmentId: EquipmentId | undefined) => void;
}) {
  if (kit.fixed.length === 0 && kit.choices.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="text-label leading-snug font-semibold text-heading">{legend}</legend>
      {kit.fixed.length > 0 && (
        <p className="text-caption leading-body text-muted-foreground">
          Comes with{" "}
          {kit.fixed
            .map((line) =>
              line.quantity > 1 ? `${String(line.quantity)} × ${line.name}` : line.name,
            )
            .join(", ")}
          .
        </p>
      )}
      {kit.choices.map((choice, index) => {
        const taken = choices[index] ?? { option: 0, picks: [] };
        const side = choice.options[taken.option] ?? choice.options[0];
        const slots = (side?.lines ?? []).flatMap((line) =>
          line.category === undefined
            ? []
            : Array.from({ length: line.quantity }, (_, at) => ({
                name: line.quantity > 1 ? `${line.name} (${String(at + 1)})` : line.name,
                category: line.category!,
              })),
        );
        // A choice with one side and nothing but a category — the 2014
        // background's *"any holy symbol"* — is the pick itself, so the side
        // select would be a control with one answer and is not drawn.
        const oneSide = choice.options.length === 1;
        return (
          <div key={`${choice.desc}-${String(index)}`} className="flex flex-wrap items-end gap-2.5">
            {!oneSide && (
              <Field
                label={`${choiceLabel} ${String(index + 1)}`}
                htmlFor={`${idPrefix}-${String(index)}`}
                hint={choice.desc}
              >
                <Select
                  value={String(taken.option)}
                  onValueChange={(value) => onSide(index, Number(value))}
                >
                  <SelectTrigger id={`${idPrefix}-${String(index)}`} className="w-64">
                    <SelectValue>
                      {(value) => choice.options[Number(value)]?.label ?? "Pick one"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {choice.options.map((option, at) => (
                      <SelectItem key={option.label} value={String(at)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {slots.map((slot, at) => {
              const rows = rowsFor(slot.category.index);
              const picked = taken.picks[at] ?? "";
              return (
                <Field
                  key={`${slot.category.index}-${String(at)}`}
                  label={slot.name}
                  htmlFor={`${idPrefix}-${String(index)}-${String(at)}`}
                  hint={oneSide && choice.desc !== "" ? choice.desc : undefined}
                >
                  <Select
                    value={picked}
                    onValueChange={(value) =>
                      onRow(index, at, value === "" ? undefined : (String(value) as EquipmentId))
                    }
                  >
                    <SelectTrigger
                      id={`${idPrefix}-${String(index)}-${String(at)}`}
                      className="w-48"
                    >
                      <SelectValue>
                        {(value) => rows.find((row) => row.id === value)?.name ?? "Pick one"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {rows.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              );
            })}
          </div>
        );
      })}
    </fieldset>
  );
}
