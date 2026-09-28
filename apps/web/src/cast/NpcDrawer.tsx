import {
  type Npc,
  NPC_WHEREABOUTS_MAX,
  type Session,
  type SessionId,
  UNNAMED_NPC,
} from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Toggle,
} from "@taverns/ui";
import { Result } from "effect";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";
import { SaveState } from "../ui/SaveState";
import { NpcAvatar } from "./NpcAvatar";
import type { NpcFields, NpcSaver } from "./npcAutosave";
import { ATTITUDES, metLine, nightLabel, STATUSES } from "./prep";

/** *First met*'s one option that is not a night. */
const NOT_MET = "";

/**
 * One NPC, opened from the Cast in the drawer the redesign draws beside it
 * (`Campaign Overview.dc.html`), for the quick fields: name, role, how they
 * talk, what they want, the DM's secret, whether the table can see them, and
 * the DM's prep: how they stand toward the party, whether they are alive,
 * where the party can find them, and the night the party first met them.
 * Everything deeper — rehearsal, knowledge, memory, Hob's research and
 * proposals, the rest of the persona — stays on the NPC's page, which
 * *Rehearse* opens.
 *
 * **A modal `Sheet`**, so Esc, the scrim and *Done* close it, focus moves in
 * and comes back, and the page behind does not scroll; its own body scrolls,
 * a modal's one exception to the window being the scroller. It covers the
 * whole app, top to bottom, its scrim over both nav rows — every modal sheet
 * does (`sheet.tsx`), where the drawing hung it under the chrome — 480px wide
 * or the whole width below that.
 *
 * **It saves as you type** (`npcAutosave.ts`): no *Save*, and *Done* only
 * closes. The role is the one line sent on the blur rather than the pause,
 * because the portrait is drawn once, from the first write that gives the NPC
 * a subject. An edit made elsewhere since the drawer opened is a `Conflict`,
 * offered a *Reload*.
 *
 * **What a shared NPC shows players is the public persona**, the manner and
 * the wants included; the secret goes only to the private material and is
 * marked *DM only*, and the share switch says so.
 *
 * **The prep is the DM's alone** (`NpcPrep`), saved through the same autosave
 * to its own endpoint. *Toward the party* and *Status* light at most one
 * toggle, and pressing the lit one clears it, since "not set" is a real state
 * and never a guess. *First met* is a control the drawing lacks — there it is
 * fixture data — and picks one of the campaign's nights, or *Not met yet*.
 *
 * *Archive* is the drawn *Remove from cast*, made reversible: the NPC moves to
 * the archived shelf, where *Restore* brings them back.
 */
export function NpcDrawer({
  npc,
  nights,
  saver,
  focusName,
  onClose,
  onArchived,
  onReload,
}: {
  /** The NPC as the Cast last read it: its portrait and its stored name. */
  readonly npc: Npc;
  /** The campaign's nights, newest first, for *First met*. */
  readonly nights: ReadonlyArray<Session>;
  readonly saver: NpcSaver;
  /** Just made by *Add NPC*: the name is focused, ready to type. */
  readonly focusName: boolean;
  readonly onClose: () => void;
  readonly onArchived: () => void;
  /** The row moved on under the drawer: read it again and start over from it. */
  readonly onReload: () => void;
}) {
  const [draft, setDraft] = useState<NpcFields>(saver.draft);
  const status = useSyncExternalStore(saver.subscribe, saver.getStatus);
  const nameRef = useRef<HTMLInputElement>(null);
  const archive = useMutation();
  const campaignId = npc.campaignId;

  const type = (fields: Partial<NpcFields>) => {
    setDraft((current) => ({ ...current, ...fields }));
    saver.type(fields);
  };
  const set = (fields: Partial<NpcFields>) => {
    setDraft((current) => ({ ...current, ...fields }));
    void saver.set(fields);
  };
  const settle = () => void saver.flush();

  // Closing, by any of its ways, sends what is still waiting — the role too.
  useEffect(() => () => void saver.flush(), [saver]);

  const archiveNow = async () => {
    // What was typed lands first, then nothing more is sent for this NPC.
    await saver.flush();
    saver.stop();
    const done = await archive.submit(
      (client) => client.npcs.archive({ params: { campaignId, npcId: npc.id }, payload: {} }),
      [reads.npcs(campaignId), reads.npc(npc.id)],
    );
    if (Result.isSuccess(done)) onArchived();
    else saver.resume();
  };

  const nameHeld = draft.name.trim() === "";
  // A blank NPC's placeholder shows as an empty field, and is no mistake;
  // emptying a name it was given is, and it keeps that name until retyped.
  const nameWanted = nameHeld && npc.name !== UNNAMED_NPC;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        data-slot="npc-drawer"
        initialFocus={focusName ? nameRef : true}
        className="w-cast-drawer max-w-full"
      >
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle>{nameHeld ? npc.name : draft.name.trim()}</SheetTitle>
          <SheetDescription>{metLine(draft.metSessionId, nights)}</SheetDescription>
          {status.state === "failed" && status.failure.kind === "conflict" ? (
            <SaveFailure failure={status.failure} onReload={onReload} />
          ) : (
            <SaveState status={status} onRetry={settle} />
          )}
        </SheetHeader>

        <div className="@container flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-gutter pb-gutter">
          <div className="relative h-cast-drawer-portrait shrink-0 overflow-hidden rounded-md border border-hairline bg-surface-sunken">
            <NpcAvatar name={npc.name} image={npc.image} size="card" />
            {npc.imagePending && (
              <Badge variant="outline" role="status" className="absolute bottom-2.5 left-card">
                Hob is drawing…
              </Badge>
            )}
          </div>

          <div className="grid gap-3.5 @sm:grid-cols-2">
            <Field
              label="Name"
              htmlFor="npc-drawer-name"
              error={
                nameWanted
                  ? `An NPC needs a name. Until they have one, they keep “${npc.name}”.`
                  : undefined
              }
            >
              <Input
                ref={nameRef}
                id="npc-drawer-name"
                placeholder="What the party calls them"
                aria-invalid={nameWanted}
                value={draft.name}
                onChange={(event) => type({ name: event.target.value })}
                onBlur={settle}
              />
            </Field>
            <Field label="Role" htmlFor="npc-drawer-role">
              <Input
                id="npc-drawer-role"
                placeholder="Innkeeper, rival, patron"
                value={draft.role}
                onChange={(event) => type({ role: event.target.value })}
                onBlur={settle}
              />
            </Field>
          </div>

          <PickOne
            id="npc-drawer-attitude"
            label="Toward the party"
            options={ATTITUDES}
            value={draft.attitude}
            onChange={(attitude) => set({ attitude })}
          />

          <PickOne
            id="npc-drawer-status"
            label="Status"
            options={STATUSES}
            value={draft.status}
            onChange={(status) => set({ status })}
          />

          <Field label="Where" htmlFor="npc-drawer-where">
            <Input
              id="npc-drawer-where"
              placeholder="Where the party can find them"
              maxLength={NPC_WHEREABOUTS_MAX}
              value={draft.whereabouts}
              onChange={(event) => type({ whereabouts: event.target.value })}
              onBlur={settle}
            />
          </Field>

          <Field label="First met" htmlFor="npc-drawer-met">
            <Select
              value={draft.metSessionId ?? NOT_MET}
              onValueChange={(value) =>
                set({
                  metSessionId: value === NOT_MET || value === null ? null : (value as SessionId),
                })
              }
            >
              <SelectTrigger id="npc-drawer-met" className="w-full">
                {/* Written here rather than left to Base UI: the value is a uuid,
                    and without this the trigger reads out a raw id. */}
                <SelectValue>
                  {(value) => {
                    const night = nights.find((row) => row.id === value);
                    return night === undefined ? "Not met yet" : nightLabel(night);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_MET}>Not met yet</SelectItem>
                {nights.map((night) => (
                  <SelectItem key={night.id} value={night.id}>
                    {nightLabel(night)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Voice and manner" htmlFor="npc-drawer-manner">
            <Textarea
              id="npc-drawer-manner"
              rows={2}
              className="min-h-0"
              placeholder="How you play them at the table."
              value={draft.manner}
              onChange={(event) => type({ manner: event.target.value })}
              onBlur={settle}
            />
          </Field>

          <Field label="What they want" htmlFor="npc-drawer-wants">
            <Textarea
              id="npc-drawer-wants"
              rows={2}
              className="min-h-0"
              placeholder="What they’d trade, lie or fight for."
              value={draft.wants}
              onChange={(event) => type({ wants: event.target.value })}
              onBlur={settle}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Icon name="eye-off" size={13} className="text-magic-ink" />
              <Label htmlFor="npc-drawer-secret">Secret</Label>
              <Badge variant="magic">DM only</Badge>
            </div>
            <Textarea
              id="npc-drawer-secret"
              rows={3}
              className="min-h-0"
              placeholder="What the party doesn’t know yet."
              value={draft.secrets}
              onChange={(event) => type({ secrets: event.target.value })}
              onBlur={settle}
            />
          </div>

          <VisibilityField
            id="npc-drawer-visibility"
            value={draft.visibility}
            onChange={(visibility) => set({ visibility })}
            shared="Players can see and talk to them: their whole persona, the manner and wants included, but never the secret, which stays with you."
            hidden="Only you see them. Share them when the table should meet them."
          />
        </div>

        <SheetFooter className="shrink-0 flex-row flex-wrap items-center border-t border-hairline">
          <Button
            variant="ghost"
            size="sm"
            disabled={archive.busy}
            onClick={() => void archiveNow()}
          >
            <Icon name="archive" size={14} />
            Archive
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/campaigns/$campaignId/cast/follow-up" params={{ campaignId }} />}
            >
              NPC follow-up
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/campaigns/$campaignId/cast/$npcId"
                  params={{ campaignId, npcId: npc.id }}
                  hash="rehearsal"
                />
              }
            >
              Rehearse
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
          {archive.failure !== undefined && (
            <div className="w-full">
              <SaveFailure failure={archive.failure} />
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A labelled row of toggles that lights at most one: pressing the lit one
 * clears it to `null`, as a note's category does.
 */
function PickOne<V extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly value: V; readonly label: string }>;
  readonly value: V | null;
  readonly onChange: (value: V | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="font-sans text-label leading-snug font-medium">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Toggle
            key={option.value}
            size="sm"
            className="rounded-pill"
            pressed={value === option.value}
            onPressedChange={(pressed) => onChange(pressed ? option.value : null)}
          >
            {option.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
}
