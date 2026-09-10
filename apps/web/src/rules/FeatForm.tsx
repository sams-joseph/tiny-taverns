import type { Feat, FeatPrerequisiteAbilityInput, OptionVocabulary } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useMemo, useState } from "react";
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";

interface PrerequisiteDraft {
  readonly abilityScoreId: string;
  readonly minimumScore: string;
}

const linesFrom = (feat: Feat | undefined): string => feat?.description.join("\n") ?? "";

const prereqsFrom = (
  feat: Feat | undefined,
  firstAbilityId: string,
): ReadonlyArray<PrerequisiteDraft> =>
  feat === undefined || feat.prerequisites.length === 0
    ? firstAbilityId === ""
      ? []
      : [{ abilityScoreId: firstAbilityId, minimumScore: "13" }]
    : feat.prerequisites.map((prerequisite) => ({
        abilityScoreId: prerequisite.abilityScoreId,
        minimumScore: String(prerequisite.minimumScore),
      }));

export function FeatForm({
  feat,
  vocabulary,
  onClose,
  onSaved,
}: {
  readonly feat: Feat | undefined;
  readonly vocabulary: OptionVocabulary;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const firstAbilityId = vocabulary.abilities[0]?.id ?? "";
  const [name, setName] = useState(feat?.name ?? "");
  const [description, setDescription] = useState(linesFrom(feat));
  const [prerequisites, setPrerequisites] = useState(() => prereqsFrom(feat, firstAbilityId));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const problem = name.trim() === "" ? "Give it a name." : undefined;
  const parsedPrerequisites = useMemo(
    () =>
      prerequisites
        .filter((row) => row.abilityScoreId !== "")
        .map((row): FeatPrerequisiteAbilityInput | undefined => {
          const minimumScore = Number(row.minimumScore);
          if (!Number.isInteger(minimumScore) || minimumScore < 1 || minimumScore > 30)
            return undefined;
          return { abilityScoreId: row.abilityScoreId as never, minimumScore };
        }),
    [prerequisites],
  );
  const prereqProblem = parsedPrerequisites.some((row) => row === undefined)
    ? "Prerequisite scores must be whole numbers from 1 to 30."
    : undefined;

  const payload = () => ({
    name: name.trim(),
    description: description
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    prerequisites: parsedPrerequisites.filter(
      (row): row is FeatPrerequisiteAbilityInput => row !== undefined,
    ),
  });

  const save = async () => {
    setShowProblems(true);
    if (problem !== undefined || prereqProblem !== undefined) return;

    const write = (client: TavernsClient) =>
      feat === undefined
        ? client.library.createFeat({ payload: payload() })
        : client.library.updateFeat({ params: { featId: feat.id }, payload: payload() });

    const result = await submit(write, [reads.libraryFeats]);
    if (Result.isSuccess(result)) onSaved();
  };

  const remove = async () => {
    if (feat === undefined) return;
    const result = await submit(
      (client) => client.library.removeFeat({ params: { featId: feat.id } }),
      [reads.libraryFeats],
    );
    if (Result.isSuccess(result)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={feat === undefined ? "Write a feat" : `Edit ${feat.name}`}>
        <DialogHeader>
          <DialogTitle>{feat === undefined ? "Write a feat" : `Edit ${feat.name}`}</DialogTitle>
          <DialogDescription>
            It lives in your library, ready to share with a Shared World or use at your tables.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field label="Name" htmlFor="feat-name" error={showProblems ? problem : undefined}>
            <Input
              id="feat-name"
              value={name}
              aria-invalid={showProblems && problem !== undefined ? true : undefined}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="feat-description"
            hint="One paragraph or bullet per line."
          >
            <Textarea
              id="feat-description"
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-title leading-snug font-semibold text-heading">
                Ability prerequisites
              </h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPrerequisites([
                    ...prerequisites,
                    { abilityScoreId: firstAbilityId, minimumScore: "13" },
                  ])
                }
                disabled={firstAbilityId === ""}
              >
                Add prerequisite
              </Button>
            </div>
            {showProblems && prereqProblem !== undefined && (
              <p role="alert" className="text-caption leading-body text-danger-ink">
                {prereqProblem}
              </p>
            )}
            {prerequisites.map((row, index) => (
              <div key={String(index)} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                <select
                  aria-label={`Prerequisite ${String(index + 1)} ability`}
                  className="rounded-control border border-strong bg-surface-card px-3 py-2 text-body-s leading-body text-foreground"
                  value={row.abilityScoreId}
                  onChange={(event) =>
                    setPrerequisites(
                      prerequisites.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, abilityScoreId: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                >
                  {vocabulary.abilities.map((ability) => (
                    <option key={ability.id} value={ability.id}>
                      {ability.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Prerequisite ${String(index + 1)} score`}
                  value={row.minimumScore}
                  inputMode="numeric"
                  onChange={(event) =>
                    setPrerequisites(
                      prerequisites.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, minimumScore: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPrerequisites(prerequisites.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          {feat !== undefined && failure === undefined && (
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save feat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
