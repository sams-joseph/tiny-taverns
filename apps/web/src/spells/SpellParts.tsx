import type { Spell, SpellCreate } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useState, type ReactNode } from "react";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { FilterBar, FilterBox, FilterSelect, type FilterOption } from "../library/filters";
import type { FilterQuery } from "../library/query";
import { DetailBody, DetailFacts, DetailSection } from "../ui/detail";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { levelLabel, SPELL_FACETS, SPELL_SCHOOLS as SCHOOLS, type SpellQuery } from "./load";

const SORTS: ReadonlyArray<FilterOption> = [
  { value: "level", label: "Level" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recent" },
];

export function SpellFilters({
  list,
  sort,
  onSort,
  busy,
  actions,
}: {
  readonly list: FilterQuery;
  readonly sort: SpellQuery["sort"];
  readonly onSort: (sort: SpellQuery["sort"]) => void;
  readonly busy: boolean;
  /** The tab's own write action(s), forwarded to `FilterBar`'s slot. */
  readonly actions?: ReactNode;
}) {
  return (
    <FilterBar narrowed={list.narrowed} onClear={list.clear} busy={busy} actions={actions}>
      <FilterBox label="Search spells" list={list} facets={SPELL_FACETS} />
      <FilterSelect
        label="Sort"
        value={sort}
        onChange={(value) => onSort(value as SpellQuery["sort"])}
        options={SORTS}
        className="w-32"
      />
    </FilterBar>
  );
}

export function SpellGrid({
  spells,
  onOpen,
}: {
  readonly spells: ReadonlyArray<Spell>;
  readonly onOpen: (spell: Spell) => void;
}) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
      {spells.map((spell) => (
        <Card key={spell.id} className="gap-4">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{spell.name}</CardTitle>
                <CardDescription>
                  {levelLabel(spell.level)} · {spell.schoolName}
                </CardDescription>
              </div>
              {spell.origin === "system" && <Badge variant="secondary">SRD</Badge>}
            </div>
          </CardHeader>
          <CardContent className="gap-4">
            <div className="grid grid-cols-2 gap-2 text-label leading-label text-muted-foreground">
              <span>Casting</span>
              <span className="text-heading">{spell.castingTime}</span>
              <span>Range</span>
              <span className="text-heading">{spell.range}</span>
              <span>Duration</span>
              <span className="text-heading">{spell.duration}</span>
            </div>
            <p className="text-body-s leading-body text-muted-foreground">
              {spell.spell.desc[0] ?? "No description recorded."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {spell.ritual && <Badge variant="outline">Ritual</Badge>}
              {spell.concentration && <Badge variant="outline">Concentration</Badge>}
              {spell.classNames.slice(0, 3).map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => onOpen(spell)}>
              Details
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SpellDialog({
  spell,
  onClose,
}: {
  readonly spell: Spell;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent aria-label={`${spell.name} spell`}>
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2.5 pr-8">
            <DialogTitle className="min-w-0 flex-1 break-words">{spell.name}</DialogTitle>
            {spell.origin === "system" && <Badge variant="secondary">SRD</Badge>}
            {spell.ritual && <Badge variant="outline">Ritual</Badge>}
            {spell.concentration && <Badge variant="outline">Concentration</Badge>}
          </div>
          <DialogDescription className="font-serif italic">
            {levelLabel(spell.level)} · {spell.schoolName}
          </DialogDescription>
        </DialogHeader>
        <DetailBody>
          <DetailFacts
            facts={[
              { label: "Casting", value: spell.castingTime },
              { label: "Range", value: spell.range },
              { label: "Duration", value: spell.duration },
              { label: "Components", value: spell.spell.components.join(", ") || "—" },
              ...(spell.spell.material !== undefined
                ? [{ label: "Material", value: spell.spell.material }]
                : []),
              { label: "Classes", value: spell.classNames.join(", ") || "—" },
            ]}
          />
          {spell.spell.desc.length > 0 && (
            <div className="flex flex-col gap-3 text-body-s leading-body text-muted-foreground">
              {spell.spell.desc.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
          {spell.spell.higherLevel !== undefined && spell.spell.higherLevel.length > 0 && (
            <DetailSection title="At higher levels">
              <div className="flex flex-col gap-3 text-body-s leading-body text-muted-foreground">
                {spell.spell.higherLevel.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            </DetailSection>
          )}
        </DetailBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SpellCreateDialog({ onClose }: { readonly onClose: () => void }) {
  const mutation = useMutation();
  const [name, setName] = useState("");
  const [level, setLevel] = useState("0");
  const [school, setSchool] = useState("evocation");
  const [classes, setClasses] = useState("wizard");
  const [description, setDescription] = useState("");

  const save = async () => {
    const schoolName = school[0]!.toUpperCase() + school.slice(1);
    const classNames = classes
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    const payload: SpellCreate = {
      name,
      level: Number(level),
      school: { index: school, name: schoolName },
      castingTime: "1 action",
      range: "Self",
      duration: "Instantaneous",
      classes: classNames.map((item) => ({
        index: item.toLowerCase(),
        name: item,
      })),
      spell: {
        desc: description.trim() === "" ? [] : [description.trim()],
        components: ["V", "S"],
        school: { index: school, name: schoolName },
        classes: classNames.map((item) => ({
          index: item.toLowerCase(),
          name: item,
        })),
        subclasses: [],
      },
    };
    const result = await mutation.submit(
      (client) => client.library.createSpell({ payload }),
      [reads.librarySpells],
    );
    if (Result.isSuccess(result)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write a spell</DialogTitle>
          <DialogDescription>
            It starts in your Library and enters a campaign only as a copy.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-gutter py-3">
          <Field label="Name" htmlFor="spell-name">
            <Input
              id="spell-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Level" htmlFor="spell-level">
              <Select value={level} onValueChange={(value) => setLevel(value as string)}>
                <SelectTrigger id="spell-level" aria-label="Level">
                  <SelectValue>{(value) => levelLabel(Number(value))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, item) => (
                    <SelectItem key={item} value={String(item)}>
                      {levelLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="School" htmlFor="spell-school">
              <Select value={school} onValueChange={(value) => setSchool(value as string)}>
                <SelectTrigger id="spell-school" aria-label="School">
                  <SelectValue>
                    {(value) => {
                      const chosen = value as string;
                      return chosen[0]!.toUpperCase() + chosen.slice(1);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SCHOOLS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Classes" htmlFor="spell-classes" hint="Comma-separated, e.g. wizard, druid">
            <Input
              id="spell-classes"
              value={classes}
              onChange={(event) => setClasses(event.target.value)}
              placeholder="wizard, druid"
            />
          </Field>
          <Field label="Description" htmlFor="spell-description">
            <Textarea
              id="spell-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description"
            />
          </Field>
        </div>
        <DialogFooter>
          {mutation.failure !== undefined && <SaveFailure failure={mutation.failure} />}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.busy || name.trim() === ""}>
            Save spell
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
