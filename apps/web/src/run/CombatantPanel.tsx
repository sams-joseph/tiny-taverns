import type { Ability, Combatant, Creature, CreatureId, Trait } from "@taverns/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { subtitleOf } from "./load";

/**
 * Whoever the DM is looking at: their numbers, and their stat block when there
 * is one to show.
 *
 * `ui_kits/dm-screen/StatBlock.jsx` is the specification for the lower half.
 * The upper half is not in the prototype and has to exist here, because the
 * prototype's stat block is a fixture that always matches: in the real product
 * a combatant is a *snapshot* and its creature is a template that may have been
 * edited, deleted, or never been visible to this credential.
 *
 * So the panel is layered honestly:
 *
 *  - **The combatant's own numbers always render.** They are the fight, they
 *    are on the wire, and a party member has no stat block at all.
 *  - **The stat block renders when the creature is still readable**, and says
 *    so plainly when it is not. `Combatant.creatureId` is provenance and not an
 *    access path — nothing is *read through* it — so a miss here is an ordinary
 *    outcome rather than an error.
 *  - **The read-aloud line the prototype hangs off a stat block is absent.** It
 *    is a `note` with an attachment, and a note cannot attach to a creature
 *    yet (`AGENTS.md`, the bestiary section). A paragraph invented here would
 *    be the third place read-aloud prose lives.
 */

function StatLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="min-w-14 text-label-s leading-body font-medium text-on-dark-muted">
        {label}
      </span>
      <span className="font-mono text-mono leading-snug font-medium text-on-dark">{value}</span>
    </div>
  );
}

function AbilityCell({ ability }: { readonly ability: Ability }) {
  return (
    <div className="flex-1 rounded-sm border border-hairline bg-surface-sunken py-1.5 text-center">
      <div className="text-micro leading-body font-medium tracking-caps text-on-dark-muted">
        {ability.label}
      </div>
      <div className="font-mono text-mono-l leading-snug font-medium text-on-dark">
        {ability.score}
      </div>
      <div className="font-mono text-micro leading-none text-verdigris-300">{ability.modifier}</div>
    </div>
  );
}

function TraitBlock({ trait }: { readonly trait: Trait }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-body-s leading-snug font-semibold text-heading">{trait.name}</span>
        {/* The dice notation, shown and not rolled. There is no dice tray here:
            rolling is local-only, has no endpoint behind it, and is not part of
            what this screen was asked for — so the notation is rendered as what
            it is, a thing the DM reads. */}
        {trait.dice !== undefined && trait.dice !== "" && (
          <span className="rounded-xs bg-slate-50/10 px-1.5 py-px font-mono text-micro leading-tight text-verdigris-300">
            {trait.dice}
          </span>
        )}
      </div>
      <p className="text-caption leading-body text-on-dark-muted">{trait.text}</p>
    </div>
  );
}

function StatBlockBody({ creature }: { readonly creature: Creature }) {
  const block = creature.statBlock;
  const lines: ReadonlyArray<readonly [string, string]> = [
    ["AC", block.ac === "" ? String(creature.ac) : block.ac],
    ["HP", block.hp === "" ? String(creature.hp) : block.hp],
    ["SPEED", block.speed],
    ["CR", block.cr === "" ? creature.cr : block.cr],
  ];

  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
      {block.meta !== "" && (
        <p className="font-serif text-body-s leading-body italic text-on-dark-muted">
          {block.meta}
        </p>
      )}

      <div className="flex flex-col gap-0.5">
        {lines
          .filter(([, value]) => value !== "")
          .map(([label, value]) => (
            <StatLine key={label} label={label} value={value} />
          ))}
      </div>

      {block.abilities.length > 0 && (
        <div className="flex gap-1">
          {block.abilities.map((ability) => (
            <AbilityCell key={ability.label} ability={ability} />
          ))}
        </div>
      )}

      {block.traits.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-hairline pt-4">
          {block.traits.map((trait) => (
            <TraitBlock key={trait.name} trait={trait} />
          ))}
        </div>
      )}

      {block.abilities.length === 0 && block.traits.length === 0 && block.meta === "" && (
        <p className="text-caption leading-body text-muted-foreground">
          This creature has no stat block written yet. Its numbers above are what the fight is
          using.
        </p>
      )}
    </div>
  );
}

export function CombatantPanel({
  combatant,
  hp,
  creatures,
  active,
  following,
  disabled,
  onTheirTurn,
  onEdit,
  onFollow,
}: {
  readonly combatant: Combatant | undefined;
  readonly hp: number;
  readonly creatures: ReadonlyMap<CreatureId, Creature>;
  /** Whether this is whose turn it is. */
  readonly active: boolean;
  /** Whether the panel is tracking the turn rather than a manual pick. */
  readonly following: boolean;
  readonly disabled: boolean;
  readonly onTheirTurn: () => void;
  readonly onEdit: () => void;
  readonly onFollow: () => void;
}) {
  if (combatant === undefined) {
    return (
      <Card
        tone="panel"
        role="region"
        aria-label="Selected combatant"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <CardContent className="pt-card">
          <p className="text-body-s leading-body text-muted-foreground">
            Pick a line in the initiative list and whoever is on it shows up here, stat block and
            all.
          </p>
        </CardContent>
      </Card>
    );
  }

  const creature = combatant.creatureId === null ? undefined : creatures.get(combatant.creatureId);
  const subtitle = subtitleOf(combatant);

  return (
    <Card
      tone="panel"
      role="region"
      aria-label="Selected combatant"
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <CardHeader>
        <div className="flex items-start gap-2">
          <CardTitle className="flex-1 text-heading">{combatant.displayName}</CardTitle>
          {combatant.kind === "pc" ? (
            <Badge variant="info">Party</Badge>
          ) : (
            <Badge variant="destructive">Hostile</Badge>
          )}
        </div>
        {subtitle !== undefined && (
          <p className="text-caption leading-body text-on-dark-muted">{subtitle}</p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {active ? (
            <Badge>
              <Icon name="swords" size={11} />
              Their turn
            </Badge>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={onTheirTurn}
              aria-label={`Make it ${combatant.displayName}'s turn`}
            >
              Make it their turn
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
            <Icon name="pencil" size={13} />
            Edit
          </Button>
          {!following && (
            <Button variant="ghost" size="sm" onClick={onFollow}>
              Follow the turn
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <StatLine label="HP" value={`${String(hp)} / ${String(combatant.hpMax)}`} />
          <StatLine label="AC" value={combatant.ac === null ? "—" : String(combatant.ac)} />
          <StatLine label="INIT" value={String(combatant.initiative)} />
        </div>

        {combatant.conditions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {combatant.conditions.map((condition) => (
              <Badge key={condition} variant="secondary">
                {condition}
              </Badge>
            ))}
          </div>
        )}

        {creature !== undefined ? (
          <StatBlockBody creature={creature} />
        ) : combatant.creatureId === null ? null : (
          <p className="border-t border-hairline pt-4 text-caption leading-body text-muted-foreground">
            The bestiary entry this was seeded from is gone, or belongs to someone else. The numbers
            above are what the fight is using — they were copied when it started.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
