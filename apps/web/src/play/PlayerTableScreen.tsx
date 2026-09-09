import type {
  CampaignId,
  NpcId,
  PlayerNpc,
  PlayerLiveCombatant,
  PlayerLiveCombatantYou,
  Roll,
  RollMode,
  SessionId,
  SheetAction,
} from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useNpcSessionChat } from "../cast/playerChat";
import { RehearsalPanel } from "../cast/RehearsalPanel";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { actionRows } from "../characters/sheet";
import {
  type LocalRoll,
  rollAbilityCheck,
  rollDetail,
  rollDiceExpression,
} from "../characters/rolls";
import { AppShell, TopBar } from "../shell/AppShell";
import { SaveFailure } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadPlayerTableView } from "./load";
import { usePlayerTableStream } from "./tableStream";

interface PendingRoll extends LocalRoll {
  readonly localId: string;
  readonly state: "sending" | "sent" | "failed";
  readonly message: string;
}

const newRollRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `roll-${String(Date.now())}-${String(Math.random())}`;

const criticalFrom = (roll: LocalRoll): "hit" | "miss" | undefined =>
  roll.natural === 20 ? "hit" : roll.natural === 1 ? "miss" : undefined;

const playerTableAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadPlayerTableView(campaignId), [
    reads.campaign(campaignId),
    reads.playerTable(campaignId),
    reads.myCharacters,
    reads.notes(campaignId),
  ]),
);

const sessionNpcsAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(
      (client) => client.npcs.sessionList({ params: { campaignId, sessionId } }),
      [reads.sessionNpcs(sessionId)],
    ),
);

const bandLabel = (band: PlayerLiveCombatant & { kind: "npc" }) =>
  ({ unhurt: "Unhurt", hurt: "Hurt", bloodied: "Bloodied", down: "Down", unknown: "Unknown" })[
    band.hpBand
  ];

function CombatantRow({ row }: { readonly row: PlayerLiveCombatant }) {
  const detail =
    row.kind === "you"
      ? [
          `${String(row.hpCurrent)}/${String(row.hpMax)} hp`,
          row.tempHp > 0 ? `${String(row.tempHp)} temp` : undefined,
        ]
      : row.kind === "ally"
        ? [row.subtitle, row.playerName]
        : [row.subtitle, bandLabel(row)];

  return (
    <div className="flex min-h-row flex-wrap items-center gap-2.5 border-t border-hairline px-card py-2 first:border-t-0">
      <Badge variant={row.kind === "you" ? "default" : "secondary"}>
        {row.kind === "you" ? "You" : row.kind === "ally" ? "Ally" : "NPC"}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-s leading-body font-medium text-foreground">
            {row.displayName}
          </span>
          <span className="text-caption leading-snug text-muted-foreground">
            Initiative {String(row.initiative)}
          </span>
        </div>
        <div className="text-caption leading-snug text-muted-foreground">
          {detail
            .filter((part): part is string => part !== undefined && part !== null && part !== "")
            .join(" · ")}
        </div>
      </div>
      {row.conditions.map((condition) => (
        <Badge key={condition} variant="secondary">
          {condition}
        </Badge>
      ))}
    </div>
  );
}

function RollLine({ roll }: { readonly roll: Roll }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-card py-2 first:border-t-0">
      <span className="text-body-s font-medium text-foreground">{roll.label}</span>
      <span className="text-body-s text-accent-ink">{String(roll.total)}</span>
      <span className="text-caption text-muted-foreground">
        {roll.notation} · dice {roll.dice.join(", ")}
        {roll.kept.length !== roll.dice.length ? ` · kept ${roll.kept.join(", ")}` : ""}
      </span>
    </div>
  );
}

function PendingRollLine({ roll }: { readonly roll: PendingRoll }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-card py-2 first:border-t-0">
      <span className="text-body-s font-medium text-foreground">{roll.label}</span>
      <span className="text-body-s text-accent-ink">{String(roll.total)}</span>
      <span className="text-caption text-muted-foreground">{rollDetail(roll)}</span>
      <span className="text-caption text-muted-foreground">{roll.message}</span>
    </div>
  );
}

function SessionNpcConversation({
  campaignId,
  sessionId,
  npc,
  refreshToken,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly npc: PlayerNpc;
  readonly refreshToken: number;
}) {
  const chat = useNpcSessionChat(campaignId, sessionId, npc.id, npc.name, refreshToken);
  return (
    <RehearsalPanel
      name={npc.name}
      rehearsal={chat}
      subtitle="Open at the table · shared with active participants"
      emptyTitle={`Talk to ${npc.name}`}
      emptyBody="Open at the table is the shared live-session conversation. Everyone in this channel can read the exchange; the NPC cannot change the campaign or remember this automatically."
      label={`Say something to ${npc.name}`}
      ariaLabel={`Talk to ${npc.name}`}
    />
  );
}

function SessionNpcCard({
  campaignId,
  sessionId,
  refreshToken,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly refreshToken: number;
}) {
  const [resource, reload] = useApiAtom(sessionNpcsAtom({ campaignId, sessionId }));
  const [selected, setSelected] = useState<NpcId | undefined>(undefined);

  useEffect(() => {
    if (refreshToken > 0) reload();
  }, [refreshToken, reload]);

  if (resource.state === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-s text-muted-foreground">Looking for shared NPCs…</p>
        </CardContent>
      </Card>
    );
  }
  if (resource.state === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </CardContent>
      </Card>
    );
  }

  const npcs = resource.value;
  const npc = npcs.find((row) => row.id === selected) ?? npcs[0];
  if (npc === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NPCs at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-s leading-body text-muted-foreground">
            The DM has not opened an NPC at the table for this live session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open at the table</CardTitle>
        <p className="text-body-s leading-body text-muted-foreground">
          This is the shared live-session conversation for active table participants.
          {npc.sessionState === "paused" ? " The DM has paused new messages for now." : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {npcs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {npcs.map((row) => (
              <Button
                key={row.id}
                size="sm"
                variant={row.id === npc.id ? "secondary" : "ghost"}
                onClick={() => setSelected(row.id)}
              >
                {row.name}
                {row.sessionState === "paused" && <Badge variant="secondary">paused</Badge>}
              </Button>
            ))}
          </div>
        )}
        <SessionNpcConversation
          campaignId={campaignId}
          sessionId={sessionId}
          npc={npc}
          refreshToken={refreshToken}
        />
      </CardContent>
    </Card>
  );
}

function RollControls({
  character,
  actions,
  rollMode,
  onMode,
  onRoll,
}: {
  readonly character: PlayerLiveCombatantYou | undefined;
  readonly actions: ReadonlyArray<SheetAction>;
  readonly rollMode: RollMode;
  readonly onMode: (mode: RollMode) => void;
  readonly onRoll: (roll: LocalRoll | undefined) => void;
}) {
  if (character === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your turn tools</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-s leading-body text-muted-foreground">
            Seat one of your characters in this fight to roll into the table tray.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your rolls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(["normal", "advantage", "disadvantage"] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={rollMode === mode ? "secondary" : "ghost"}
              onClick={() => onMode(mode)}
            >
              {mode === "normal" ? "Normal" : mode === "advantage" ? "Advantage" : "Disadvantage"}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions
            .filter((action) => action.dice !== undefined || action.hit !== undefined)
            .slice(0, 6)
            .map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant="secondary"
                onClick={() => {
                  const dice = action.dice;
                  if (dice !== undefined) onRoll(rollDiceExpression(action.name, dice, "normal"));
                  else if (action.hit !== undefined)
                    onRoll(
                      rollDiceExpression(`${action.name} attack`, `1d20${action.hit}`, rollMode),
                    );
                }}
              >
                <Icon name="dices" size={14} />
                {action.name}
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlayerTableScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/table" });
  const [resource, reload] = useApiAtom(playerTableAtom(campaignId));
  const view = resource.state === "ready" ? resource.value : undefined;
  const table = view?.table;
  const fight = table?.fight ?? null;
  const you = fight?.order.find((row): row is PlayerLiveCombatantYou => row.kind === "you");
  const owned = view?.characters.find((row) => row.character.id === you?.characterId);
  const actions = owned === undefined ? [] : actionRows(owned.character.sheet);
  const yourTurn = you !== undefined && fight?.upNext?.combatantId === you.combatantId;
  const { failure, submit } = useMutation();
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [pendingRolls, setPendingRolls] = useState<ReadonlyArray<PendingRoll>>([]);
  const [tableTicks, setTableTicks] = useState(0);
  const visiblePendingRolls = pendingRolls.filter(
    (pending) => !view?.rolls.some((roll) => roll.requestId === pending.localId),
  );

  const refreshTable = useCallback(() => {
    reload();
    setTableTicks((count) => count + 1);
  }, [reload]);

  const connection = usePlayerTableStream({
    campaignId,
    sessionId: table?.sessionId,
    enabled: table !== undefined && table !== null,
    onTick: refreshTable,
    onReconnected: refreshTable,
  });

  const recordRoll = (roll: LocalRoll | undefined) => {
    if (roll === undefined || table === null || table === undefined || you === undefined) return;
    const requestId = newRollRequestId();
    const pending: PendingRoll = {
      ...roll,
      localId: requestId,
      state: "sending",
      message: "Sending to the table…",
    };
    setPendingRolls((current) => [pending, ...current].slice(0, 6));
    void submit(
      (client) =>
        client.rolls.create({
          params: { campaignId },
          payload: {
            characterId: you.characterId,
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
      [reads.playerTable(campaignId)],
    ).then((result) => {
      setPendingRolls((current) =>
        current.map((item) =>
          item.localId !== requestId
            ? item
            : Result.isSuccess(result)
              ? { ...item, state: "sent", message: "Sent to the table." }
              : { ...item, state: "failed", message: "Kept here — the table refused it." },
        ),
      );
    });
  };

  return (
    <AppShell
      fill
      campaignName={view?.campaign.name}
      topBar={
        <TopBar
          title={view?.campaign.name ?? "The table"}
          subtitle={
            table === undefined
              ? undefined
              : table === null
                ? "No shared live table for one of your seats."
                : `Session ${String(table.sessionNumber)}${fight === null ? " · nothing on the table" : ` · round ${String(fight.round)}`}`
          }
        >
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId" params={{ campaignId }} />}
          >
            <Icon name="chevron-left" size={14} />
            Overview
          </Button>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading the live table…" />}
      {resource.state === "failed" && <FailureNotice failure={resource.failure} onRetry={reload} />}
      {view !== undefined && table === null && (
        <EmptyState icon="swords" title="No shared live table">
          When the DM shares a live session and one of your characters has an active seat, the
          player table appears here.
        </EmptyState>
      )}
      {view !== undefined && table !== null && table !== undefined && (
        <div className="@container flex min-h-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            <span>
              {connection.status === "live"
                ? "Live"
                : connection.status === "stopped"
                  ? "Stream stopped"
                  : "Reconnecting…"}
            </span>
            <span>Cursor {String(connection.cursor)}</span>
            {yourTurn && <Badge variant="magic">Your turn</Badge>}
          </div>

          {fight === null ? (
            <Card>
              <CardHeader>
                <CardTitle>Nothing on the table</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body-s leading-body text-muted-foreground">
                  The night is open. The DM has not shared a fight with the table.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-h-0 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Initiative</CardTitle>
                  </CardHeader>
                  {fight.order.map((row) => (
                    <CombatantRow key={row.combatantId} row={row} />
                  ))}
                </Card>

                {view.readAloud.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {view.readAloud.map((note) => (
                      <Card key={note.id}>
                        <CardHeader>
                          <span className="text-caption font-medium tracking-caps uppercase text-faint">
                            Read aloud
                          </span>
                          <CardTitle>{note.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="max-w-measure font-serif text-body-l leading-loose italic text-foreground">
                            {note.body}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <aside className="flex min-w-0 flex-col gap-5">
                <SessionNpcCard
                  campaignId={campaignId}
                  sessionId={table.sessionId}
                  refreshToken={tableTicks}
                />
                <RollControls
                  character={you}
                  actions={actions}
                  rollMode={rollMode}
                  onMode={setRollMode}
                  onRoll={recordRoll}
                />
                {owned !== undefined && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick checks</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {owned.character.sheet.abilities.slice(0, 6).map((ability) => (
                        <Button
                          key={ability.label}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            recordRoll(
                              rollAbilityCheck(
                                `${ability.label} check`,
                                ability.modifier,
                                rollMode,
                              ),
                            )
                          }
                        >
                          {ability.label}
                        </Button>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {failure !== undefined && (
                  <Card className="border-danger">
                    <CardContent className="pt-card">
                      <SaveFailure failure={failure} />
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Dice tray</CardTitle>
                  </CardHeader>
                  {visiblePendingRolls.map((roll) => (
                    <PendingRollLine key={roll.localId} roll={roll} />
                  ))}
                  {view.rolls.map((roll) => (
                    <RollLine key={roll.id} roll={roll} />
                  ))}
                  {visiblePendingRolls.length === 0 && view.rolls.length === 0 && (
                    <CardContent>
                      <p className="text-body-s text-muted-foreground">
                        Your rolls for this live table appear here. Other players' tray is not
                        shown.
                      </p>
                    </CardContent>
                  )}
                </Card>
              </aside>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
