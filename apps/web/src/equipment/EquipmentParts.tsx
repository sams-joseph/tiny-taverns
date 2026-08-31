import type {
  Campaign,
  Equipment,
  EquipmentCreate,
  EquipmentSort,
  EquipmentUpdate,
} from "@taverns/api";
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
  Icon,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useMemo, useState, type ReactNode } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { routes, router } from "../routes";
import { SaveFailure } from "../ui/form";
import { equipmentTextValues, type EquipmentQuery } from "./load";

const sourceRef = (index: string, name: string, family: string) => ({
  index,
  name,
  url: `/api/2014/${family}/${index}`,
});

const categories = [
  ["", "Any category"],
  ["adventuring-gear", "Adventuring Gear"],
  ["armor", "Armor"],
  ["mounts-and-vehicles", "Mounts and Vehicles"],
  ["tools", "Tools"],
  ["weapon", "Weapons"],
] as const;

const sortLabels: ReadonlyArray<readonly [EquipmentSort, string]> = [
  ["name", "Name"],
  ["cost", "Cost"],
  ["weight", "Weight"],
  ["recent", "Recently changed"],
];

const costLine = (equipment: Equipment): string =>
  `${equipment.costQuantity} ${equipment.costUnit}`;

const ownerOf = (equipment: Equipment): "bundle" | "library" | "campaign" =>
  equipment.campaignId !== null ? "campaign" : equipment.accountId !== null ? "library" : "bundle";

export function EquipmentFilters({
  query,
  onQuery,
}: {
  readonly query: EquipmentQuery;
  readonly onQuery: (query: EquipmentQuery) => void;
}) {
  const set = <K extends keyof EquipmentQuery>(key: K, value: EquipmentQuery[K]) =>
    onQuery({ ...query, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="w-64"
        value={query.q}
        onChange={(event) => set("q", event.target.value)}
        placeholder="Search equipment"
        aria-label="Search equipment"
      />
      <NativeSelect
        label="Sort"
        value={query.sort}
        onChange={(value) => set("sort", value as EquipmentSort)}
      >
        {sortLabels.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        label="Category"
        value={query.categories[0] ?? ""}
        onChange={(value) => set("categories", value === "" ? [] : [value])}
      >
        {categories.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <Input
        className="w-40"
        value={query.properties.join(", ")}
        onChange={(event) => set("properties", equipmentTextValues(event.target.value))}
        placeholder="property key"
        aria-label="Property keys"
      />
    </div>
  );
}

function NativeSelect({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-label leading-label font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-9 rounded-control border border-border bg-surface-card px-2 text-label leading-label text-heading shadow-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
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
  campaigns,
  onClose,
}: {
  readonly equipment: Equipment;
  readonly campaigns?: ReadonlyArray<Campaign>;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{equipment.name}</DialogTitle>
          <DialogDescription>
            {equipment.categoryName} · {costLine(equipment)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(60vh,44rem)] flex-col gap-4 overflow-auto pr-1 text-body-s leading-body text-muted-foreground">
          {equipment.equipment.desc?.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-label leading-label">
            <dt>Cost</dt>
            <dd className="text-heading">{costLine(equipment)}</dd>
            <dt>Weight</dt>
            <dd className="text-heading">
              {equipment.weight === null ? "—" : `${equipment.weight} lb`}
            </dd>
            {equipment.armorClassBase !== null && (
              <>
                <dt>Armor Class</dt>
                <dd className="text-heading">
                  {equipment.armorClassBase}
                  {equipment.armorClassDexBonus === true ? " + Dex" : ""}
                  {equipment.armorClassMaxBonus !== null
                    ? ` (max ${equipment.armorClassMaxBonus})`
                    : ""}
                </dd>
              </>
            )}
            {equipment.damageDice !== null && (
              <>
                <dt>Damage</dt>
                <dd className="text-heading">
                  {equipment.damageDice} {equipment.damageTypeName}
                </dd>
              </>
            )}
            {equipment.rangeNormal !== null && (
              <>
                <dt>Range</dt>
                <dd className="text-heading">
                  {equipment.rangeNormal}
                  {equipment.rangeLong !== null ? ` / ${equipment.rangeLong}` : ""}
                </dd>
              </>
            )}
            {equipment.throwRangeNormal !== null && (
              <>
                <dt>Thrown</dt>
                <dd className="text-heading">
                  {equipment.throwRangeNormal} / {equipment.throwRangeLong}
                </dd>
              </>
            )}
            {equipment.equipment.contents !== undefined &&
              equipment.equipment.contents.length > 0 && (
                <>
                  <dt>Contents</dt>
                  <dd className="text-heading">
                    {equipment.equipment.contents
                      .map((content) => `${content.quantity} ${content.item.name}`)
                      .join(", ")}
                  </dd>
                </>
              )}
          </dl>
          {equipment.equipment.special?.map((line, index) => (
            <p key={`special-${index}`}>{line}</p>
          ))}
        </div>
        <DialogFooter>
          {campaigns !== undefined && (
            <CopyEquipmentIntoCampaign equipment={equipment} campaigns={campaigns} />
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyEquipmentIntoCampaign({
  equipment,
  campaigns,
}: {
  readonly equipment: Equipment;
  readonly campaigns: ReadonlyArray<Campaign>;
}) {
  const mutation = useMutation();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const chosen = campaigns.find((campaign) => campaign.id === campaignId);
  const [copied, setCopied] = useState<Campaign | undefined>();
  const href = useMemo(
    () =>
      copied === undefined
        ? undefined
        : router.history.createHref(
            router.buildLocation({ to: routes.equipment.to, params: { campaignId: copied.id } })
              .publicHref,
          ),
    [copied],
  );

  if (campaigns.length === 0) {
    return <p className="text-label leading-label text-faint">Run a campaign to copy this in.</p>;
  }

  const submit = async () => {
    if (chosen === undefined) return;
    const result = await mutation.submit(
      (client) =>
        client.equipment.derive({
          params: { campaignId: chosen.id, equipmentId: equipment.id },
          payload: {},
        }),
      [reads.equipment(chosen.id)],
    );
    if (Result.isSuccess(result)) setCopied(chosen);
  };

  return (
    <div className="mr-auto flex flex-wrap items-center gap-2">
      <select
        className="h-9 rounded-control border border-border bg-surface-card px-2 text-label leading-label text-heading shadow-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={campaignId}
        onChange={(event) => setCampaignId(event.target.value)}
        aria-label="Campaign to copy into"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {campaign.name}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={submit} disabled={mutation.busy || chosen === undefined}>
        <Icon name="copy" size={13} />
        Copy into campaign
      </Button>
      {mutation.failure !== undefined && <SaveFailure failure={mutation.failure} />}
      {href !== undefined && (
        <a className="text-label leading-label text-accent-ink underline" href={href}>
          Copied to {copied?.name}
        </a>
      )}
    </div>
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
        <div className="grid gap-3">
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
          <textarea
            className="min-h-32 rounded-card border border-border bg-surface-card px-3 py-2 text-body leading-body text-heading shadow-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            aria-label="Description"
          />
          {equipment !== undefined && (
            <p className="text-label leading-label text-faint">
              Copies already in your campaigns stay where they are.
            </p>
          )}
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
