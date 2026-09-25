import type {
  Ability,
  CampaignId,
  Equipment,
  InventoryItem,
  OwnedCharacter,
  SheetAction,
  SheetResource,
  Trait,
} from "@taverns/api";
import { Badge, Button, Card, CardContent, cn, Icon, SectionHeading } from "@taverns/ui";
import { Result } from "effect";
import { useState, type ReactNode } from "react";
import { useMutation } from "../api/mutation";
import { DetailFacts } from "../ui/detail";
import { SaveFailure } from "../ui/form";
import { compactGearLine, gearFacts, gearWeight } from "./gearFacts";
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
  type SheetSectionId,
  type SheetSectionSpec,
  slotRows,
  usesNote,
} from "./sheet";
import { AbilityCell, KeyVal, Mark, SheetSection } from "./SheetParts";
import { ownCharacterWrites, spendResource } from "./write";

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
        <SectionHeading size="label" className="flex-1">
          Your rolls
        </SectionHeading>
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

export function SheetDocument({
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
    { label: "Appearance", value: story?.appearance },
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
