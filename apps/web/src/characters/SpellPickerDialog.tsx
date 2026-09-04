import type { CharacterSpellbook, OwnedCharacter, SpellKnown } from "@taverns/api";
import {
  eligibleKnownSpells,
  selectedSpellCounts,
  sheetWithSpellSelection,
  spellSelectionProblems,
} from "@taverns/api";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { characterSpellsAtom } from "./load";
import { ownCharacterWrites, saveOwnCharacter } from "./write";

const noteFor = (option: CharacterSpellbook["spells"][number]): string =>
  [
    option.spell.concentration ? "Concentration" : undefined,
    option.spell.ritual ? "Ritual" : undefined,
    option.spell.castingTime,
    option.spell.range,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" · ");

const initialKnown = (
  book: CharacterSpellbook,
  current: ReadonlyArray<SpellKnown>,
): ReadonlyArray<SpellKnown> => {
  const byId = new Map(book.spells.map((option) => [option.spell.id, option]));
  const byName = new Map(
    book.spells.map((option) => [option.spell.name.trim().toLowerCase(), option]),
  );
  return eligibleKnownSpells(
    book,
    current.flatMap((row) => {
      const option =
        row.spellId === undefined || row.spellId === null
          ? byName.get(row.name.trim().toLowerCase())
          : byId.get(row.spellId);
      if (option === undefined) return [];
      return [
        {
          name: option.spell.name,
          level: option.spell.level,
          spellId: option.spell.id,
          note: noteFor(option),
          ...(row.prepared === true ? { prepared: true } : {}),
        },
      ];
    }),
  );
};

const replace = (
  selected: ReadonlyArray<SpellKnown>,
  option: CharacterSpellbook["spells"][number],
  patch: { readonly known?: boolean; readonly prepared?: boolean },
): ReadonlyArray<SpellKnown> => {
  const existing = selected.find((row) => row.spellId === option.spell.id);
  const known = patch.known ?? existing !== undefined;
  const prepared = patch.prepared ?? existing?.prepared === true;
  const rest = selected.filter((row) => row.spellId !== option.spell.id);
  if (!known && !prepared) return rest;
  return [
    ...rest,
    {
      name: option.spell.name,
      level: option.spell.level,
      spellId: option.spell.id,
      note: noteFor(option),
      ...(prepared ? { prepared: true } : {}),
    },
  ];
};

function SpellPickerBody({
  owned,
  book,
  onClose,
  onSaved,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  readonly book: CharacterSpellbook;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onReload?: () => void;
}) {
  const character = owned.character;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlyArray<SpellKnown>>(() =>
    initialKnown(book, character.sheet.spellcasting?.known ?? []),
  );
  const { busy, failure, submit } = useMutation();
  const problems = spellSelectionProblems(book, selected);
  const counts = selectedSpellCounts(book, selected);
  const filtered = book.spells.filter((option) => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return true;
    return (
      option.spell.name.toLowerCase().includes(needle) ||
      option.spell.schoolName.toLowerCase().includes(needle) ||
      option.spell.spell.desc.some((line) => line.toLowerCase().includes(needle))
    );
  });
  const selectedIds = new Set(
    selected.flatMap((row) =>
      row.spellId === undefined || row.spellId === null ? [] : [row.spellId],
    ),
  );
  const preparedIds = new Set(
    selected.flatMap((row) =>
      row.prepared === true && row.spellId !== undefined && row.spellId !== null
        ? [row.spellId]
        : [],
    ),
  );

  const save = async () => {
    if (problems.length > 0) return;
    const saved = await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWithSpellSelection(character.sheet, book, selected),
        }),
      ownCharacterWrites(owned),
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  const limitLine = [
    book.limits.cantripsKnown === undefined
      ? undefined
      : `${String(counts.cantrips)}/${String(book.limits.cantripsKnown)} cantrips`,
    book.limits.spellsKnown === undefined
      ? undefined
      : `${String(counts.known)}/${String(book.limits.spellsKnown)} known`,
    book.limits.prepared === undefined
      ? undefined
      : `${String(counts.prepared)}/${String(book.limits.prepared)} prepared`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose spells</DialogTitle>
        <DialogDescription>
          {book.mode === "spellbook"
            ? "Pick the spells in your book, then mark the ones prepared. Cantrips are always ready."
            : book.mode === "prepared"
              ? "Mark cantrips you know and leveled spells you have prepared."
              : "Pick the spells you know. They are ready to cast from your slots."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Search spells"
            placeholder="Search spells"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-48 flex-1"
          />
          {limitLine !== "" && <Badge variant="outline">{limitLine}</Badge>}
        </div>
        {problems.length > 0 && (
          <div className="rounded-card border border-danger bg-surface-sunken px-3 py-2 text-caption leading-body text-danger">
            {problems.join(" ")}
          </div>
        )}
        {book.spells.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            No spells are available for this class and level from any table this character is at.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            No spell matches that search.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((option) => {
              const spell = option.spell;
              const selectedHere = selectedIds.has(spell.id);
              const preparedHere = preparedIds.has(spell.id);
              const canPrepare =
                spell.level > 0 && (book.mode === "prepared" || book.mode === "spellbook");
              const canKnow = book.mode !== "prepared" || spell.level === 0;
              return (
                <div
                  key={spell.id}
                  className={cn(
                    "grid grid-cols-1 gap-2 border-b border-hairline py-2 last:border-b-0 @md:grid-cols-[minmax(0,1fr)_auto]",
                    selectedHere || preparedHere ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-s leading-snug font-semibold text-heading">
                        {spell.name}
                      </span>
                      <Badge variant="outline">
                        {spell.level === 0 ? "Cantrip" : `L${String(spell.level)}`}
                      </Badge>
                      {option.list === "subclass" && <Badge variant="secondary">Subclass</Badge>}
                    </div>
                    <p className="mt-1 text-micro leading-body text-faint">
                      {[spell.schoolName, noteFor(option)].filter(Boolean).join(" · ")}
                    </p>
                    {spell.spell.desc[0] !== undefined && (
                      <p className="mt-1 max-w-measure text-caption leading-body text-muted-foreground">
                        {spell.spell.desc[0].slice(0, 220)}
                        {spell.spell.desc[0].length > 220 ? "…" : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 @md:justify-end">
                    {canKnow && (
                      <label className="flex items-center gap-2 text-caption leading-none text-foreground">
                        <Checkbox
                          aria-label={`Know ${spell.name}`}
                          checked={selectedHere}
                          onCheckedChange={(next) =>
                            setSelected((current) =>
                              replace(current, option, { known: Boolean(next) }),
                            )
                          }
                        />
                        Known
                      </label>
                    )}
                    {canPrepare && (
                      <label className="flex items-center gap-2 text-caption leading-none text-foreground">
                        <Checkbox
                          aria-label={`Prepare ${spell.name}`}
                          checked={preparedHere}
                          onCheckedChange={(next) =>
                            setSelected((current) =>
                              replace(current, option, {
                                prepared: Boolean(next),
                                known: book.mode === "spellbook" ? undefined : Boolean(next),
                              }),
                            )
                          }
                        />
                        Prepared
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DialogFooter>
        {failure !== undefined && (
          <div className="mr-auto min-w-0 flex-1 text-left">
            <SaveFailure failure={failure} onReload={onReload} />
          </div>
        )}
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy || problems.length > 0} onClick={() => void save()}>
          {busy ? "Saving…" : "Save spells"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SpellPickerDialog({
  owned,
  onClose,
  onSaved,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onReload?: () => void;
}) {
  const [resource, reload] = useApiAtom(characterSpellsAtom(owned.character.id));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Choose spells" className="@container">
        {resource.state === "loading" ? (
          <Loading label="Reading your spell list…" />
        ) : resource.state === "failed" ? (
          <div className="p-gutter">
            <FailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        ) : (
          <SpellPickerBody
            owned={owned}
            book={resource.value}
            onClose={onClose}
            onSaved={onSaved}
            onReload={onReload}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
