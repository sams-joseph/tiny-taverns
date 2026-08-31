import type { Campaign, Spell, SpellCreate } from "@taverns/api";
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
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { routes, router } from "../routes";
import { SaveFailure } from "../ui/form";
import type { SpellLevelKey, SpellQuery } from "./load";

const levelLabel = (level: number): string => (level === 0 ? "Cantrip" : `Level ${level}`);

export function SpellFilters({
  query,
  onQuery,
}: {
  readonly query: SpellQuery;
  readonly onQuery: (query: SpellQuery) => void;
}) {
  const set = <K extends keyof SpellQuery>(key: K, value: SpellQuery[K]) =>
    onQuery({ ...query, [key]: value });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="w-64"
        value={query.q}
        onChange={(event) => set("q", event.target.value)}
        placeholder="Search spells"
        aria-label="Search spells"
      />
      <NativeSelect
        label="Level"
        value={query.levels[0] ?? ""}
        onChange={(value) => set("levels", value === "" ? [] : [value as SpellLevelKey])}
      >
        <option value="">Any level</option>
        {Array.from({ length: 10 }, (_, level) => (
          <option key={level} value={String(level)}>
            {levelLabel(level)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        label="School"
        value={query.schools[0] ?? ""}
        onChange={(value) => set("schools", value === "" ? [] : [value])}
      >
        <option value="">Any school</option>
        {[
          "abjuration",
          "conjuration",
          "divination",
          "enchantment",
          "evocation",
          "illusion",
          "necromancy",
          "transmutation",
        ].map((school) => (
          <option key={school} value={school}>
            {school[0]!.toUpperCase() + school.slice(1)}
          </option>
        ))}
      </NativeSelect>
      <Input
        className="w-40"
        value={query.classes[0] ?? ""}
        onChange={(event) =>
          set("classes", event.target.value.trim() === "" ? [] : [event.target.value.trim()])
        }
        placeholder="class key"
        aria-label="Class key"
      />
      <ToggleFlag
        pressed={query.ritual === true}
        label="Ritual"
        onClick={() => set("ritual", query.ritual === true ? undefined : true)}
      />
      <ToggleFlag
        pressed={query.concentration === true}
        label="Concentration"
        onClick={() => set("concentration", query.concentration === true ? undefined : true)}
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

function ToggleFlag({
  pressed,
  label,
  onClick,
}: {
  readonly pressed: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <Button variant={pressed ? "default" : "secondary"} size="sm" onClick={onClick}>
      {label}
    </Button>
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
  campaigns,
  onClose,
}: {
  readonly spell: Spell;
  readonly campaigns?: ReadonlyArray<Campaign>;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{spell.name}</DialogTitle>
          <DialogDescription>
            {levelLabel(spell.level)} · {spell.schoolName} · {spell.castingTime}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(60vh,44rem)] flex-col gap-4 overflow-auto pr-1 text-body-s leading-body text-muted-foreground">
          {spell.spell.desc.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {spell.spell.higherLevel !== undefined && spell.spell.higherLevel.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-display text-title leading-title font-semibold text-heading">
                At higher levels
              </h3>
              {spell.spell.higherLevel.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </section>
          )}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-label leading-label">
            <dt>Components</dt>
            <dd className="text-heading">{spell.spell.components.join(", ") || "—"}</dd>
            {spell.spell.material !== undefined && (
              <>
                <dt>Material</dt>
                <dd className="text-heading">{spell.spell.material}</dd>
              </>
            )}
            <dt>Classes</dt>
            <dd className="text-heading">{spell.classNames.join(", ") || "—"}</dd>
          </dl>
        </div>
        <DialogFooter>
          {campaigns !== undefined && <CopySpellIntoCampaign spell={spell} campaigns={campaigns} />}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopySpellIntoCampaign({
  spell,
  campaigns,
}: {
  readonly spell: Spell;
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
            router.buildLocation({ to: routes.spells.to, params: { campaignId: copied.id } })
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
        client.spells.derive({ params: { campaignId: chosen.id, spellId: spell.id }, payload: {} }),
      [reads.spells(chosen.id)],
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
      school: { index: school, name: schoolName, url: `/api/2014/magic-schools/${school}` },
      castingTime: "1 action",
      range: "Self",
      duration: "Instantaneous",
      classes: classNames.map((item) => ({
        index: item.toLowerCase(),
        name: item,
        url: `/api/2014/classes/${item.toLowerCase()}`,
      })),
      spell: {
        desc: description.trim() === "" ? [] : [description.trim()],
        components: ["V", "S"],
        school: { index: school, name: schoolName, url: `/api/2014/magic-schools/${school}` },
        classes: classNames.map((item) => ({
          index: item.toLowerCase(),
          name: item,
          url: `/api/2014/classes/${item.toLowerCase()}`,
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
        <div className="grid gap-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            aria-label="Name"
          />
          <NativeSelect label="Level" value={level} onChange={setLevel}>
            {Array.from({ length: 10 }, (_, item) => (
              <option key={item} value={String(item)}>
                {levelLabel(item)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect label="School" value={school} onChange={setSchool}>
            {[
              "abjuration",
              "conjuration",
              "divination",
              "enchantment",
              "evocation",
              "illusion",
              "necromancy",
              "transmutation",
            ].map((item) => (
              <option key={item} value={item}>
                {item[0]!.toUpperCase() + item.slice(1)}
              </option>
            ))}
          </NativeSelect>
          <Input
            value={classes}
            onChange={(event) => setClasses(event.target.value)}
            placeholder="wizard, druid"
            aria-label="Classes"
          />
          <textarea
            className="min-h-32 rounded-card border border-border bg-surface-card px-3 py-2 text-body leading-body text-heading shadow-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            aria-label="Description"
          />
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
