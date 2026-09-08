import type {
  Ability,
  CampaignId,
  CharacterId,
  Equipment,
  InventoryItem,
  OwnedCharacter,
  SheetAction,
  SheetResource,
  Trait,
} from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, cn, Icon } from "@taverns/ui";

import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { AppShell, TopBar } from "../shell/AppShell";
import { DetailFacts } from "../ui/detail";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { AbilitiesDialog } from "./AbilitiesDialog";
import { AddToCampaignDialog } from "./AddToCampaignDialog";
import { campaignsAvailableToJoin } from "./join";
import { BackstoryDialog } from "./BackstoryDialog";
import { DeleteCharacterDialog } from "./DeleteCharacterDialog";
import { GearDialog } from "./GearDialog";
import { compactGearLine, gearFacts, gearWeight } from "./gearFacts";
import { IdentityDialog } from "./IdentityDialog";
import { SkillsDialog } from "./SkillsDialog";
import { SpellPickerDialog } from "./SpellPickerDialog";
import { type LiveBanner, liveBanner } from "./live";
import { loadCharacterSheet } from "./load";
import {
  notationForD20,
  parseDiceExpression,
  rollAbilityCheck,
  rollDetail,
  rollDiceExpression,
  type LocalRoll,
  type RollMode,
} from "./rolls";
import {
  actionRows,
  coins,
  costLabel,
  drawnSections,
  hitPoints,
  sectionInView,
  type SheetSectionId,
  type SheetSectionSpec,
  slotRows,
  usesNote,
} from "./sheet";
import {
  AbilityCell,
  DeathSaveRow,
  HpTrack,
  KeyVal,
  Mark,
  Portrait,
  SectionSpine,
  SheetSection,
  StatPill,
} from "./SheetParts";
import {
  ownCharacterWrites,
  restOwnCharacter,
  saveOwnCharacter,
  sheetWith,
  spendResource,
} from "./write";

/**
 * One character, whole — `ui_kits/dm-screen/CharacterSheetB.jsx` (the seventh
 * delivery's *"Variant B — one continuous sheet, no tabs"*) against the real
 * API, and **the one screen in the product where somebody who is not a DM
 * writes.**
 *
 * ### The shape: three columns, one document, and a spine
 *
 * Wide, the drawing is a `252px / minmax(0,1fr) / 186px` grid: a sticky
 * identity card, one continuous column of sections, and a sticky **spine** — a
 * table of contents whose lit item follows the reader's scroll and whose press
 * scrolls the reader to a section. Narrow, the same single surface: the card
 * collapses to a two-line summary that expands on a press, the spine flattens
 * into a sticky rail of pills, and every two-column grid inside the document
 * becomes one. The threshold is the app's container idiom rather than the
 * drawing's `window.innerWidth < 900`: `main` is the `@container`, and `@3xl`
 * is the step at which a 900px window's column (836px, inside the page gutter)
 * is wide enough for the three tracks — the same step the tabbed sheet already
 * used for its two. Inside the middle column the document is its **own**
 * container, so a grid there turns over on the width the column actually has,
 * which the Hob panel can take 400px out of without the window moving.
 *
 * The sheet scrolls in a scroller this screen owns rather than in the shell's
 * column — `fill`, the runner's mode — because both sticky columns and the
 * scroll-spy need a top edge that is *this screen's*: under the shell's
 * scroller the sticky `TopBar` would park them, and its height is neither a
 * token nor constant between screens (the Chronicle's aside is not sticky for
 * exactly this reason). Owning the scroller is what makes `top-0` true.
 *
 * ### Where each thing on it comes from
 *
 * Nine columns and one `jsonb` document, and the split is the one `Character.ts`
 * argues: name, player, level, race, subrace, class, AC, hit points, temp,
 * conditions and `sheetUrl` are columns; the thirty-odd fields the drawing adds
 * are optional keys on `sheet`, which is why the whole of this screen cost no
 * migration. `descriptor` is generated from the identity columns and is drawn
 * once, under the name — never recomputed here, because a second implementation
 * of it is exactly what the generated column exists to prevent.
 *
 * ### Which sections are drawn
 *
 * `drawnSections(sheet, true)` in `sheet.ts` — the tabbed sheet's `sheetTabs`
 * rule, spelled over the seven sections the continuous sheet has. *Abilities &
 * skills*, *Gear & coin* and *Story* are drawn on a writable sheet whether or
 * not they hold anything, because each carries the affordance that creates its
 * own contents; *Actions*, *Spellcasting*, *Features & traits* and *Level ups*
 * appear only when the document fills them. Spellcasting is editable once it
 * exists because the authoritative picker needs the class context already on
 * the row; the others remain content-driven. The spine lists exactly the drawn
 * sections and nothing else.
 *
 * ### What it writes, and where the boundary is
 *
 * Seven durable surfaces, one endpoint — `PATCH /me/characters/:characterId`
 * through `write.ts`, which is where the endpoint is named once and where the
 * whole-document race is written down. The durable columns are the top bar's
 * *Edit*; the six cells, the skill list, spell preparation, the backstory and
 * the carried list are their sections' own header actions; a death save is the
 * pip itself. **Every
 * one of them re-reads the screen afterwards** rather than patching what it
 * holds, because a write here changes something it did not send: `descriptor`
 * is a generated column, so editing the level rewrites the line under the name.
 *
 * The boundary is not enforced here and must not be restated here. Which rows
 * is `ownRowWritable` on the server; which columns is `CharacterOwnUpdate`,
 * which has no field for `hpCurrent`, `tempHp`, `conditions`, `visibility` or
 * `accountId`. A control for one of those would not compile.
 *
 * ### Keeping your place across a write
 *
 * The tabbed sheet lifted the open tab above the resource because a re-read
 * unmounted the body and an uncontrolled strip threw the reader back to Stats.
 * The continuous sheet has the same hazard in a worse form — after *Add* → *Save
 * gear* the reader must still be looking at Gear, not the top of the sheet —
 * and it is answered in two layers, both deliberate:
 *
 * 1. **The previous document stays rendered while the re-read is in flight.**
 *    `useApiAtom` holds the last value through a refresh (`ready` with
 *    `refreshing: true`, `api/atoms.ts`), so the scroller, its sections and its
 *    scroll position are never unmounted by a save; `Loading` is drawn only
 *    when there is no document at all. Measured in Chromium: across a gear save
 *    the scroller kept its `scrollTop` and its node identity, and the new line
 *    drew in place.
 * 2. **The lit section and the scroll position are held above the resource
 *    anyway.** `active` is screen state, and the scroller's last `scrollTop` is
 *    kept in a ref and restored by a layout effect whenever the document
 *    (re)mounts — so the one case the atom cannot cover, a character id
 *    changing under the same screen or a failure that really does replace the
 *    body, lands the reader where they were rather than at the top. It is the
 *    rule the campaign screens follow for a search term and an open dialog, and
 *    the same reason: the state belongs to the screen, not to what it is showing.
 *
 * ### The live banner, and where it stops
 *
 * *"The Salt Road is playing right now · session 12 · round 3 · Brannoc is up"*
 * and the *Go to the table* action beside it read `GET /campaigns/:c/table` —
 * `PlayerLiveTable`, a distinct schema on a distinct endpoint, which is the
 * rule `PlayerSessionRecap` set and the reason a monster's numbers cannot
 * arrive here even by mistake. What it says in each of its four states, and why
 * it draws nothing at all in the commonest of them, is `live.ts`. The drawing
 * puts a campaign badge and a permanent *Go to the table* in the bar; neither
 * is drawn here unless the state justifies it, which is `live.ts`'s call and
 * not the layout's.
 *
 * ### What is still deliberately absent
 *
 * - **The live half of the row.** Current hit points, temporary hit points and
 *   conditions are drawn and are not editable — they are `0014`'s live trio and
 *   the DM's to move, which is why the payload has no field for any of them.
 * - **Rolling is browser-local.** A check rolled "to your DM's dice tray" has
 *   no endpoint at all, so dice buttons write only the ephemeral *Your rolls*
 *   panel and its feedback says that truth. Preparing a spell is a picker over
 *   the authoritative spell domain; a portrait and a journal entry are document
 *   keys with no drawn control behind them in this build. They are drawn as the
 *   values they are.
 */

/** How far below the scroller's top edge the reading line sits, in CSS pixels. */
const SPY_SLACK = 60;

type LoggedRollState = "local" | "sending" | "sent" | "failed";
interface LoggedRoll extends LocalRoll {
  readonly localId: string;
  readonly state: LoggedRollState;
  readonly message: string;
}

const newRollRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `roll-${String(Date.now())}-${String(Math.random())}`;

const criticalFrom = (roll: LocalRoll): "hit" | "miss" | undefined =>
  roll.natural === 20 ? "hit" : roll.natural === 1 ? "miss" : undefined;

/**
 * One line of the Actions section — `CharacterSheetB.jsx`'s `BAttack` row: the
 * name, a kind line, the to-hit and the notation, plus the cost as a badge.
 *
 * **The cost is drawn and nothing is ticked** — the captain's decision D6: a
 * turn's spending is gone when the turn ends and nothing holds it, so the badge
 * says what a line costs and the sheet keeps no per-turn state. The badge wears
 * the `outline` variant rather than a variant of its own; the system ships none
 * for an economy and inventing a token is not this screen's to do. The dice are
 * rollable when the notation is parseable, and the result stays local to this
 * browser until the table-roll slice exists.
 */
function RollButton({
  label,
  face,
  onRoll,
}: {
  readonly label: string;
  readonly face: string;
  readonly onRoll: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={onRoll}
      className="h-7 gap-1 px-1.5 font-mono text-micro leading-none"
    >
      <Icon name="dices" size={13} />
      {face}
    </Button>
  );
}

function ActionLine({
  action,
  onRoll,
}: {
  readonly action: SheetAction;
  readonly onRoll: (label: string, notation: string, mode?: RollMode) => void;
}) {
  const cost = costLabel(action.cost);
  const kind = [action.text, action.damageType, action.range].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const hit =
    action.hit === undefined || action.hit === "" || action.hit === "—" ? undefined : action.hit;
  const hitNotation = hit === undefined ? undefined : notationForD20(hit);
  const dice = action.dice === undefined || action.dice === "" ? undefined : action.dice;
  const diceRollable = dice !== undefined && parseDiceExpression(dice) !== undefined;
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2.5 border border-hairline bg-surface-sunken px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-body-s leading-snug font-semibold text-heading">{action.name}</p>
        {kind.length > 0 && (
          <p className="text-micro leading-body text-muted-foreground">{kind.join(" · ")}</p>
        )}
      </div>
      {cost !== undefined && <Badge variant="outline">{cost}</Badge>}
      {hitNotation !== undefined && hit !== undefined && (
        <RollButton
          label={`Roll ${action.name} attack ${hit}`}
          face={hit}
          onRoll={() => onRoll(`${action.name} attack`, hitNotation, undefined)}
        />
      )}
      {hit !== undefined && hitNotation === undefined && (
        <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
          {hit}
        </span>
      )}
      {diceRollable && dice !== undefined && (
        <RollButton
          label={`Roll ${action.name} dice ${dice}`}
          face={dice}
          onRoll={() => onRoll(action.name, dice, "normal")}
        />
      )}
      {dice !== undefined && !diceRollable && (
        <span className="rounded-xs bg-surface-raised px-1.5 py-px font-mono text-micro leading-snug text-accent-ink">
          {dice}
        </span>
      )}
    </div>
  );
}

const resourceLeft = (resource: SheetResource): number => Math.max(0, resource.max - resource.used);

function PipButton({
  spent,
  label,
  disabled,
  onClick,
}: {
  readonly spent: boolean;
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "size-4 rotate-45 border transition-control focus-visible:outline-none focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50",
        spent ? "border-strong bg-transparent" : "border-magic bg-magic",
      )}
    />
  );
}

function ResourceControls({
  resource,
  busy,
  onSpend,
}: {
  readonly resource: SheetResource;
  readonly busy: boolean;
  readonly onSpend: (resource: SheetResource, amount: number) => void;
}) {
  const left = resourceLeft(resource);
  const recharge =
    resource.recharge === "short"
      ? "short rest"
      : resource.recharge === "long"
        ? "long rest"
        : resource.recharge;
  const count = `${String(left)}/${String(resource.max)}${resource.unit === undefined ? "" : ` ${resource.unit}`}`;
  const pipCount = Math.min(resource.max, 12);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-micro leading-none text-accent-ink">
        {count} · {recharge}
      </span>
      {pipCount > 0 && resource.unit !== "hp" ? (
        <span className="flex gap-1">
          {Array.from({ length: pipCount }, (_, index) => {
            const spent = index < resource.used;
            return (
              <PipButton
                key={index}
                spent={spent}
                disabled={busy}
                label={`${spent ? "Recover" : "Spend"} ${resource.name} ${String(index + 1)}`}
                onClick={() => onSpend(resource, spent ? -1 : 1)}
              />
            );
          })}
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || resource.used <= 0}
            onClick={() => onSpend(resource, -1)}
          >
            Recover
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || left <= 0}
            onClick={() => onSpend(resource, 1)}
          >
            Spend
          </Button>
        </div>
      )}
    </div>
  );
}

function Feature({
  trait,
  note,
  resource,
  busy,
  onSpend,
}: {
  readonly trait: Trait;
  readonly note?: string | undefined;
  readonly resource?: SheetResource | undefined;
  readonly busy: boolean;
  readonly onSpend: (resource: SheetResource, amount: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{trait.name}</span>
        {note !== undefined && note !== "" && resource === undefined && (
          <span className="text-micro leading-none text-accent-ink">{note}</span>
        )}
      </div>
      {resource !== undefined && (
        <ResourceControls resource={resource} busy={busy} onSpend={onSpend} />
      )}
      {trait.text !== "" && (
        <p className="mt-1 max-w-measure text-caption leading-body text-muted-foreground">
          {trait.text}
        </p>
      )}
    </div>
  );
}

function RollModeControl({
  mode,
  onMode,
}: {
  readonly mode: RollMode;
  readonly onMode: (mode: RollMode) => void;
}) {
  const modes: ReadonlyArray<{ readonly mode: RollMode; readonly label: string }> = [
    { mode: "normal", label: "Normal" },
    { mode: "advantage", label: "Adv" },
    { mode: "disadvantage", label: "Dis" },
  ];
  return (
    <div
      className="flex rounded-pill border border-hairline bg-surface-sunken p-0.5"
      aria-label="D20 roll mode"
    >
      {modes.map((item) => {
        const active = mode === item.mode;
        return (
          <button
            key={item.mode}
            type="button"
            aria-pressed={active}
            onClick={() => onMode(item.mode)}
            className={cn(
              "rounded-pill px-2 py-1 text-micro leading-none font-medium transition-control focus-visible:outline-none focus-visible:ring-focus",
              active
                ? "bg-accent-soft text-accent-ink"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RollLog({
  rolls,
  mode,
  onMode,
}: {
  readonly rolls: ReadonlyArray<LoggedRoll>;
  readonly mode: RollMode;
  readonly onMode: (mode: RollMode) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-card py-2.5">
        <h2 className="flex-1 text-label-s leading-none font-semibold tracking-caps uppercase text-muted-foreground">
          Your rolls
        </h2>
        <RollModeControl mode={mode} onMode={onMode} />
      </div>
      <CardContent className="space-y-3 pt-card">
        <p className="text-caption leading-body text-muted-foreground">
          Rolls appear here immediately. During an open night, this sheet also sends them to the
          table's dice tray.
        </p>
        {rolls.length === 0 ? (
          <p className="text-caption leading-body text-faint">No rolls yet.</p>
        ) : (
          <ol className="space-y-1.5" aria-label="Your rolls log">
            {rolls.map((roll) => (
              <li
                key={roll.localId}
                className="flex min-h-10 flex-wrap items-center gap-2 border border-hairline bg-surface-sunken px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 text-body-s leading-snug font-semibold text-heading">
                  {roll.label}
                </span>
                <span className="font-display text-title leading-none font-semibold text-accent-ink">
                  {roll.total}
                </span>
                {roll.natural !== undefined && (
                  <Badge variant={roll.natural === 20 ? "success" : "destructive"}>
                    nat {roll.natural}
                  </Badge>
                )}
                <Badge
                  variant={
                    roll.state === "sent"
                      ? "success"
                      : roll.state === "failed"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {roll.state === "sending" ? "sending" : roll.state === "sent" ? "sent" : "local"}
                </Badge>
                <span className="basis-full font-mono text-micro leading-snug text-muted-foreground">
                  {rollDetail(roll)}
                </span>
                <span className="basis-full text-micro leading-snug text-muted-foreground">
                  {roll.message}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryLine({
  item,
  row,
  first,
}: {
  readonly item: InventoryItem;
  /** The equipment row the line names, when the sheet could read it. */
  readonly row: Equipment | undefined;
  readonly first: boolean;
}) {
  const [open, setOpen] = useState(false);
  const weight = gearWeight(item, row);
  const detailsId = `gear-${item.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div className={cn("flex flex-col py-1", first ? "" : "border-t border-hairline")}>
      <div className="flex min-h-10 flex-wrap items-center gap-2.5">
        <Icon
          name={item.equipped === true ? "shield" : "package"}
          size={15}
          className={item.equipped === true ? "shrink-0 text-accent-ink" : "shrink-0 text-faint"}
        />
        <div className="min-w-0 flex-1">
          <span className="text-body-s leading-body text-foreground">{item.name}</span>
          {row !== undefined && (
            /* **The row's facts, compact, under the name.** A linked line
               draws what its equipment row says — the kind of thing it is,
               what it rolls or is worth, its cost — so the gear a character
               carries reads as the catalogue's rows rather than as names. An
               unlinked line, or one whose row is out of reach, draws exactly
               as it always did: the name and whatever was typed beside it. */
            <p className="text-micro leading-body text-faint">{compactGearLine(row)}</p>
          )}
        </div>
        {item.note !== undefined && item.note !== "" && (
          <Badge variant="outline">{item.note}</Badge>
        )}
        {item.quantity !== undefined && (
          <span className="font-mono text-mono leading-none text-muted-foreground">
            ×{item.quantity}
          </span>
        )}
        {weight !== undefined && (
          <span className="text-micro leading-none text-faint">{weight}</span>
        )}
        {row !== undefined && (
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? `Hide details for ${item.name}` : `Show details for ${item.name}`}
            onClick={() => setOpen((current) => !current)}
          >
            <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
          </Button>
        )}
      </div>
      {row !== undefined && open && (
        <div id={detailsId} className="pb-2 pl-6.5">
          <DetailFacts facts={gearFacts(row)} />
        </div>
      )}
    </div>
  );
}

/** A hairline-ruled run inside a section — the drawing's `borderTop` rows. */
function Ruled({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("mt-4 border-t border-hairline pt-3", className)}>{children}</div>;
}

/**
 * One section of the document: the anchor target the spine scrolls to, and the
 * element the scroll-spy measures.
 *
 * The `id` is the drawn section's own, so `#sheet-gear` is a real anchor and a
 * press on the spine and a link from elsewhere land in the same place.
 */
function DocumentSection({
  section,
  register,
  aside,
  action,
  children,
}: {
  readonly section: SheetSectionSpec;
  readonly register: (id: SheetSectionId, element: HTMLElement | null) => void;
  readonly aside?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div id={`sheet-${section.id}`} ref={(element) => register(section.id, element)}>
      <SheetSection title={section.label} aside={aside} action={action}>
        {children}
      </SheetSection>
    </div>
  );
}

/**
 * A section's write, in its header. The visible word is what it edits — the
 * abilities header carries two of these side by side, and two buttons both
 * reading *Edit* is the ambiguity the tabbed sheet's backstory *Edit* had to be
 * labelled out of. The accessible name is *Edit …*, so anything driving by the
 * verb still finds it and the bar's own *Edit* stays the only bare one.
 */
const EditButton = ({
  what,
  onClick,
  bare = false,
}: {
  readonly what: string;
  readonly onClick: () => void;
  /** Read *Edit* on the face, as the backstory's always has. */
  readonly bare?: boolean;
}) => (
  <Button variant="outline" size="sm" aria-label={`Edit ${what}`} onClick={onClick}>
    <Icon name="pencil" size={13} />
    {bare ? "Edit" : what.charAt(0).toUpperCase() + what.slice(1)}
  </Button>
);

function SheetDocument({
  owned,
  gearRows,
  sections,
  register,
  onEditAbilities,
  onEditBackstory,
  onEditGear,
  onEditSkills,
  onEditSpells,
  rollCampaignId,
}: {
  readonly owned: OwnedCharacter;
  /** The equipment rows the gear lines name — see `CharacterSheetView.gear`. */
  readonly gearRows: ReadonlyArray<Equipment>;
  readonly sections: ReadonlyArray<SheetSectionSpec>;
  readonly register: (id: SheetSectionId, element: HTMLElement | null) => void;
  readonly onEditAbilities: () => void;
  readonly onEditBackstory: () => void;
  readonly onEditGear: () => void;
  readonly onEditSkills: () => void;
  readonly onEditSpells: () => void;
  readonly rollCampaignId: CampaignId | undefined;
}) {
  const character = owned.character;
  const sheet = character.sheet;
  const spellcasting = sheet.spellcasting;
  const slots = slotRows(sheet);
  const story = sheet.story;
  const storyLines: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
    { label: "Personality", value: story?.personality },
    { label: "Ideal", value: story?.ideal },
    { label: "Bond", value: story?.bond },
    { label: "Flaw", value: story?.flaw },
  ].flatMap(({ label, value }) => (value === undefined || value === "" ? [] : [{ label, value }]));
  const purse = sheet.currency === undefined ? [] : coins(sheet.currency);
  const gearById = new Map(gearRows.map((row) => [row.id, row]));
  const drawn = (id: SheetSectionId) => sections.find((section) => section.id === id);
  const { busy, failure, submit } = useMutation();
  const [pending, setPending] = useState<Record<string, number>>({});
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [rolls, setRolls] = useState<ReadonlyArray<LoggedRoll>>([]);
  const adjusted = (resource: SheetResource): SheetResource => ({
    ...resource,
    used: Math.max(0, Math.min(resource.max, resource.used + (pending[resource.id] ?? 0))),
  });
  const spend = (resource: SheetResource, amount: number) => {
    setPending((current) => ({ ...current, [resource.id]: (current[resource.id] ?? 0) + amount }));
    void submit(
      (client) => spendResource(client, character, resource.id, amount),
      ownCharacterWrites(owned),
    ).finally(() => {
      setPending((current) => ({
        ...current,
        [resource.id]: (current[resource.id] ?? 0) - amount,
      }));
    });
  };
  const resourceFor = (trait: Trait): SheetResource | undefined => {
    const wanted = trait.name.trim().toLowerCase();
    const resource = (sheet.resources ?? []).find(
      (candidate) =>
        !candidate.id.startsWith("slot:") && candidate.name.trim().toLowerCase() === wanted,
    );
    return resource === undefined ? undefined : adjusted(resource);
  };
  const recordRoll = (roll: LocalRoll | undefined) => {
    if (roll === undefined) return;
    const requestId = newRollRequestId();
    const target = rollCampaignId;
    const logged: LoggedRoll = {
      ...roll,
      localId: requestId,
      state: target === undefined ? "local" : "sending",
      message:
        target === undefined
          ? "Kept here — no shared live table is active."
          : "Sending to the table…",
    };
    setRolls((current) => [logged, ...current].slice(0, 12));
    if (target === undefined) return;

    void submit(
      (client) =>
        client.rolls.create({
          params: { campaignId: target },
          payload: {
            characterId: character.id,
            label: roll.label,
            notation: roll.notation,
            dice: roll.dice,
            kept: roll.kept,
            modifier: roll.modifier,
            total: roll.total,
            mode: roll.mode,
            requestId,
            ...(criticalFrom(roll) === undefined ? {} : { critical: criticalFrom(roll) }),
          },
        }),
      [],
    ).then((result) => {
      setRolls((current) =>
        current.map((item) => {
          if (item.localId !== requestId) return item;
          if (Result.isSuccess(result)) {
            return {
              ...item,
              total: result.success.total,
              dice: result.success.dice,
              kept: result.success.kept,
              modifier: result.success.modifier,
              mode: result.success.mode,
              notation: result.success.notation,
              natural:
                result.success.critical === "hit"
                  ? 20
                  : result.success.critical === "miss"
                    ? 1
                    : undefined,
              state: "sent",
              message: "Sent to the table's dice tray.",
            };
          }
          return {
            ...item,
            state: "failed",
            message:
              result.failure.kind === "conflict"
                ? "Kept here — nobody is playing at that table right now."
                : "Kept here — it could not be sent to the table.",
          };
        }),
      );
    });
  };
  const rollNotation = (label: string, notation: string, mode: RollMode | undefined = rollMode) => {
    recordRoll(rollDiceExpression(label, notation, mode));
  };
  const rollAbility = (ability: Ability) => {
    recordRoll(rollAbilityCheck(`${ability.label} check`, ability.modifier, rollMode));
  };

  const abilities = drawn("abilities");
  const actions = drawn("actions");
  const magic = drawn("magic");
  const features = drawn("features");
  const gear = drawn("gear");
  const storySection = drawn("story");
  const log = drawn("log");

  return (
    /* **The document is its own `@container`**, so every grid inside it turns
       over on the width this column actually has — which at 1440 is ~900px and
       beside an open Hob panel is 400 less — rather than on the shell's. The
       `@md`/`@lg` steps below are the column's, never `main`'s. */
    <div className="@container order-3 flex min-w-0 flex-1 flex-col gap-gutter @3xl:order-2">
      <RollLog rolls={rolls} mode={rollMode} onMode={setRollMode} />
      {failure !== undefined && (
        <Card className="border-danger">
          <CardContent className="pt-card">
            <SaveFailure failure={failure} />
          </CardContent>
        </Card>
      )}
      {abilities !== undefined && (
        /* **Drawn on a writable sheet whether or not it holds anything**: the six
            cells are where a score is typed a first time, so a section that
            appeared only once it had one would be a value nobody could write. */
        <DocumentSection
          section={abilities}
          register={register}
          action={
            <>
              <EditButton what="abilities" onClick={onEditAbilities} />
              <EditButton what="skills" onClick={onEditSkills} />
            </>
          }
        >
          {sheet.abilities.length === 0 ? (
            <p className="text-caption leading-body text-muted-foreground">
              Six scores. Take the standard array, or roll for them.
            </p>
          ) : (
            /* Six in a row where the column allows it, three otherwise — the
               drawing's `repeat(6,1fr)` / `repeat(3,1fr)`, decided by the
               document's width rather than the window's. */
            <div className="grid grid-cols-3 gap-1.5 @sm:grid-cols-6">
              {sheet.abilities.map((ability) => (
                <AbilityCell key={ability.label} ability={ability} onRoll={rollAbility} />
              ))}
            </div>
          )}

          <Ruled>
            {sheet.skills === undefined || sheet.skills.length === 0 ? (
              <p className="text-caption leading-body text-muted-foreground">
                What you are proficient in, and what you add.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-x-gutter @sm:grid-cols-2 @2xl:grid-cols-3">
                {sheet.skills.map((skill) => (
                  <div key={skill.name} className="flex min-h-7 items-center gap-2">
                    <Mark on={skill.proficient === true} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-body-s leading-none",
                        skill.proficient === true ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {skill.name}
                    </span>
                    {skill.ability !== undefined && (
                      <span className="text-micro leading-none text-faint">{skill.ability}</span>
                    )}
                    {skill.bonus !== undefined && (
                      <span
                        className={cn(
                          "min-w-7 text-right font-mono text-mono leading-none font-medium",
                          skill.proficient === true ? "text-accent-ink" : "text-muted-foreground",
                        )}
                      >
                        {skill.bonus}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Ruled>

          {sheet.proficiencies !== undefined && sheet.proficiencies.length > 0 && (
            <Ruled className="flex flex-wrap gap-1.5">
              {sheet.proficiencies.map((proficiency) => (
                <Badge key={proficiency} variant="outline">
                  {proficiency}
                </Badge>
              ))}
            </Ruled>
          )}
        </DocumentSection>
      )}

      {actions !== undefined && (
        <DocumentSection section={actions} register={register}>
          <div className="grid grid-cols-1 gap-1.5 @md:grid-cols-2">
            {actionRows(sheet).map((action) => (
              <ActionLine key={action.id} action={action} onRoll={rollNotation} />
            ))}
          </div>
        </DocumentSection>
      )}

      {magic !== undefined && (
        <DocumentSection
          section={magic}
          register={register}
          action={<EditButton what="spells" onClick={onEditSpells} />}
          aside={
            <span className="text-micro leading-none text-faint">
              {[
                spellcasting?.ability,
                spellcasting?.save === undefined ? undefined : `save ${spellcasting.save}`,
                spellcasting?.attack === undefined ? undefined : `atk ${spellcasting.attack}`,
                spellcasting?.cantripsKnown === undefined
                  ? undefined
                  : `${String(spellcasting.cantripsKnown)} cantrips`,
              ]
                .filter((part): part is string => part !== undefined && part !== "")
                .join(" · ")}
            </span>
          }
        >
          {slots.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2.5 border-b border-hairline pb-3">
              {slots.map((slot) => {
                const resource = (sheet.resources ?? []).find(
                  (candidate) => candidate.id === `slot:${String(slot.level)}`,
                );
                const shown =
                  resource === undefined
                    ? slot
                    : {
                        level: slot.level,
                        used: adjusted(resource).used,
                        total: adjusted(resource).max,
                      };
                const used = Math.min(shown.used, shown.total);
                return (
                  <div key={slot.level} className="flex items-center gap-2">
                    <span className="text-micro leading-none text-muted-foreground">
                      L{slot.level}
                    </span>
                    <span className="flex gap-1">
                      {Array.from({ length: Math.max(0, shown.total) }, (_, index) => {
                        const spent = index < used;
                        return resource === undefined ? (
                          <span
                            key={index}
                            aria-hidden="true"
                            className={
                              spent
                                ? "size-3.5 rotate-45 border border-strong bg-transparent"
                                : "size-3.5 rotate-45 border border-magic bg-magic"
                            }
                          />
                        ) : (
                          <PipButton
                            key={index}
                            spent={spent}
                            disabled={busy}
                            label={`${spent ? "Recover" : "Spend"} level ${String(slot.level)} spell slot ${String(index + 1)}`}
                            onClick={() => spend(resource, spent ? -1 : 1)}
                          />
                        );
                      })}
                    </span>
                    <span className="text-micro leading-none text-faint">
                      {Math.max(0, shown.total - used)} of {shown.total} left
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-gutter @md:grid-cols-2">
            {(spellcasting?.known ?? []).map((spell) => (
              <div key={spell.name} className="flex min-h-10 items-center gap-2">
                <Mark on={spell.prepared === true} tone="magic" />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-body-s leading-none",
                    spell.prepared === true ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {spell.name}
                </span>
                {spell.note !== undefined && spell.note !== "" && (
                  <span className="text-micro leading-none text-faint">{spell.note}</span>
                )}
                {spell.level !== undefined && <Badge variant="outline">L{spell.level}</Badge>}
              </div>
            ))}
          </div>
        </DocumentSection>
      )}

      {features !== undefined && (
        <DocumentSection section={features} register={register}>
          <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
            {sheet.traits.map((trait) => {
              const resource = resourceFor(trait);
              return (
                <Feature
                  key={trait.name}
                  trait={trait}
                  resource={resource}
                  busy={busy}
                  onSpend={spend}
                  note={trait.note ?? usesNote(trait, sheet.resources)}
                />
              );
            })}
          </div>
        </DocumentSection>
      )}

      {gear !== undefined && (
        <DocumentSection
          section={gear}
          register={register}
          action={
            <Button variant="outline" size="sm" onClick={onEditGear}>
              <Icon name="plus" size={13} />
              Add
            </Button>
          }
        >
          <div className="flex flex-col gap-gutter @md:flex-row @md:items-start">
            <div className="min-w-0 flex-1">
              {sheet.inventory === undefined || sheet.inventory.length === 0 ? (
                <p className="text-caption leading-body text-muted-foreground">
                  A rope, a lantern, the thing you were given last session.
                </p>
              ) : (
                sheet.inventory.map((item, index) => (
                  <InventoryLine
                    key={`${item.name}-${String(index)}`}
                    item={item}
                    row={
                      item.equipmentId === undefined || item.equipmentId === null
                        ? undefined
                        : gearById.get(item.equipmentId)
                    }
                    first={index === 0}
                  />
                ))
              )}
            </div>
            {purse.length > 0 && (
              /* The drawing's 168px coin box: a column beside the list where
                 the document is wide enough, a wrapping row under it where it
                 is not. */
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 border border-hairline bg-surface-sunken p-3 @md:w-42 @md:shrink-0 @md:flex-col">
                {purse.map((pile) => (
                  <div key={pile.label} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-micro leading-none tracking-caps uppercase text-muted-foreground">
                      {pile.label}
                    </span>
                    <span className="font-mono text-mono leading-none font-medium text-heading">
                      {pile.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DocumentSection>
      )}

      {storySection !== undefined && (
        <DocumentSection
          section={storySection}
          register={register}
          action={<EditButton what="backstory" onClick={onEditBackstory} bare />}
        >
          <div className="flex flex-col gap-gutter @lg:flex-row @lg:items-start">
            <div className="min-w-0 flex-1">
              {sheet.notes.trim() === "" ? (
                <p className="text-caption leading-body text-muted-foreground">
                  Where they came from, and what they are still carrying about it.
                </p>
              ) : (
                sheet.notes.split(/\n{2,}/).map((paragraph, index) => (
                  <p
                    key={paragraph.slice(0, 32) + String(index)}
                    className={cn(
                      "max-w-measure font-serif text-body-l leading-loose text-slate-300 italic",
                      index === 0 ? "" : "mt-3",
                    )}
                  >
                    {paragraph}
                  </p>
                ))
              )}
              {sheet.journal !== undefined && sheet.journal.length > 0 && (
                <Ruled className="flex flex-col gap-4">
                  {sheet.journal.map((entry, index) => (
                    <div key={entry.text.slice(0, 32) + String(index)}>
                      {entry.session !== undefined && (
                        <Badge variant="secondary">Session {entry.session}</Badge>
                      )}
                      <p className="mt-1.5 max-w-measure text-body-s leading-loose text-muted-foreground">
                        {entry.text}
                      </p>
                    </div>
                  ))}
                </Ruled>
              )}
            </div>
            {storyLines.length > 0 && (
              /* The drawing's 240px aside, docked where the document allows. */
              <div className="flex flex-col gap-3 border border-hairline bg-surface-sunken p-3 @lg:w-60 @lg:shrink-0">
                {storyLines.map((line) => (
                  <KeyVal key={line.label} k={line.label} v={line.value} />
                ))}
              </div>
            )}
          </div>
        </DocumentSection>
      )}

      {log !== undefined && (
        <DocumentSection section={log} register={register}>
          {(sheet.levelUps ?? []).map((levelUp, index) => (
            <div
              key={levelUp.level}
              className={cn("flex gap-4 py-3", index === 0 ? "" : "border-t border-hairline")}
            >
              <div className="flex w-11 shrink-0 flex-col items-center gap-0.5">
                <span className="font-display text-display-s leading-none font-semibold text-accent-ink">
                  {levelUp.level}
                </span>
                <span className="text-micro leading-none text-faint">level</span>
              </div>
              <div className="min-w-0 flex-1">
                {levelUp.session !== undefined && (
                  <Badge variant="outline">Session {levelUp.session}</Badge>
                )}
                {levelUp.note !== undefined && levelUp.note !== "" && (
                  <p className="mt-1.5 max-w-measure text-body-s leading-body text-foreground">
                    {levelUp.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </DocumentSection>
      )}
    </div>
  );
}

/**
 * The identity card — the drawing's sticky left rail wide, and its two-line
 * summary header narrow.
 *
 * **One card, restyled by the column's width, and never two.** The drawing
 * draws two components and picks one by window width; here the summary button
 * is drawn only under `@3xl` and the full head only at it, while everything the
 * two share — the hit-point track, the pills, the experience bar, the death
 * saves — is drawn once and shown narrow only when the summary is expanded.
 * That is what keeps every death-save pip in the tree exactly once, which is
 * what a test (and a screen reader) asking for *Successes 1* needs.
 */
function IdentityCard({
  owned,
  open,
  onToggle,
  onReload,
}: {
  readonly owned: OwnedCharacter;
  /** Whether the narrow summary is expanded — screen state, above the resource. */
  readonly open: boolean;
  readonly onToggle: () => void;
  /** Re-read the sheet after a stale-version refusal on a death-save mark. */
  readonly onReload: () => void;
}) {
  const character = owned.character;
  const identity = character.sheet.identity;
  // Absent is nought up and nought down, and on a writable sheet the row is
  // drawn either way: a player whose character has never gone down still has to
  // be able to mark the first save on the night they do.
  const deathSaves = character.sheet.deathSaves ?? { successes: 0, failures: 0 };
  const { busy, failure, submit } = useMutation();
  const [hitDiceToSpend, setHitDiceToSpend] = useState(0);
  const hitDiceResource = character.sheet.resources?.find((resource) => resource.id === "hit-dice");
  const availableHitDice =
    hitDiceResource === undefined ? 0 : Math.max(0, hitDiceResource.max - hitDiceResource.used);

  /**
   * One mark, written straight through — **not optimistic, and deliberately.**
   *
   * The optimistic rule this app follows is the runner's: a single boolean the
   * DM flips every few seconds moves before the round trip, and everything that
   * changes the shape of what is on screen waits and re-reads. A death save is
   * neither frequent nor a boolean, and it is the kind of number somebody reads
   * back out loud, so it waits — the pips are disabled while it does. The whole
   * document goes with it, which is `sheetWith`'s rule and its race.
   */
  const mark = async (part: "successes" | "failures", next: number) => {
    await submit(
      (client) =>
        saveOwnCharacter(client, character, {
          sheet: sheetWith(character, { deathSaves: { ...deathSaves, [part]: next } }),
        }),
      ownCharacterWrites(owned),
    );
  };
  const rest = async (kind: "short" | "long") => {
    await submit(
      (client) =>
        restOwnCharacter(client, character, kind, kind === "short" ? hitDiceToSpend : undefined),
      ownCharacterWrites(owned),
    );
    setHitDiceToSpend(0);
  };

  const meta = [identity?.background, identity?.alignment].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const xp = identity?.xp;
  const xpNext = identity?.xpNext;
  const pills: ReadonlyArray<{
    readonly label: string;
    readonly value: string | number;
    readonly accent: boolean;
  }> = [
    { label: "AC", value: character.ac ?? undefined, accent: false },
    { label: "Init", value: identity?.initiative, accent: false },
    { label: "Speed", value: identity?.speed, accent: false },
    // The one accented number, as the delivery draws it: the proficiency bonus
    // is the value a player adds by hand most often.
    { label: "Prof", value: identity?.proficiency, accent: true },
  ].flatMap((pill) =>
    pill.value === undefined || pill.value === "" ? [] : [{ ...pill, value: pill.value }],
  );
  /* The summary's second line — `44 / 52 hp · AC 18 · +1 init` — from the same
     columns the track and the pills read, so it cannot say a different number. */
  const hp = hitPoints(character.hpCurrent, character.hpMax);
  const summary = [
    hp === undefined ? undefined : `${hp} hp`,
    character.ac === null ? undefined : `AC ${String(character.ac)}`,
    identity?.initiative === undefined || identity.initiative === ""
      ? undefined
      : `${identity.initiative} init`,
  ].filter((part): part is string => part !== undefined);
  const detailsId = `vitals-${character.id}`;

  return (
    <div className="order-1 @3xl:sticky @3xl:top-0 @3xl:w-63 @3xl:shrink-0">
      <Card>
        {/* Narrow: the two-line summary, and the press that opens the rest. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          // Named for what it does rather than for what it shows: the name and
          // the numbers inside it are content, and a control called
          // *"BD Brannoc Duskharrow 44 / 52 hp…"* says nothing about the press.
          aria-label={open ? "Hide vitals" : "Show vitals"}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center gap-2.75 p-2.75 text-left transition-control focus-visible:outline-none focus-visible:ring-focus @3xl:hidden"
        >
          <Portrait name={character.name} size="xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-body-s leading-tight font-semibold text-heading">
              {character.name}
            </p>
            {summary.length > 0 && (
              <p className="mt-1 font-mono text-mono leading-none text-muted-foreground">
                {summary.join(" · ")}
              </p>
            )}
          </div>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            className="shrink-0 text-faint"
          />
        </button>

        <CardContent
          id={detailsId}
          className={cn(
            "flex-col gap-4 px-2.75 pb-3.25 @3xl:flex @3xl:px-card @3xl:pt-card @3xl:pb-card",
            open ? "flex" : "hidden",
          )}
        >
          {/* Wide: the portrait plate and the name over the card. */}
          <div className="hidden items-start gap-3 @3xl:flex">
            <Portrait name={character.name} size="lg" />
            <p className="min-w-0 font-display text-body leading-tight font-semibold text-heading">
              {character.name}
            </p>
          </div>
          {(meta.length > 0 || (character.playerName !== null && character.playerName !== "")) && (
            <div>
              {meta.length > 0 && (
                <p className="text-micro leading-body text-muted-foreground">{meta.join(" · ")}</p>
              )}
              {character.playerName !== null && character.playerName !== "" && (
                <p className="text-micro leading-body text-faint">
                  Played by {character.playerName}
                </p>
              )}
            </div>
          )}

          <HpTrack
            current={character.hpCurrent}
            max={character.hpMax}
            temp={character.tempHp}
            hitDice={identity?.hitDice}
          />

          {hitDiceResource !== undefined && (
            <div className="flex flex-col gap-2 border border-hairline bg-surface-sunken p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-micro leading-none text-muted-foreground">
                  Hit dice: {String(availableHitDice)} of {String(hitDiceResource.max)} left
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || hitDiceToSpend <= 0}
                  onClick={() => setHitDiceToSpend((value) => Math.max(0, value - 1))}
                >
                  −
                </Button>
                <span className="w-6 text-center font-mono text-mono leading-none text-heading">
                  {hitDiceToSpend}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || hitDiceToSpend >= availableHitDice}
                  onClick={() =>
                    setHitDiceToSpend((value) => Math.min(availableHitDice, value + 1))
                  }
                >
                  +
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void rest("short")}
                >
                  Short rest
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void rest("long")}
                >
                  Long rest
                </Button>
              </div>
            </div>
          )}

          {character.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {character.conditions.map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
            </div>
          )}

          {pills.length > 0 && (
            /* Four across narrow, the drawing's 2×2 wide. */
            <div className="grid grid-cols-4 gap-1.5 @3xl:grid-cols-2">
              {pills.map((pill) => (
                <StatPill
                  key={pill.label}
                  label={pill.label}
                  value={pill.value}
                  accent={pill.accent}
                />
              ))}
            </div>
          )}

          {xp !== undefined && xpNext !== undefined && xpNext > 0 && (
            <div>
              <div className="mb-1.5 flex justify-between text-micro leading-none text-muted-foreground">
                <span>{character.level === null ? "Experience" : `Level ${character.level}`}</span>
                <span>
                  {xp.toLocaleString()} / {xpNext.toLocaleString()} xp
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-pill bg-surface-sunken">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${String(Math.min(100, Math.round((xp / xpNext) * 100)))}%` }}
                />
              </div>
            </div>
          )}

          {character.sheetUrl !== null && (
            // The one column that names somewhere else. A stored link nobody
            // can reach is the same lie as a stubbed field, so it is a real one
            // — the call `campaign/PartyList.tsx` already made.
            <a
              href={character.sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-label-s leading-none font-medium text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
            >
              The sheet they keep elsewhere
            </a>
          )}

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <p className="text-micro leading-none tracking-caps uppercase text-faint">
              Death saves
            </p>
            <DeathSaveRow
              label="Successes"
              count={deathSaves.successes}
              tone="success"
              busy={busy}
              onMark={(next) => void mark("successes", next)}
            />
            <DeathSaveRow
              label="Failures"
              count={deathSaves.failures}
              tone="danger"
              busy={busy}
              onMark={(next) => void mark("failures", next)}
            />
            {/* **The drawing's promise, corrected rather than repeated.**
                `CharacterSheet.jsx` says these "show on your DM's initiative row
                straight away" and nothing reads them: no delivery of the runner
                draws a death save, which is exactly why they are a document key
                and not a column. Saying so here is the honest version of the
                same line, and the DM-side read is a separate piece of work. */}
            {failure === undefined ? (
              <p className="mt-1 text-micro leading-body text-faint">
                Kept on your sheet. Your DM&rsquo;s screen does not show these yet.
              </p>
            ) : (
              <div className="mt-1">
                <SaveFailure failure={failure} onReload={onReload} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * *"The Salt Road is playing right now"*, and the way there.
 *
 * The delivery's card (`MyCharacters.jsx:83-91`): an accented border, a live dot
 * and two lines. It is drawn only when there is something to say — `liveBanner`
 * returns `undefined` otherwise, which is most of the time — so there is no
 * quiet state to design.
 *
 * **The card carries no button, and the delivery's own drawing is why.** The
 * roster's banner ends in *Take your turn* because the roster has no other
 * place to put it; the sheet's *Go to the table* is drawn in the **bar**
 * (`CharacterSheet.jsx:90`), which is where this screen's own actions already
 * live. Drawing both would put two controls with one name and one destination
 * on one screen, which is the ambiguity the backstory's *Edit* already had to
 * be labelled out of. So the card says what is happening and the bar is how you
 * get there.
 *
 * The dot is `--success` and carries `aria-hidden`: it repeats the headline's
 * own *"right now"* rather than adding to it, so a screen reader that read it
 * would be reading punctuation.
 */
function LiveTableBanner({ banner }: { readonly banner: LiveBanner }) {
  return (
    <Card className="mb-gutter border-accent">
      <CardContent className="flex flex-wrap items-center gap-x-gutter gap-y-3 pt-card">
        <span aria-hidden className="size-2 shrink-0 rounded-pill bg-success" />
        <div className="min-w-0 flex-1">
          <p className="text-body-s leading-snug font-semibold text-heading">{banner.headline}</p>
          <p className="text-caption leading-body text-muted-foreground">{banner.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The scroller, the three columns and the scroll-spy — everything that has to
 * know where the reader is.
 *
 * It owns the scroll container so `offsetTop`s are measured against it
 * (`relative`), restores the position it was last at when it mounts, and asks
 * `sectionInView` which section is lit on every scroll. A press on the spine
 * **pins** its section until the reader scrolls by hand (wheel, touch or key):
 * a smooth scroll fires the same events as a thumb does, and a short last
 * section that cannot reach the reading line would otherwise be lit for a
 * frame and then lose the marker to the section above it.
 */
function SheetScroller({
  owned,
  gearRows,
  banner,
  active,
  onActive,
  vitalsOpen,
  onToggleVitals,
  scrollTopRef,
  onEdit,
  onReload,
  rollCampaignId,
}: {
  readonly owned: OwnedCharacter;
  readonly gearRows: ReadonlyArray<Equipment>;
  readonly banner: LiveBanner | undefined;
  readonly rollCampaignId: CampaignId | undefined;
  readonly active: SheetSectionId;
  readonly onActive: (id: SheetSectionId) => void;
  readonly vitalsOpen: boolean;
  readonly onToggleVitals: () => void;
  readonly scrollTopRef: { current: number };
  readonly onEdit: (what: "abilities" | "skills" | "spells" | "backstory" | "gear") => void;
  readonly onReload: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const spine = useRef<HTMLElement>(null);
  const sectionElements = useRef(new Map<SheetSectionId, HTMLElement>());
  const pinned = useRef<SheetSectionId | undefined>(undefined);
  // Writable, so the three starting sections are drawn whether or not they hold
  // anything — otherwise the affordance that fills a section would live behind
  // the section it fills, and a sheet nobody has written could never be started.
  const sections = drawnSections(owned.character.sheet, true);

  const register = (id: SheetSectionId, element: HTMLElement | null) => {
    if (element === null) sectionElements.current.delete(id);
    else sectionElements.current.set(id, element);
  };

  // Where the reader was, restored when the document (re)mounts — see the
  // screen's doc comment for why this is the second layer and not the first.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null && scrollTopRef.current > 0) element.scrollTop = scrollTopRef.current;
  }, [scrollTopRef]);

  /**
   * The rail's height, when the nav is the rail — the amount a section has to
   * be scrolled clear of so its heading is not under the band. On the wide
   * layout the spine is a column beside the document and takes no headroom at
   * all. The two shapes are told apart by the nav's own flex direction, which
   * the same `@3xl` that lays the sheet out decides — a second copy of the
   * breakpoint would drift, and **position cannot be used instead**: Chromium
   * reports a stuck element's `offsetTop` at its stuck position, so a rail the
   * reader has scrolled under looks as though it sits below the sections
   * (measured: *Story* pressed at 390 landed at 0, under the rail, with the
   * position test).
   */
  const headroom = () => {
    const nav = spine.current;
    if (nav === null) return 0;
    return getComputedStyle(nav).flexDirection === "row" ? nav.offsetHeight : 0;
  };

  const onScroll = () => {
    const element = scroller.current;
    if (element === null) return;
    scrollTopRef.current = element.scrollTop;
    const room = headroom();
    const tops = sections.flatMap((section) => {
      const node = sectionElements.current.get(section.id);
      return node === undefined ? [] : [{ id: section.id, top: node.offsetTop - room }];
    });
    const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    const spied = sectionInView(tops, element.scrollTop, SPY_SLACK, atEnd);
    if (spied === undefined) return;
    if (pinned.current !== undefined) {
      // The smooth scroll has arrived when the spy agrees with the press.
      if (spied === pinned.current) pinned.current = undefined;
      return;
    }
    onActive(spied);
  };

  const go = (id: SheetSectionId) => {
    const element = scroller.current;
    const target = sectionElements.current.get(id);
    onActive(id);
    if (element === null || target === undefined) return;
    pinned.current = id;
    const top = Math.max(0, target.offsetTop - headroom());
    if (typeof element.scrollTo === "function") element.scrollTo({ top, behavior: "smooth" });
    else element.scrollTop = top;
  };

  const unpin = () => {
    pinned.current = undefined;
  };

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      onWheel={unpin}
      onTouchMove={unpin}
      onKeyDown={unpin}
      /* The scroller takes the page gutter back from `main` so the sticky
         columns and the rail meet its top edge — `top-0` is measured against
         this box — and so the scrollbar sits at the page edge rather than a
         gutter in from it. */
      className="relative -mx-page-sm -my-gutter min-h-0 flex-1 overflow-auto px-page-sm py-gutter sm:-mx-page sm:px-page"
    >
      {banner !== undefined && <LiveTableBanner banner={banner} />}
      {/* The drawing's `252px / minmax(0,1fr) / 186px` grid as a flex row: the
          card and the spine are fixed tracks that stick, the document is the
          one that gives. `items-start` is what lets a flex item be sticky.
          Narrow, the same three stack — card, rail, document — which the
          `order-*` pair on the rail and the document arranges without a second
          copy of either. */}
      <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
        <IdentityCard
          owned={owned}
          open={vitalsOpen}
          onToggle={onToggleVitals}
          onReload={onReload}
        />
        <SectionSpine ref={spine} sections={sections} active={active} onGo={go} />
        <SheetDocument
          owned={owned}
          gearRows={gearRows}
          sections={sections}
          register={register}
          onEditAbilities={() => onEdit("abilities")}
          onEditBackstory={() => onEdit("backstory")}
          onEditGear={() => onEdit("gear")}
          onEditSkills={() => onEdit("skills")}
          onEditSpells={() => onEdit("spells")}
          rollCampaignId={rollCampaignId}
        />
      </div>
    </div>
  );
}

/**
 * One character's sheet and the live table behind its banner, keyed on the id.
 *
 * Two rounds, because the live read hangs off `/campaigns/:campaignId` and
 * which campaign that is arrives in the first — see `characters/load.ts`, which
 * is also where a `NotFound` from the second is argued to fail the screen
 * rather than degrade to a missing banner.
 */
const sheetAtom = Atom.family((characterId: CharacterId) =>
  // One key for both rounds, because both are a function of the same write: a
  // sheet save re-reads the roster this screen picks its character out of, and
  // the live banner beside it is read in the round that follows. Nothing on
  // this screen writes the table, so there is no second key to name.
  // …and the equipment Library, because the second round reads the rows the
  // gear names from it: an original written on the shelf reaches the sheet.
  apiAtom(loadCharacterSheet(characterId), [reads.myCharacters, reads.libraryEquipment]),
);

export function CharacterSheetScreen() {
  const { characterId } = useParams({ from: "/characters/$characterId" });
  /**
   * The roster's own load, reused whole — **and that is the point rather than a
   * shortcut.** `GET /me/characters` composes `ownRowReadable`, which is the
   * ownership predicate *conjoined* with ownership; reading one row through
   * `characters.findById` instead would need a campaign in the path this route
   * deliberately does not carry, and would answer through a wider predicate for
   * a screen that must only ever show your own.
   *
   * So a character that is not in the answer is not yours, and the honest thing
   * to say about it is what the server says about everything it will not show:
   * *not here*.
   */
  const [resource, reload] = useApiAtom(sheetAtom(characterId));
  const view = resource.state === "ready" ? resource.value : undefined;
  const owned = view?.characters.find((row) => row.character.id === characterId);
  const character = owned?.character;
  /**
   * The banner's table is the character's **first** seat — `load.ts` picked the
   * same one to read the live table from, so the name and the numbers cannot
   * disagree about which table they are about. A character seated nowhere has
   * no campaign line, no banner and no way to a table, which is the honest
   * shape of a character between tables.
   */
  const firstSeat = owned?.seats[0];
  const campaignName =
    firstSeat === undefined ? undefined : view?.campaignNames.get(firstSeat.campaignId);
  /**
   * What the banner says, or nothing.
   *
   * `undefined` covers both silences the endpoint deliberately does not tell
   * apart — nobody is playing, and the DM has not shared tonight — and the
   * screen draws neither a card nor an action for either. See `live.ts`.
   */
  const banner =
    character === undefined || view === undefined
      ? undefined
      : liveBanner(view.live, character, campaignName);
  const joinOptions =
    owned === undefined ? [] : campaignsAvailableToJoin(owned, view?.memberships ?? []);

  /**
   * Which write is open — one at a time, and above the sheet rather than inside
   * it, because the dialog outlives the section that opened it: a save re-reads
   * the screen, and a dialog owned by a subtree that re-renders under it would
   * be closed by its own success.
   */
  const [editing, setEditing] = useState<
    | "identity"
    | "abilities"
    | "skills"
    | "spells"
    | "backstory"
    | "gear"
    | "join"
    | "delete"
    | undefined
  >();
  /**
   * Which section is lit, whether the narrow summary is open, and where the
   * scroller was — all three above the resource, for the reason the screen's
   * doc comment gives under *Keeping your place across a write*.
   */
  const [active, setActive] = useState<SheetSectionId>("abilities");
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const scrollTop = useRef(0);
  const close = () => setEditing(undefined);
  /**
   * The remedy for a stale-version refusal: read the sheet again and let the
   * player make the change over on the document as it now is. The dialog goes,
   * because the draft it holds was made against the version the server just
   * refused.
   */
  const reloadAndClose = () => {
    reload();
    close();
  };
  const navigate = useNavigate();
  // The lit section must be a drawn one — a section can stop being drawn
  // between renders — so the held value falls back to the first rather than
  // being trusted.
  const drawn = character === undefined ? [] : drawnSections(character.sheet, true);
  const lit = drawn.some((section) => section.id === active)
    ? active
    : (drawn[0]?.id ?? "abilities");

  return (
    <AppShell
      fill
      topBar={
        <TopBar
          title={character?.name ?? "A character"}
          /* **The campaign's name is on this line now, and that is where it has
             to be.** It used to hang in the top nav beside the campaign the
             route named — but this route names none: `GET /me/characters` is the
             one read on `character` with no campaign in its path, so the sixth
             delivery's campaign row is correctly absent here and there is no
             second bar to put it in. It is still the thing that tells two
             characters at two tables apart, so it joins the line that already
             says which character this is. */
          subtitle={
            character === undefined
              ? undefined
              : [campaignName, character.descriptor, character.sheet.identity?.subclass]
                  .filter(
                    (part): part is string => part !== null && part !== undefined && part !== "",
                  )
                  .join(" · ")
          }
        >
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/characters" />}
          >
            <Icon name="chevron-left" size={14} />
            Characters
          </Button>
          {/* **The way to the table, in the bar the delivery draws it in**
              (`CharacterSheet.jsx:90`) — and absent unless there is a table to
              go to. A control that led to a screen with nothing on it would be
              the stubbed field this product refuses everywhere else, and the
              banner below is the sentence saying why this one is here. */}
          {firstSeat !== undefined && banner !== undefined && (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/campaigns/$campaignId/table"
                  params={{ campaignId: firstSeat.campaignId }}
                />
              }
            >
              <Icon name="swords" size={14} />
              Go to the table
            </Button>
          )}
          {owned !== undefined && joinOptions.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setEditing("join")}>
              <Icon name="user-plus" size={14} />
              Add to campaign
            </Button>
          )}
          {/* **The product's first character delete on screen**, and it is here
              because Hob drafting one is what made an unwanted character cheap:
              a player who describes somebody, keeps the draft and changes their
              mind owns a real row. It is a confirm rather than a press,
              because a character really goes — there is no
              archive for one the way there is for a campaign. See
              `DeleteCharacterDialog`. */}
          {character !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${character.name}`}
              onClick={() => setEditing("delete")}
            >
              <Icon name="trash-2" size={14} />
              Delete
            </Button>
          )}
          {/* The durable columns, and the one write with no drawn home of its
              own — the delivery gives the identity card no edit affordance, so
              it goes where a screen's own action goes. It is absent until the
              row is loaded, because there is nothing to edit until then. */}
          {character !== undefined && (
            <Button size="sm" onClick={() => setEditing("identity")}>
              <Icon name="pencil" size={14} />
              Edit
            </Button>
          )}
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading the sheet…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (owned === undefined ? (
          <div className="max-w-3xl">
            <FailureNotice failure={{ kind: "missing", resource: "character" }} />
          </div>
        ) : (
          <SheetScroller
            owned={owned}
            gearRows={view.gear}
            banner={banner}
            active={lit}
            onActive={setActive}
            vitalsOpen={vitalsOpen}
            onToggleVitals={() => setVitalsOpen((current) => !current)}
            scrollTopRef={scrollTop}
            onEdit={setEditing}
            onReload={reload}
            rollCampaignId={view.live?.campaignId}
          />
        ))}

      {owned !== undefined && editing === "identity" && (
        <IdentityDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "abilities" && (
        <AbilitiesDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "skills" && (
        <SkillsDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "spells" && (
        <SpellPickerDialog
          owned={owned}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {owned !== undefined && editing === "backstory" && (
        <BackstoryDialog owned={owned} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {owned !== undefined && editing === "gear" && (
        <GearDialog
          owned={owned}
          rows={view?.gear ?? []}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {owned !== undefined && view !== undefined && editing === "join" && (
        <AddToCampaignDialog
          owned={owned}
          memberships={view.memberships}
          onClose={close}
          onJoined={reload}
        />
      )}
      {owned !== undefined && editing === "delete" && (
        <DeleteCharacterDialog
          owned={owned}
          onClose={close}
          /* The row is gone, so there is nothing left on this route to draw —
             back to the roster, replacing the entry so *Back* does not land on
             a sheet that no longer exists. */
          onDeleted={() => void navigate({ to: "/characters", replace: true })}
        />
      )}
    </AppShell>
  );
}
