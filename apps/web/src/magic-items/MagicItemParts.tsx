import type { Campaign, MagicItem, MagicItemCreate, MagicItemUpdate } from "@taverns/api";
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
import { CopyIntoCampaignSection } from "../library/CopyIn";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSelect,
  type FilterOption,
} from "../library/filters";
import type { ListQuery } from "../library/query";
import { routes, router } from "../routes";
import { DetailBody, DetailFacts, DetailSection } from "../ui/detail";
import { SaveFailure, Textarea } from "../ui/form";
import type { MagicItemQuery } from "./load";

const sourceRef = (index: string, name: string, _family: string) => ({
  index,
  name,
});

const CATEGORIES: ReadonlyArray<FilterOption> = [
  { value: "wondrous-items", label: "Wondrous Items" },
  { value: "potion", label: "Potion" },
  { value: "ring", label: "Ring" },
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "wand", label: "Wand" },
  { value: "staff", label: "Staff" },
  { value: "scroll", label: "Scroll" },
  { value: "rod", label: "Rod" },
  { value: "ammunition", label: "Ammunition" },
];

const RARITIES: ReadonlyArray<FilterOption> = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "very-rare", label: "Very Rare" },
  { value: "legendary", label: "Legendary" },
  { value: "artifact", label: "Artifact" },
  { value: "varies", label: "Varies" },
];

const SORTS: ReadonlyArray<FilterOption> = [
  { value: "name", label: "Name" },
  { value: "rarity", label: "Rarity" },
  { value: "recent", label: "Recent" },
];

const ATTUNEMENT: ReadonlyArray<FilterOption> = [
  { value: "", label: "Any attunement" },
  { value: "required", label: "Required" },
  { value: "none", label: "None" },
];

const VARIANTS: ReadonlyArray<FilterOption> = [
  { value: "", label: "Any variant state" },
  { value: "base", label: "Has variants" },
  { value: "variant", label: "Variant" },
  { value: "standalone", label: "Standalone" },
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
  list,
  busy,
  actions,
}: {
  readonly list: ListQuery<MagicItemQuery>;
  readonly busy: boolean;
  /** The tab's own write action(s), forwarded to `FilterBar`'s slot. */
  readonly actions?: ReactNode;
}) {
  const { value, patch } = list;
  return (
    <FilterBar narrowed={list.narrowed} onClear={list.clear} busy={busy} actions={actions}>
      <FilterSearch label="Search magic items" value={list.term} onChange={list.setTerm} />
      <FilterSelect
        label="Sort"
        value={value.sort}
        onChange={(sort) => patch({ sort: sort as MagicItemQuery["sort"] })}
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
        label="Rarity"
        values={value.rarities}
        onChange={(rarities) => patch({ rarities })}
        options={RARITIES}
        className="w-36"
      />
      <FilterSelect
        label="Attunement"
        value={value.attunement[0] ?? ""}
        onChange={(attunement) =>
          patch({ attunement: attunement === "" ? [] : [attunement as "required" | "none"] })
        }
        options={ATTUNEMENT}
        className="w-44"
      />
      <FilterSelect
        label="Variant"
        value={value.variantStates[0] ?? ""}
        onChange={(state) =>
          patch({
            variantStates: state === "" ? [] : [state as "base" | "variant" | "standalone"],
          })
        }
        options={VARIANTS}
        className="w-44"
      />
    </FilterBar>
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
      <DialogContent aria-label={`${magicItem.name} magic item`}>
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2.5 pr-8">
            <DialogTitle className="min-w-0 flex-1 break-words">{magicItem.name}</DialogTitle>
            {magicItem.origin === "system" && <Badge variant="secondary">SRD</Badge>}
            {ownerOf(magicItem) === "library" && <Badge variant="outline">Library</Badge>}
          </div>
          <DialogDescription className="font-serif italic">
            {magicItem.categoryName} · {magicItem.rarityName}
          </DialogDescription>
        </DialogHeader>
        <DetailBody>
          <DetailFacts
            facts={[
              { label: "Category", value: magicItem.categoryName },
              { label: "Rarity", value: magicItem.rarityName },
              { label: "Attunement", value: attunementLine(magicItem) },
              { label: "Variant state", value: variantLine(magicItem) },
            ]}
          />
          {(magicItem.magicItem.desc?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-3 text-body-s leading-body text-muted-foreground">
              {magicItem.magicItem.desc?.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          )}
          {(baseName !== undefined || variantNames.length > 0) && (
            <DetailSection title="Variants">
              <div className="flex flex-wrap gap-2">
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
              <p className="text-caption leading-body text-faint">
                Variant links come from the source graph; a campaign copy is a snapshot and does not
                borrow a base item from the bundle.
              </p>
            </DetailSection>
          )}
          {campaigns !== undefined && (
            <DetailSection>
              <CopyIntoCampaignSection
                noun="magic item"
                campaigns={campaigns}
                derive={(campaignId) => (client) =>
                  client.magicItems.derive({
                    params: { campaignId, magicItemId: magicItem.id },
                    payload: {},
                  })
                }
                readsChanged={(campaignId) => [reads.magicItems(campaignId)]}
                copiedLink={(campaign) => (
                  <a
                    className="text-link hover:text-link-hover"
                    href={router.history.createHref(
                      router.buildLocation({
                        to: routes.magicItems.to,
                        params: { campaignId: campaign.id },
                      }).publicHref,
                    )}
                  >
                    Open its magic items
                  </a>
                )}
              />
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
          <Textarea
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
