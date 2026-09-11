import type { CampaignMembership, SharedWorldMembership, NpcCreate, NpcSource } from "@taverns/api";
import { Link } from "@tanstack/react-router";
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
import { Atom } from "effect/unstable/reactivity";
import { Result } from "effect";
import { useMemo, useState, type ReactNode } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { membershipsAtom } from "../campaign/load";
import { sharedWorldsAtom } from "../shared-world/load";
import { FilterBar, FilterBox } from "../library/filters";
import { LibraryNav } from "../library/LibraryNav";
import { useFilterQuery } from "../library/query";
import { TopBar } from "../shell/TopBar";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { NpcAvatar } from "./NpcCard";
import {
  emptyDraft,
  hasAdvanced,
  personaFrom,
  privateMaterialFrom,
  type NpcDraft,
} from "./persona";

const libraryNpcsAtom = Atom.family((archived: boolean) =>
  apiAtom(
    (client) => client.library.npcs({ query: archived ? { archived: true } : {} }),
    [reads.libraryNpcs],
  ),
);

const draftOfSource = (npc: NpcSource): NpcDraft => ({
  name: npc.name,
  role: npc.role,
  summary: npc.persona.identity?.summary ?? "",
  manner: npc.persona.voice?.manner ?? "",
  pronouns: npc.persona.identity?.pronouns ?? "",
  pronunciation: npc.persona.identity?.pronunciation ?? "",
  phrases: (npc.persona.voice?.phrases ?? []).join("\n"),
  exampleLines: (npc.persona.voice?.exampleLines ?? []).join("\n"),
  wants: npc.persona.intent?.wants ?? "",
  fears: npc.persona.intent?.fears ?? "",
  loyalties: npc.persona.intent?.loyalties ?? "",
  attitude: npc.persona.intent?.attitude ?? "",
  dodges: (npc.persona.boundaries?.dodges ?? []).join("\n"),
  refuses: (npc.persona.boundaries?.refuses ?? []).join("\n"),
  asksTheDm: (npc.persona.boundaries?.asksTheDm ?? []).join("\n"),
  secrets: npc.privateMaterial.secrets ?? "",
  instructions: npc.privateMaterial.instructions ?? "",
});

const sourceDescription = (source: NpcSource): string => {
  const summary = source.persona.identity?.summary?.trim() ?? "";
  if (summary !== "") return summary;
  const manner = source.persona.voice?.manner?.trim() ?? "";
  if (manner !== "") return manner;
  return "No persona written yet.";
};

const sourceMatches = (needle: string, npc: NpcSource): boolean => {
  const term = needle.trim().toLowerCase();
  if (term === "") return true;
  return [npc.name, npc.role, npc.persona.identity?.summary ?? "", npc.persona.voice?.manner ?? ""]
    .join("\n")
    .toLowerCase()
    .includes(term);
};

const sourcePayload = (draft: NpcDraft): NpcCreate => ({
  name: draft.name.trim(),
  role: draft.role.trim(),
  persona: personaFrom(draft),
  privateMaterial: privateMaterialFrom(draft),
});

function SourceDialog({
  source,
  onClose,
  onSaved,
}: {
  readonly source: NpcSource | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState<NpcDraft>(
    source === undefined ? emptyDraft : draftOfSource(source),
  );
  const [advanced, setAdvanced] = useState(source !== undefined && hasAdvanced(draft));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();
  const set = (key: keyof NpcDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const problem = draft.name.trim() === "" ? "Give them a name." : undefined;

  const save = async () => {
    setShowProblems(true);
    if (problem !== undefined) return;
    const payload = sourcePayload(draft);
    const saved = await submit(
      (client) =>
        source === undefined
          ? client.library.createNpc({ payload })
          : client.library.updateNpc({
              params: { npcId: source.id },
              payload: { ...payload, expectedVersion: source.version },
            }),
      source === undefined ? [reads.libraryNpcs] : [reads.libraryNpcs, reads.libraryNpc(source.id)],
    );
    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={source === undefined ? "New NPC source" : `Edit ${source.name}`}
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>
            {source === undefined ? "New NPC source" : `Edit ${source.name}`}
          </DialogTitle>
          <DialogDescription>
            Write a reusable original. Adding it to a campaign makes an independent Cast snapshot;
            later edits here do not rewrite copies.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field label="Name" htmlFor="npc-source-name" error={showProblems ? problem : undefined}>
            <Input
              id="npc-source-name"
              value={draft.name}
              onChange={(event) => set("name")(event.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="npc-source-role">
            <Input
              id="npc-source-role"
              value={draft.role}
              onChange={(event) => set("role")(event.target.value)}
            />
          </Field>
          <Field label="Who they are" htmlFor="npc-source-summary">
            <Textarea
              id="npc-source-summary"
              value={draft.summary}
              onChange={(event) => set("summary")(event.target.value)}
            />
          </Field>
          <Field label="How they talk" htmlFor="npc-source-manner">
            <Textarea
              id="npc-source-manner"
              value={draft.manner}
              onChange={(event) => set("manner")(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={advanced}
            aria-controls="npc-source-advanced"
            onClick={() => setAdvanced((open) => !open)}
          >
            <Icon name={advanced ? "chevron-up" : "chevron-down"} size={14} />
            {advanced ? "Hide advanced" : "Advanced"}
          </Button>
          {advanced && (
            <div id="npc-source-advanced" className="flex flex-col gap-6">
              <SourceSection title="Identity">
                <div className="grid gap-4 @md:grid-cols-2">
                  <Field label="Pronouns" htmlFor="npc-source-pronouns">
                    <Input
                      id="npc-source-pronouns"
                      value={draft.pronouns}
                      onChange={(event) => set("pronouns")(event.target.value)}
                    />
                  </Field>
                  <Field label="Pronunciation" htmlFor="npc-source-pronunciation">
                    <Input
                      id="npc-source-pronunciation"
                      value={draft.pronunciation}
                      onChange={(event) => set("pronunciation")(event.target.value)}
                    />
                  </Field>
                </div>
              </SourceSection>

              <SourceSection title="Voice">
                <Field label="Phrases they use" htmlFor="npc-source-phrases" hint="One per line.">
                  <Textarea
                    id="npc-source-phrases"
                    className="min-h-16"
                    value={draft.phrases}
                    onChange={(event) => set("phrases")(event.target.value)}
                  />
                </Field>
                <Field
                  label="Lines they have said"
                  htmlFor="npc-source-example-lines"
                  hint="Verbatim, one per line."
                >
                  <Textarea
                    id="npc-source-example-lines"
                    className="min-h-16"
                    value={draft.exampleLines}
                    onChange={(event) => set("exampleLines")(event.target.value)}
                  />
                </Field>
              </SourceSection>

              <SourceSection title="Motives">
                <div className="grid gap-4 @md:grid-cols-2">
                  <Field label="Wants" htmlFor="npc-source-wants">
                    <Textarea
                      id="npc-source-wants"
                      className="min-h-16"
                      value={draft.wants}
                      onChange={(event) => set("wants")(event.target.value)}
                    />
                  </Field>
                  <Field label="Fears" htmlFor="npc-source-fears">
                    <Textarea
                      id="npc-source-fears"
                      className="min-h-16"
                      value={draft.fears}
                      onChange={(event) => set("fears")(event.target.value)}
                    />
                  </Field>
                  <Field label="Loyalties" htmlFor="npc-source-loyalties">
                    <Textarea
                      id="npc-source-loyalties"
                      className="min-h-16"
                      value={draft.loyalties}
                      onChange={(event) => set("loyalties")(event.target.value)}
                    />
                  </Field>
                  <Field label="Attitude to the party" htmlFor="npc-source-attitude">
                    <Textarea
                      id="npc-source-attitude"
                      className="min-h-16"
                      value={draft.attitude}
                      onChange={(event) => set("attitude")(event.target.value)}
                    />
                  </Field>
                </div>
              </SourceSection>

              <SourceSection
                title="Boundaries"
                lede="What they will not go into — behaviour, not facts. A secret goes below."
              >
                <Field label="Dodges" htmlFor="npc-source-dodges" hint="One per line.">
                  <Textarea
                    id="npc-source-dodges"
                    className="min-h-16"
                    value={draft.dodges}
                    onChange={(event) => set("dodges")(event.target.value)}
                  />
                </Field>
                <Field label="Refuses outright" htmlFor="npc-source-refuses" hint="One per line.">
                  <Textarea
                    id="npc-source-refuses"
                    className="min-h-16"
                    value={draft.refuses}
                    onChange={(event) => set("refuses")(event.target.value)}
                  />
                </Field>
                <Field label="Says to ask the DM" htmlFor="npc-source-asks-dm" hint="One per line.">
                  <Textarea
                    id="npc-source-asks-dm"
                    className="min-h-16"
                    value={draft.asksTheDm}
                    onChange={(event) => set("asksTheDm")(event.target.value)}
                  />
                </Field>
              </SourceSection>

              <SourceSection
                title="Private material"
                lede="Only the source owner can copy this into a campaign. When another creator copies a source shared through a Shared World, secrets and instructions are left out."
                tone="private"
              >
                <Field label="Secrets" htmlFor="npc-source-secrets">
                  <Textarea
                    id="npc-source-secrets"
                    value={draft.secrets}
                    onChange={(event) => set("secrets")(event.target.value)}
                  />
                </Field>
                <Field label="Instructions from you" htmlFor="npc-source-instructions">
                  <Textarea
                    id="npc-source-instructions"
                    value={draft.instructions}
                    onChange={(event) => set("instructions")(event.target.value)}
                  />
                </Field>
              </SourceSection>
            </div>
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceSection({
  title,
  lede,
  tone = "public",
  children,
}: {
  readonly title: string;
  readonly lede?: string;
  readonly tone?: "public" | "private";
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={
        tone === "private"
          ? "flex flex-col gap-4 rounded-card border border-strong bg-surface-sunken p-4"
          : "flex flex-col gap-4 border-t border-hairline pt-4"
      }
    >
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-display text-body leading-title font-semibold text-heading">
          {tone === "private" && <Icon name="lock" size={14} className="text-faint" />}
          {title}
        </h3>
        {lede !== undefined && (
          <p className="text-caption leading-body text-muted-foreground">{lede}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function AddToCampaignDialog({
  source,
  memberships,
  onClose,
}: {
  readonly source: NpcSource;
  readonly memberships: ReadonlyArray<CampaignMembership>;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const campaigns = memberships.filter((membership) => membership.relation === "creator");
  const copy = async (membership: CampaignMembership) => {
    const saved = await submit(
      (client) =>
        client.npcs.copyFromSource({
          params: { campaignId: membership.campaign.id, sourceNpcId: source.id },
          payload: {},
        }),
      [reads.npcs(membership.campaign.id)],
    );
    if (Result.isSuccess(saved)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Add ${source.name} to a campaign`}>
        <DialogHeader>
          <DialogTitle>Add {source.name}</DialogTitle>
          <DialogDescription>
            This makes an independent campaign Cast snapshot. Later source edits do not update it;
            if another creator shared the source through your Shared World, their secrets are not
            copied.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-gutter py-3">
          {campaigns.length === 0 ? (
            <p className="text-body text-muted">You do not create any campaigns yet.</p>
          ) : (
            campaigns.map((membership) => (
              <Button
                key={membership.campaign.id}
                variant="outline"
                className="justify-start"
                onClick={() => void copy(membership)}
                disabled={busy}
              >
                <Icon name="copy" size={14} />
                {membership.campaign.name}
              </Button>
            ))
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  source,
  worlds,
  onClose,
}: {
  readonly source: NpcSource;
  readonly worlds: ReadonlyArray<SharedWorldMembership>;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  // The API list is already explicit-world-only; owner-ness narrows it to the
  // same authority `sharedWorldLibrary.share` requires. Campaign membership
  // has no place in this decision: a world owner with no campaign seat may
  // share, while a campaign creator who does not own the world may not.
  const ownedWorlds = worlds.filter((membership) => membership.isOwner);
  const share = async (worldId: (typeof ownedWorlds)[number]["sharedWorld"]["id"]) => {
    const saved = await submit(
      (client) =>
        client.sharedWorldLibrary.share({
          params: { worldId },
          payload: { kind: "npc", resourceId: source.id },
        }),
      [],
    );
    if (Result.isSuccess(saved)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Share ${source.name} with a Shared World`}>
        <DialogHeader>
          <DialogTitle>Share {source.name} with a Shared World</DialogTitle>
          <DialogDescription>
            Sharing lets creators in a Shared World add snapshots to their campaigns. The original
            stays in your Library, and another creator's copy does not receive your private
            material.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-gutter py-3">
          {ownedWorlds.length === 0 ? (
            <p className="text-body text-muted">
              Create or take ownership of a Shared World first.
            </p>
          ) : (
            ownedWorlds.map(({ sharedWorld }) => (
              <Button
                key={sharedWorld.id}
                variant="outline"
                className="justify-start"
                onClick={() => void share(sharedWorld.id)}
                disabled={busy}
              >
                <Icon name="hand-helping" size={14} />
                {sharedWorld.name}
              </Button>
            ))
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({
  source,
  onEdit,
  onAdd,
  onShare,
}: {
  readonly source: NpcSource;
  readonly onEdit: () => void;
  readonly onAdd: () => void;
  readonly onShare: () => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <NpcAvatar name={source.name} />
          <div className="min-w-0 flex-1">
            <CardTitle>{source.name}</CardTitle>
            {source.role !== "" && (
              <p className="text-caption leading-body text-muted-foreground">{source.role}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-7 shrink-0"
            aria-label={`Edit ${source.name}`}
            onClick={onEdit}
          >
            <Icon name="pencil" size={14} />
          </Button>
        </div>
        <CardDescription className="line-clamp-3">{sourceDescription(source)}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-1.5">
        {((source.privateMaterial.secrets ?? "").trim() !== "" ||
          (source.privateMaterial.instructions ?? "").trim() !== "") && (
          <Badge variant="outline">
            <Icon name="lock" size={11} />
            Private material
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={onShare}>
          <Icon name="hand-helping" size={13} />
          Share
        </Button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onAdd}>
          <Icon name="copy" size={13} />
          Add to campaign
        </Button>
      </CardContent>
    </Card>
  );
}

export function NpcLibraryScreen() {
  const filter = useFilterQuery([]);
  const [resource, reload] = useApiAtom(libraryNpcsAtom(false));
  const [membershipsResource] = useApiAtom(membershipsAtom);
  const [worldsResource] = useApiAtom(sharedWorldsAtom);
  const [editing, setEditing] = useState<NpcSource | "new" | undefined>();
  const [adding, setAdding] = useState<NpcSource | undefined>();
  const [sharing, setSharing] = useState<NpcSource | undefined>();

  const memberships = membershipsResource.state === "ready" ? membershipsResource.value : [];
  const worlds = worldsResource.state === "ready" ? worldsResource.value : [];
  const filtered = useMemo(
    () =>
      resource.state === "ready"
        ? resource.value.filter((source) => sourceMatches(filter.q, source))
        : [],
    [filter.q, resource],
  );

  return (
    <>
      <TopBar
        title="Library"
        subtitle={
          resource.state === "ready"
            ? `${filtered.length} NPC ${filtered.length === 1 ? "source" : "sources"}`
            : undefined
        }
        tabs={<LibraryNav />}
      />
      {resource.state === "loading" && <Loading label="Reading NPC sources…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {resource.state === "ready" && (
        <div className="flex flex-col gap-6">
          <FilterBar
            narrowed={filter.narrowed}
            onClear={filter.clear}
            actions={
              <Button size="sm" onClick={() => setEditing("new")}>
                <Icon name="plus" size={13} />
                Write an NPC source
              </Button>
            }
          >
            <FilterBox label="Search NPC sources" list={filter} />
          </FilterBar>
          {filtered.length === 0 ? (
            <EmptyState
              icon={filter.narrowed ? "search" : "user-round"}
              title={filter.narrowed ? "No NPCs match" : "No reusable NPCs yet"}
            >
              {!filter.narrowed
                ? "Write an original here, share it with a Shared World, then add snapshots to campaigns."
                : "Loosen the search to see more sources."}
            </EmptyState>
          ) : (
            <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
              {filtered.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onEdit={() => setEditing(source)}
                  onAdd={() => setAdding(source)}
                  onShare={() => setSharing(source)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {editing !== undefined && (
        <SourceDialog
          source={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void reload();
          }}
        />
      )}
      {adding !== undefined && (
        <AddToCampaignDialog
          source={adding}
          memberships={memberships}
          onClose={() => setAdding(undefined)}
        />
      )}
      {sharing !== undefined && (
        <ShareDialog source={sharing} worlds={worlds} onClose={() => setSharing(undefined)} />
      )}
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mt-6"
        render={<Link to="/library" />}
      >
        Back to monsters
      </Button>
    </>
  );
}
