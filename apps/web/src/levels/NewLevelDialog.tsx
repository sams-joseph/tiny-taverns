import {
  LEVEL_NAME_MAX,
  LEVEL_SIZES,
  LEVEL_SQUARES_MAX,
  type Level,
  type LevelSize,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";
import { choiceLabel, SIZE_CHOICES } from "./size";

/** The size picker's value for a board of the creator's own size. */
const CUSTOM = "custom";

/** A square count the creator typed, or `undefined` when it is not one. */
const squares = (text: string): number | undefined => {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= LEVEL_SQUARES_MAX ? value : undefined;
};

/**
 * Starting a level in the owner's Library: a name and a size, nothing else.
 * The level starts as an empty board of no floor; what is on it is built
 * later.
 */
export function NewLevelDialog({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated: (level: Level) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<LevelSize | typeof CUSTOM>("medium");
  const [columns, setColumns] = useState(String(LEVEL_SIZES.medium.columns));
  const [rows, setRows] = useState(String(LEVEL_SIZES.medium.rows));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const board =
    size === CUSTOM ? { columns: squares(columns), rows: squares(rows) } : LEVEL_SIZES[size];
  const nameProblem = name.trim() === "" ? "Give the level a name." : undefined;
  const squaresProblem = `A whole number from 1 to ${String(LEVEL_SQUARES_MAX)}.`;

  const create = async () => {
    setShowProblems(true);
    if (nameProblem !== undefined || board.columns === undefined || board.rows === undefined) {
      return;
    }
    const { columns: across, rows: down } = board;
    const made = await submit(
      (client) =>
        client.libraryLevels.create({
          payload: { name: name.trim(), columns: across, rows: down },
        }),
      [reads.libraryLevels],
    );
    if (Result.isSuccess(made)) onCreated(made.success);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="New level">
        <DialogHeader>
          <DialogTitle>New level</DialogTitle>
          <DialogDescription>
            A battle map in your Library. It starts as an empty board.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 px-gutter py-3">
          <Field label="Name" htmlFor="level-name" error={showProblems ? nameProblem : undefined}>
            <Input
              id="level-name"
              maxLength={LEVEL_NAME_MAX}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Size" htmlFor="level-size" hint="One square is 5 feet.">
            <Select
              value={size}
              onValueChange={(value) => setSize(value as LevelSize | typeof CUSTOM)}
            >
              <SelectTrigger id="level-size" className="w-full">
                <SelectValue>
                  {(value) => (value === CUSTOM ? "Custom" : choiceLabel(value as LevelSize))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SIZE_CHOICES.map((choice) => (
                  <SelectItem key={choice.size} value={choice.size}>
                    {choiceLabel(choice.size)}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {size === CUSTOM && (
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Squares across"
                htmlFor="level-columns"
                error={showProblems && board.columns === undefined ? squaresProblem : undefined}
              >
                <Input
                  id="level-columns"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LEVEL_SQUARES_MAX}
                  value={columns}
                  onChange={(event) => setColumns(event.target.value)}
                />
              </Field>
              <Field
                label="Squares down"
                htmlFor="level-rows"
                error={showProblems && board.rows === undefined ? squaresProblem : undefined}
              >
                <Input
                  id="level-rows"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LEVEL_SQUARES_MAX}
                  value={rows}
                  onChange={(event) => setRows(event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={busy}>
            {busy ? "Creating…" : "Create level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
