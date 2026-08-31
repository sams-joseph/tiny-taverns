import type {
  Campaign,
  MagicItem,
  MagicItemCreate,
  MagicItemSort,
  MagicItemUpdate,
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
import type { MagicItemQuery } from "./load";

const sourceRef = (index: string, name: string, family: string) => ({
  index,
  name,
  url: `/api/2014/${family}/${index}`,
});

const categories = [
  ["", "Any category"],
  ["wondrous-items", "Wondrous Items"],
  ["potion", "Potion"],
  ["ring", "Ring"],
  ["weapon", "Weapon"],
  ["armor", "Armor"],
  ["wand", "Wand"],
  ["staff", "Staff"],
  ["scroll", "Scroll"],
  ["rod", "Rod"],
  ["ammunition", "Ammunition"],
] as const;

const rarities = [
  ["", "Any rarity"],
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["very-rare", "Very Rare"],
  ["legendary", "Legendary"],
  ["artifact", "Artifact"],
  ["varies", "Varies"],
] as const;

const sortLabels: ReadonlyArray<readonly [MagicItemSort, string]> = [
  ["name", "Name"],
  ["rarity", "Rarity"],
  ["recent", "Recently changed"],
];

const ownerOf = (item: MagicItem): "bundle" | "library" | "campaign" =>
  item.campaignId !== null ? "campaign" : item.accountId !== null ? "library" : "bundle";

const attunementLine = (item: MagicItem): string =>
  item.requiresAttunement ? (item.attunementRequirement ?? "requires attunement") : "No attunement";

const variantLine = (item: MagicItem): string =>
  item.isVariant
    ? `Variant of ${item.baseItemName ?? item.magicItem.baseItem?.name ?? "another item"}`
    : item.variantCount > 0
      ? `${item.variantCount} variants`
      : "Standalone item";

export function MagicItemFilters({
  query,
  onQuery,
}: {
  readonly query: MagicItemQuery;
  readonly onQuery: (query: MagicItemQuery) => void;
}) {
  const set = <K extends keyof MagicItemQuery>(key: K, value: MagicItemQuery[K]) =>
    onQuery({ ...query, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="w-64"
        value={query.q}
        onChange={(event) => set("q", event.target.value)}
        placeholder="Search magic items"
        aria-label="Search magic items"
      />
      <NativeSelect
        label="Sort"
        value={query.sort}
        onChange={(value) => set("sort", value as MagicItemSort)}
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
      <NativeSelect
        label="Rarity"
        value={query.rarities[0] ?? ""}
        onChange={(value) => set("rarities", value === "" ? [] : [value])}
      >
        {rarities.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        label="Attunement"
        value={query.attunement[0] ?? ""}
        onChange={(value) => set("attunement", value === "" ? [] : [value as "required" | "none"])}
      >
        <option value="">Any</option>
        <option value="required">Required</option>
        <option value="none">None</option>
      </NativeSelect>
      <NativeSelect
        label="Variant"
        value={query.variantStates[0] ?? ""}
        onChange={(value) =>
          set("variantStates", value === "" ? [] : [value as "base" | "variant" | "standalone"])
        }
      >
        <option value="">Any</option>
        <option value="base">Has variants</option>
        <option value="variant">Variant</option>
        <option value="standalone">Standalone</option>
      </NativeSelect>
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

export function MagicItemGrid({
  magicItems,
  onOpen,
  onEdit,
}: {
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly onOpen: (item: MagicItem) => void;
  readonly onEdit?: (item: MagicItem) => void;
}) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
      {magicItems.map((item) => (
        <Card key={item.id} className="gap-4">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{item.name}</CardTitle>
                <CardDescription>
                  {item.categoryName} · {item.rarityName}
                </CardDescription>
              </div>
              {item.origin === "system" && <Badge variant="secondary">SRD</Badge>}
              {ownerOf(item) === "library" && <Badge variant="outline">Library</Badge>}
            </div>
          </CardHeader>
          <CardContent className="gap-4">
            <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-label leading-label text-muted-foreground">
              <span>Rarity</span>
              <span className="text-heading">{item.rarityName}</span>
              <span>Attunement</span>
              <span className="text-heading">{attunementLine(item)}</span>
              <span>Variant</span>
              <span className="text-heading">{variantLine(item)}</span>
            </div>
            <p className="text-body-s leading-body text-muted-foreground">
              {item.magicItem.desc?.[0] ?? "No description recorded."}
            </p>
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

export function MagicItemDialog({
  magicItem,
  campaigns,
  onClose,
  onNavigateToName,
}: {
  readonly magicItem: MagicItem;
  readonly campaigns?: ReadonlyArray<Campaign>;
  readonly onClose: () => void;
  readonly onNavigateToName?: (name: string) => void;
}) {
  const variantNames =
    magicItem.variantNames.length > 0
      ? magicItem.variantNames
      : (magicItem.magicItem.variants ?? []).map((variant) => variant.name);
  const baseName = magicItem.baseItemName ?? magicItem.magicItem.baseItem?.name;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{magicItem.name}</DialogTitle>
          <DialogDescription>
            {magicItem.categoryName} · {magicItem.rarityName} · {attunementLine(magicItem)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(60vh,44rem)] flex-col gap-4 overflow-auto pr-1 text-body-s leading-body text-muted-foreground">
          {magicItem.magicItem.desc?.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-label leading-label">
            <dt>Category</dt>
            <dd className="text-heading">{magicItem.categoryName}</dd>
            <dt>Rarity</dt>
            <dd className="text-heading">{magicItem.rarityName}</dd>
            <dt>Attunement</dt>
            <dd className="text-heading">{attunementLine(magicItem)}</dd>
            <dt>Variant state</dt>
            <dd className="text-heading">{variantLine(magicItem)}</dd>
          </dl>
          {(baseName !== undefined || variantNames.length > 0) && (
            <div className="rounded-card border border-border bg-surface-sunken p-3">
              <h3 className="text-label leading-label font-semibold text-heading">Variants</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {baseName !== undefined && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigateToName?.(baseName)}
                    disabled={onNavigateToName === undefined}
                  >
                    Base: {baseName}
                  </Button>
                )}
                {variantNames.map((name) => (
                  <Button
                    key={name}
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateToName?.(name)}
                    disabled={onNavigateToName === undefined}
                  >
                    {name}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-label leading-label text-faint">
                Variant links come from the source graph; a campaign copy is a snapshot and does not
                borrow a base item from the bundle.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          {campaigns !== undefined && (
            <CopyMagicItemIntoCampaign magicItem={magicItem} campaigns={campaigns} />
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyMagicItemIntoCampaign({
  magicItem,
  campaigns,
}: {
  readonly magicItem: MagicItem;
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
            router.buildLocation({ to: routes.magicItems.to, params: { campaignId: copied.id } })
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
        client.magicItems.derive({
          params: { campaignId: chosen.id, magicItemId: magicItem.id },
          payload: {},
        }),
      [reads.magicItems(chosen.id)],
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

export function MagicItemFormDialog({
  magicItem,
  onClose,
}: {
  readonly magicItem?: MagicItem;
  readonly onClose: () => void;
}) {
  const mutation = useMutation();
  const [name, setName] = useState(magicItem?.name ?? "");
  const [category, setCategory] = useState(magicItem?.categoryIndex ?? "wondrous-items");
  const [categoryName, setCategoryName] = useState(magicItem?.categoryName ?? "Wondrous Items");
  const [rarity, setRarity] = useState(magicItem?.rarityIndex ?? "uncommon");
  const [rarityName, setRarityName] = useState(magicItem?.rarityName ?? "Uncommon");
  const [requiresAttunement, setRequiresAttunement] = useState(
    magicItem?.requiresAttunement ?? false,
  );
  const [attunementRequirement, setAttunementRequirement] = useState(
    magicItem?.attunementRequirement ?? "requires attunement",
  );
  const [description, setDescription] = useState(magicItem?.magicItem.desc?.join("\n\n") ?? "");

  const body = () => {
    const equipmentCategory = sourceRef(category, categoryName, "equipment-categories");
    const rarityRef = { index: rarity, name: rarityName };
    return {
      item: {
        index: name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-"),
        name,
      },
      equipmentCategory,
      rarity: rarityRef,
      desc:
        description.trim() === ""
          ? []
          : description.split("\n").filter((line) => line.trim() !== ""),
      requiresAttunement,
      attunementRequirement: requiresAttunement ? attunementRequirement : undefined,
      variant: false,
      variants: [],
    };
  };

  const save = async () => {
    const magicItemBody = body();
    const payload = {
      name,
      equipmentCategory: magicItemBody.equipmentCategory,
      rarity: magicItemBody.rarity,
      requiresAttunement,
      attunementRequirement: magicItemBody.attunementRequirement,
      desc: magicItemBody.desc,
      magicItem: magicItemBody,
    } satisfies MagicItemCreate;
    const result = await mutation.submit(
      (client) =>
        magicItem === undefined
          ? client.library.createMagicItem({ payload })
          : client.library.updateMagicItem({
              params: { magicItemId: magicItem.id },
              payload: payload satisfies MagicItemUpdate,
            }),
      [reads.libraryMagicItems],
    );
    if (Result.isSuccess(result)) onClose();
  };

  const remove = async () => {
    if (magicItem === undefined) return;
    const result = await mutation.submit(
      (client) => client.library.removeMagicItem({ params: { magicItemId: magicItem.id } }),
      [reads.libraryMagicItems],
    );
    if (Result.isSuccess(result)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {magicItem === undefined ? "Write magic item" : `Edit ${magicItem.name}`}
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
              value={rarity}
              onChange={(event) => setRarity(event.target.value)}
              placeholder="rarity key"
              aria-label="Rarity key"
            />
            <Input
              value={rarityName}
              onChange={(event) => setRarityName(event.target.value)}
              placeholder="Rarity name"
              aria-label="Rarity name"
            />
          </div>
          <label className="flex items-center gap-2 text-label leading-label text-muted-foreground">
            <input
              type="checkbox"
              checked={requiresAttunement}
              onChange={(event) => setRequiresAttunement(event.target.checked)}
            />
            Requires attunement
          </label>
          {requiresAttunement && (
            <Input
              value={attunementRequirement}
              onChange={(event) => setAttunementRequirement(event.target.value)}
              placeholder="requires attunement"
              aria-label="Attunement requirement"
            />
          )}
          <textarea
            className="min-h-32 rounded-card border border-border bg-surface-card px-3 py-2 text-body leading-body text-heading shadow-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            aria-label="Description"
          />
          {magicItem !== undefined && (
            <p className="text-label leading-label text-faint">
              Copies already in your campaigns stay where they are. Variant links are source data;
              your own item is saved as a standalone original.
            </p>
          )}
        </div>
        <DialogFooter>
          {mutation.failure !== undefined && <SaveFailure failure={mutation.failure} />}
          {magicItem !== undefined && (
            <Button variant="destructive" onClick={remove} disabled={mutation.busy}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.busy || name.trim() === ""}>
            {magicItem === undefined ? "Save magic item" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
