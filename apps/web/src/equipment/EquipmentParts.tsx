import type { Equipment, EquipmentCreate, EquipmentUpdate } from "@taverns/api";
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
} from "@taverns/ui";
import { Result } from "effect";
import { useState, type ReactNode } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSelect,
  type FilterOption,
} from "../library/filters";
import type { ListQuery } from "../library/query";
import { DetailBody, DetailFacts, DetailSection } from "../ui/detail";
import { SaveFailure, Textarea } from "../ui/form";
import type { EquipmentQuery } from "./load";

const sourceRef = (index: string, name: string, _family: string) => ({
  index,
  name,
});

const CATEGORIES: ReadonlyArray<FilterOption> = [
  { value: "adventuring-gear", label: "Adventuring Gear" },
  { value: "armor", label: "Armor" },
  { value: "mounts-and-vehicles", label: "Mounts and Vehicles" },
  { value: "tools", label: "Tools" },
  { value: "weapon", label: "Weapons" },
];

const SORTS: ReadonlyArray<FilterOption> = [
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "weight", label: "Weight" },
  { value: "recent", label: "Recent" },
];

/**
 * The 2014 weapon properties, by source key — what the bundled corpus's rows
 * name. This replaced a bare "property key" text box; see the spells tab's
 * class facet for the reasoning, which is the same.
 */
const PROPERTIES: ReadonlyArray<FilterOption> = [
  { value: "ammunition", label: "Ammunition" },
  { value: "finesse", label: "Finesse" },
  { value: "heavy", label: "Heavy" },
  { value: "light", label: "Light" },
  { value: "loading", label: "Loading" },
  { value: "monk", label: "Monk" },
  { value: "reach", label: "Reach" },
  { value: "special", label: "Special" },
  { value: "thrown", label: "Thrown" },
  { value: "two-handed", label: "Two-handed" },
  { value: "versatile", label: "Versatile" },
];

const costLine = (equipment: Equipment): string =>
  `${equipment.costQuantity} ${equipment.costUnit}`;

const ownerOf = (equipment: Equipment): "bundle" | "library" | "campaign" =>
  equipment.campaignId !== null ? "campaign" : equipment.accountId !== null ? "library" : "bundle";

export function EquipmentFilters({
  list,
  busy,
  actions,
}: {
  readonly list: ListQuery<EquipmentQuery>;
  readonly busy: boolean;
  /** The tab's own write action(s), forwarded to `FilterBar`'s slot. */
  readonly actions?: ReactNode;
}) {
  const { value, patch } = list;
  return (
    <FilterBar narrowed={list.narrowed} onClear={list.clear} busy={busy} actions={actions}>
      <FilterSearch label="Search equipment" value={list.term} onChange={list.setTerm} />
      <FilterSelect
        label="Sort"
        value={value.sort}
        onChange={(sort) => patch({ sort: sort as EquipmentQuery["sort"] })}
        options={SORTS}
        className="w-32"
      />
      <FilterMultiSelect
        label="Category"
        values={value.categories}
        onChange={(categories) => patch({ categories })}
        options={CATEGORIES}
        className="w-44"
      />
      <FilterMultiSelect
        label="Property"
        values={value.properties}
        onChange={(properties) => patch({ properties })}
        options={PROPERTIES}
      />
    </FilterBar>
  );
}

export function EquipmentGrid({
  equipment,
  onOpen,
  onEdit,
}: {
  readonly equipment: ReadonlyArray<Equipment>;
  readonly onOpen: (equipment: Equipment) => void;
  readonly onEdit?: (equipment: Equipment) => void;
}) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
      {equipment.map((item) => (
        <Card key={item.id} className="gap-4">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{item.name}</CardTitle>
                <CardDescription>
                  {item.categoryName} · {costLine(item)}
                </CardDescription>
              </div>
              {item.origin === "system" && <Badge variant="secondary">SRD</Badge>}
              {ownerOf(item) === "library" && <Badge variant="outline">Library</Badge>}
            </div>
          </CardHeader>
          <CardContent className="gap-4">
            <div className="grid grid-cols-2 gap-2 text-label leading-label text-muted-foreground">
              <span>Category</span>
              <span className="text-heading">{item.categoryName}</span>
              <span>Cost</span>
              <span className="text-heading">{costLine(item)}</span>
              <span>Weight</span>
              <span className="text-heading">
                {item.weight === null ? "—" : `${item.weight} lb`}
              </span>
            </div>
            <p className="text-body-s leading-body text-muted-foreground">
              {item.equipment.desc?.[0] ??
                item.equipment.special?.[0] ??
                "No description recorded."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.gearCategoryName !== null && (
                <Badge variant="outline">{item.gearCategoryName}</Badge>
              )}
              {item.armorCategory !== null && <Badge variant="outline">{item.armorCategory}</Badge>}
              {item.weaponCategory !== null && (
                <Badge variant="outline">{item.weaponCategory}</Badge>
              )}
              {item.propertyNames.slice(0, 4).map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpen(item)}>
                Details
              </Button>
              {onEdit !== undefined && ownerOf(item) === "library" && (
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>
                  Edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EquipmentDialog({
  equipment,
  onClose,
}: {
  readonly equipment: Equipment;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent aria-label={`${equipment.name} equipment`}>
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2.5 pr-8">
            <DialogTitle className="min-w-0 flex-1 break-words">{equipment.name}</DialogTitle>
            {equipment.origin === "system" && <Badge variant="secondary">SRD</Badge>}
            {ownerOf(equipment) === "library" && <Badge variant="outline">Library</Badge>}
          </div>
          <DialogDescription className="font-serif italic">
            {equipment.categoryName}
            {equipment.gearCategoryName !== null ? ` · ${equipment.gearCategoryName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DetailBody>
          <DetailFacts
            facts={[
              { label: "Cost", value: costLine(equipment) },
              {
                label: "Weight",
                value: equipment.weight === null ? "—" : `${equipment.weight} lb`,
              },
              ...(equipment.armorClassBase !== null
                ? [
                    {
                      label: "Armor Class",
                      value: `${equipment.armorClassBase}${
                        equipment.armorClassDexBonus === true ? " + Dex" : ""
                      }${
                        equipment.armorClassMaxBonus !== null
                          ? ` (max ${equipment.armorClassMaxBonus})`
                          : ""
                      }`,
                    },
                  ]
                : []),
              ...(equipment.damageDice !== null
                ? [
                    {
                      label: "Damage",
                      value: `${equipment.damageDice} ${equipment.damageTypeName ?? ""}`.trim(),
                    },
                  ]
                : []),
              ...(equipment.rangeNormal !== null
                ? [
                    {
                      label: "Range",
                      value: `${equipment.rangeNormal}${
                        equipment.rangeLong !== null ? ` / ${equipment.rangeLong}` : ""
                      }`,
                    },
                  ]
                : []),
              ...(equipment.throwRangeNormal !== null
                ? [
                    {
                      label: "Thrown",
                      value: `${equipment.throwRangeNormal} / ${equipment.throwRangeLong}`,
                    },
                  ]
                : []),
              ...(equipment.equipment.contents !== undefined &&
              equipment.equipment.contents.length > 0
                ? [
                    {
                      label: "Contents",
                      value: equipment.equipment.contents
                        .map((content) => `${content.quantity} ${content.item.name}`)
                        .join(", "),
                    },
                  ]
                : []),
            ]}
          />
          {(equipment.equipment.desc?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3 text-body-s leading-body text-muted-foreground">
              {equipment.equipment.desc?.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
          {(equipment.equipment.special?.length ?? 0) > 0 && (
            <DetailSection title="Special">
              <div className="flex flex-col gap-3 text-body-s leading-body text-muted-foreground">
                {equipment.equipment.special?.map((line, index) => (
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

export function EquipmentFormDialog({
  equipment,
  onClose,
}: {
  readonly equipment?: Equipment;
  readonly onClose: () => void;
}) {
  const mutation = useMutation();
  const [name, setName] = useState(equipment?.name ?? "");
  const [category, setCategory] = useState(equipment?.categoryIndex ?? "adventuring-gear");
  const [categoryName, setCategoryName] = useState(equipment?.categoryName ?? "Adventuring Gear");
  const [gearCategory, setGearCategory] = useState(equipment?.gearCategoryIndex ?? "standard-gear");
  const [gearCategoryName, setGearCategoryName] = useState(
    equipment?.gearCategoryName ?? "Standard Gear",
  );
  const [costQuantity, setCostQuantity] = useState(String(equipment?.costQuantity ?? 1));
  const [costUnit, setCostUnit] = useState(equipment?.costUnit ?? "gp");
  const [weight, setWeight] = useState(
    equipment?.weight === null ? "" : String(equipment?.weight ?? ""),
  );
  const [description, setDescription] = useState(equipment?.equipment.desc?.join("\n\n") ?? "");

  const body = () => ({
    equipmentCategory: sourceRef(category, categoryName, "equipment-categories"),
    cost: { quantity: Number(costQuantity), unit: costUnit },
    weight: weight.trim() === "" ? undefined : Number(weight),
    gearCategory:
      gearCategory.trim() === ""
        ? undefined
        : sourceRef(gearCategory.trim(), gearCategoryName.trim(), "equipment-categories"),
    desc:
      description.trim() === "" ? [] : description.split("\n").filter((line) => line.trim() !== ""),
  });

  const save = async () => {
    const equipmentBody = body();
    const payload = {
      name,
      equipmentCategory: equipmentBody.equipmentCategory,
      cost: equipmentBody.cost,
      weight: equipmentBody.weight,
      gearCategory: equipmentBody.gearCategory,
      equipment: equipmentBody,
    } satisfies EquipmentCreate;
    const result = await mutation.submit(
      (client) =>
        equipment === undefined
          ? client.library.createEquipment({ payload })
          : client.library.updateEquipment({
              params: { equipmentId: equipment.id },
              payload: payload satisfies EquipmentUpdate,
            }),
      [reads.libraryEquipment],
    );
    if (Result.isSuccess(result)) onClose();
  };

  const remove = async () => {
    if (equipment === undefined) return;
    const result = await mutation.submit(
      (client) => client.library.removeEquipment({ params: { equipmentId: equipment.id } }),
      [reads.libraryEquipment],
    );
    if (Result.isSuccess(result)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {equipment === undefined ? "Write equipment" : `Edit ${equipment.name}`}
          </DialogTitle>
          <DialogDescription>
            It starts in your Library and enters a campaign only as a copy.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 px-gutter py-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            aria-label="Name"
          />
          <div className="grid gap-3 @xl:grid-cols-2">
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="category key"
              aria-label="Category key"
            />
            <Input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Category name"
              aria-label="Category name"
            />
          </div>
          <div className="grid gap-3 @xl:grid-cols-2">
            <Input
              value={gearCategory}
              onChange={(event) => setGearCategory(event.target.value)}
              placeholder="gear category key"
              aria-label="Gear category key"
            />
            <Input
              value={gearCategoryName}
              onChange={(event) => setGearCategoryName(event.target.value)}
              placeholder="Gear category name"
              aria-label="Gear category name"
            />
          </div>
          <div className="grid gap-3 @xl:grid-cols-3">
            <Input
              value={costQuantity}
              onChange={(event) => setCostQuantity(event.target.value)}
              placeholder="1"
              aria-label="Cost quantity"
              inputMode="numeric"
            />
            <Input
              value={costUnit}
              onChange={(event) => setCostUnit(event.target.value)}
              placeholder="gp"
              aria-label="Cost unit"
            />
            <Input
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="Weight"
              aria-label="Weight"
              inputMode="decimal"
            />
          </div>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            aria-label="Description"
          />
        </div>
        <DialogFooter>
          {mutation.failure !== undefined && <SaveFailure failure={mutation.failure} />}
          {equipment !== undefined && (
            <Button variant="destructive" onClick={remove} disabled={mutation.busy}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.busy || name.trim() === ""}>
            {equipment === undefined ? "Save equipment" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
