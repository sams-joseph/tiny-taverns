import type { DeathSaves, PlayerLiveCombatant, PlayerLiveCombatantYou } from "@taverns/api";
import { Badge, Button, Card, CardContent, Icon, SectionHeading, cn } from "@taverns/ui";
import type { ActionLine } from "../run/actions";
import { Actions, DeathSaveBlock, Disc, SectionTitle, ThisTurn, Tile } from "../run/CombatantPanel";
import type { TurnTicks } from "../run/turn";
import { BAND_WORDS } from "./tableRows";

/**
 * The card a seated player keeps open at the side of their table: the DM's
 * creature panel (`run/CombatantPanel.tsx`), built from its own parts, about
 * the player's own character and written only through the player's own
 * writes.
 *
 * - **This turn**, while the fight takes turns: the action, the bonus action
 *   and the reaction, and the feet walked against the sheet's speed. The
 *   action and the bonus action are pressable on the player's own turn; the
 *   reaction on anybody's, since that is when one is spent (`table.turn`).
 * - **The numbers**: armour class, hit points, speed and initiative, from the
 *   fight's row and the sheet's speed, as the DM's card reads them.
 * - **Death saves** at zero hit points: the dots are the player's own
 *   (`me.setCharacterDeathSaves`), and *Roll death save* rolls the d20 into the
 *   player's tray and marks it by the rule (`deathSaveRolled`).
 * - **Actions**: every line the sheet rolls, each *Roll*ed into the tray —
 *   the to-hit and the damage together, with no target, since a player's roll
 *   names no combatant and the table never tells a player a creature's armour
 *   class. The DM reads the roll and says whether it lands.
 * - **Conditions**, as the table holds them; the DM sets them.
 *
 * Outside a fight (a conversation, a skill challenge, a hazard) there is no
 * order and so no row: the card is the character and what it rolls.
 */
export function YourCard({
  name,
  you,
  label,
  speed,
  actions,
  turns,
  yourTurn,
  busy,
  onTick,
  onDeathSaves,
  onDeathSaveRoll,
  onRollAction,
}: {
  readonly name: string;
  /** Your row of the order, when there is an order to be in. */
  readonly you: PlayerLiveCombatantYou | undefined;
  readonly label: string;
  /** Feet, from the front of your sheet's speed. */
  readonly speed: number | undefined;
  readonly actions: ReadonlyArray<ActionLine>;
  /** The fight is taking turns. */
  readonly turns: boolean;
  readonly yourTurn: boolean;
  /** A write is in flight; what it would change waits for its answer. */
  readonly busy: boolean;
  readonly onTick: (ticks: TurnTicks) => void;
  readonly onDeathSaves: (saves: DeathSaves) => void;
  readonly onDeathSaveRoll: () => void;
  readonly onRollAction: (action: ActionLine) => void;
}) {
  return (
    <Card role="region" aria-label="Your character">
      <div className="flex items-start gap-3 border-b border-hairline p-panel">
        <Disc
          label={label}
          party
          hidden={false}
          portrait={you?.portrait === null ? undefined : you?.portrait.thumbUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SectionHeading as="h2" size="display" className="min-w-0 truncate font-semibold">
              {name}
            </SectionHeading>
            {yourTurn ? (
              <Badge variant="magic">Your turn</Badge>
            ) : (
              <Badge variant="info">You</Badge>
            )}
          </div>
          {you?.subtitle !== undefined && you.subtitle !== null && (
            <p className="mt-0.5 mb-0 text-caption leading-snug text-muted-foreground">
              {you.subtitle}
            </p>
          )}
        </div>
      </div>

      {you !== undefined && turns && (
        <ThisTurn
          combatant={you}
          speed={speed}
          disabled={busy}
          // Off your turn, only a reaction is yours to spend.
          {...(yourTurn ? {} : { locked: OFF_TURN })}
          onTick={onTick}
        />
      )}

      <CardContent className="flex flex-col gap-3.5 p-panel">
        {you !== undefined && (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              <Tile label="AC" value={you.ac === null ? "—" : String(you.ac)} />
              <Tile
                label="HP"
                value={`${String(you.hpCurrent)}/${String(you.hpMax)}`}
                danger={you.hpCurrent === 0}
              />
              <Tile label="Speed" value={speed === undefined ? "—" : String(speed)} />
              <Tile label="Init" value={you.initiative === null ? "—" : String(you.initiative)} />
            </div>
            {you.tempHp > 0 && (
              <p className="mb-0 text-caption leading-snug text-muted-foreground">
                {you.tempHp} temporary hit points.
              </p>
            )}
            {you.hpCurrent === 0 && (
              <DeathSaveBlock
                name={name}
                saves={you.deathSaves}
                disabled={busy}
                onSet={onDeathSaves}
                onRoll={onDeathSaveRoll}
              />
            )}
          </>
        )}

        {actions.length > 0 && (
          <div className={cn(you !== undefined && "border-t border-hairline pt-3.5")}>
            <Actions
              name={name}
              actions={actions}
              // Every line is *Roll*: a player's attack names no target.
              active={false}
              disabled={false}
              targeting={undefined}
              onAttack={undefined}
              onRoll={onRollAction}
            />
          </div>
        )}

        {you !== undefined && <ConditionsHeld conditions={you.conditions} />}
      </CardContent>
    </Card>
  );
}

const OFF_TURN: ReadonlySet<keyof TurnTicks> = new Set(["actionUsed", "bonusUsed"]);

/**
 * Anyone else the player picked on their strip or board: what their table
 * says of them and nothing more — an ally's hit points, death saves and
 * conditions, a creature's band and conditions.
 */
export function TableRowCard({
  row,
  label,
  up,
  onBack,
}: {
  readonly row: Exclude<PlayerLiveCombatant, PlayerLiveCombatantYou>;
  readonly label: string;
  readonly up: boolean;
  /** Back to your own card; absent when you have none. */
  readonly onBack: (() => void) | undefined;
}) {
  const party = row.kind === "ally";
  return (
    <Card role="region" aria-label="Selected combatant">
      <div className="flex items-start gap-3 border-b border-hairline p-panel">
        <Disc
          label={label}
          party={party}
          hidden={false}
          portrait={party && row.portrait !== null ? row.portrait.thumbUrl : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SectionHeading as="h2" size="display" className="min-w-0 truncate font-semibold">
              {row.displayName}
            </SectionHeading>
            {party ? (
              <Badge variant="info">Party</Badge>
            ) : (
              <Badge variant="destructive">Hostile</Badge>
            )}
          </div>
          {[row.subtitle, party ? row.playerName : null].some((part) => part !== null) && (
            <p
              className={cn(
                "mt-0.5 mb-0 leading-snug text-muted-foreground",
                party ? "text-caption" : "font-serif text-body-s italic",
              )}
            >
              {[row.subtitle, party ? row.playerName : null]
                .filter((part) => part !== null)
                .join(" · ")}
            </p>
          )}
        </div>
        {onBack !== undefined && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onBack}>
            <Icon name="user-round" size={14} />
            You
          </Button>
        )}
      </div>
      <CardContent className="flex flex-col gap-3.5 p-panel">
        <div className="grid grid-cols-2 gap-1.5">
          {row.kind === "ally" ? (
            <Tile
              label="HP"
              value={`${String(row.hpCurrent)}/${String(row.hpMax)}`}
              danger={row.hpCurrent === 0}
            />
          ) : (
            <Tile label="Health" value={BAND_WORDS[row.hpBand]} danger={row.hpBand === "down"} />
          )}
          <Tile label="Init" value={row.initiative === null ? "—" : String(row.initiative)} />
        </div>
        {up && <p className="mb-0 text-body-s leading-snug text-accent-ink">It is their turn.</p>}
        {row.kind === "ally" && row.hpCurrent === 0 && (
          <DeathSaveBlock name={row.displayName} saves={row.deathSaves} disabled />
        )}
        <ConditionsHeld conditions={row.conditions} />
      </CardContent>
    </Card>
  );
}

/** The conditions a row holds, as words: the DM sets them. */
function ConditionsHeld({ conditions }: { readonly conditions: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
      <SectionTitle
        title="Conditions"
        aside={conditions.length === 0 ? "None" : `${String(conditions.length)} active`}
      />
      {conditions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {conditions.map((condition) => (
            <Badge key={condition} variant="secondary">
              {condition}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
