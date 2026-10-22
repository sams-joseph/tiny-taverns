import type { LevelId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { libraryLevelsAtom } from "../levels/load";
import { sizeLine } from "../levels/size";
import { Field } from "../ui/form";

/** The select's value for no level of the creator's choosing. */
const NONE = "none";

/**
 * Which of the creator's own Library levels a fight on this encounter is
 * played on. For a new encounter (`fresh`) no choice is a new, empty level
 * made with it (`EncounterCreate`); for a saved one it is the plain grid. The
 * creator's shelf is the only list: the server refuses any other account's
 * level as `NotFound` (`Encounters.levelColumns`). A fight copies the level
 * when it starts, so the hint says an edit is the next fight's.
 *
 * A level the shelf does not list (still loading, or deleted in another tab)
 * keeps its place as the encounter's value rather than reading as none.
 */
export function LevelPicker({
  fresh,
  value,
  onChange,
}: {
  /** A new encounter, whose create makes a level when none is picked. */
  readonly fresh: boolean;
  readonly value: LevelId | null;
  readonly onChange: (levelId: LevelId | null) => void;
}) {
  const [shelf] = useApiAtom(libraryLevelsAtom);
  const levels = shelf.state === "ready" ? shelf.value : [];
  const chosen = value === null ? undefined : levels.find((level) => level.id === value);
  const none = fresh ? "A new, empty level" : "None: a plain grid";

  return (
    <Field
      label="Level"
      htmlFor="encounter-level"
      hint={
        shelf.state === "failed"
          ? "Your levels could not be read; the encounter keeps the one it has."
          : fresh && value === null
            ? "A new, empty level is made in your Library with the encounter, named after it. Build the place in the level editor."
            : "A fight on it is played on a copy of the level, taken when it starts: editing the level later changes the next fight, not one under way."
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          value={value ?? NONE}
          onValueChange={(next) => onChange(next === NONE ? null : (String(next) as LevelId))}
          disabled={shelf.state !== "ready" && value === null}
        >
          <SelectTrigger id="encounter-level" className="min-w-60">
            <SelectValue>
              {(selected) =>
                selected === NONE
                  ? none
                  : (levels.find((level) => level.id === selected)?.name ?? "A level of yours")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{none}</SelectItem>
            {levels.map((level) => (
              <SelectItem key={level.id} value={level.id}>
                {level.name} · {sizeLine(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value !== null && (
          <Link
            to="/library/levels/$levelId"
            params={{ levelId: value }}
            className="text-body-s text-link hover:text-link-hover"
          >
            Open {chosen?.name ?? "the level"} in the editor
          </Link>
        )}
      </div>
    </Field>
  );
}
