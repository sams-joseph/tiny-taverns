import {
  type BoardSquare,
  type CampaignId,
  type CombatantId,
  type DeathSaves,
  NEUTRAL_RUN_NAMES,
  type PlayerLiveCombatantYou,
  type RollMode,
  deathSaveRolled,
} from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import {
  BackLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Loading,
  cn,
} from "@taverns/ui";
import { Atom } from "effect/reactivity";
import { useCallback, useMemo, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { deathSaveWrites, setOwnDeathSaves } from "../characters/write";
import { rollDiceExpression } from "../characters/rolls";
import { actionsOf } from "../run/actions";
import { rollActionThrows } from "../run/attack";
import { RunLayout } from "../run/RunLayout";
import { RunStage } from "../run/RunStage";
import { useStage } from "../run/stage";
import { leadingFeet } from "../run/tokens";
import { feetLeft, type TurnTicks } from "../run/turn";
import { TopBar } from "../shell/TopBar";
import { SaveFailure } from "../ui/form";
import { loadPlayerTableView } from "./load";
import { PlayerBattleMap, PlayerBoardStage, type PlayerBoardProps } from "./PlayerBoard";
import { TableRowCard, YourCard } from "./PlayerCard";
import { PlayerStrip } from "./PlayerStrip";
import { SceneOnTheTable } from "./SceneOnTheTable";
import { tableLabels } from "./tableRows";
import { usePlayerTableStream } from "./tableStream";
import { ReadAloud, SessionNpcCard, TurnBannerCard, YourInitiative } from "./TableCards";
import { TableDice } from "./TableDice";
import { tableRollOf, useTableRolls } from "./tableRolls";
import { turnBanner } from "./turnBanner";

const playerTableAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadPlayerTableView(campaignId), [
    reads.campaign(campaignId),
    reads.playerTable(campaignId),
    reads.myCharacters,
    reads.notes(campaignId),
  ]),
);

const newRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `turn-${String(Date.now())}-${String(Math.random())}`;

/**
 * A seated player's live table, laid out as the DM's runner is
 * (`run/RunScreen.tsx`) and built from its parts, over the player's own
 * projection of the fight (`PlayerLiveTable`), never the DM's.
 *
 * **On a fight with a shared map, at a desktop width**, it is the runner's
 * canvas (`run/RunStage.tsx`): the board fills the stage and the panels float
 * over it — the read-only initiative strip across the top (or *Your
 * initiative* while it is rolled), the player's own card on the right with
 * whose turn it is and the table's NPCs and read-alouds under it, and their
 * rolls bottom left. Like the DM's, this stage is bounded to the viewport and
 * its panels scroll themselves.
 *
 * **Otherwise** — a narrow screen, no shared map, or a scene that is not a
 * fight — it is the runner's grid (`run/RunLayout.tsx`), and the window
 * scrolls.
 *
 * What a player may do here is what the table's writes allow: enter their own
 * initiative while it is rolled, tick their own action, bonus action and
 * reaction, drag their own token on their own turn, mark and roll their own
 * death saves, and roll anything on their sheet into the tray. A chip or a
 * token selects; anyone else's card says what the table told this player of
 * them and offers nothing to press.
 */
export function PlayerTableScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId/table" });
  const [resource, reload] = useApiAtom(playerTableAtom(campaignId));
  const view = resource.state === "ready" ? resource.value : undefined;
  const table = view?.table;
  const fight = table?.fight ?? null;
  const you = fight?.order.find((row): row is PlayerLiveCombatantYou => row.kind === "you");
  // The seat, not the order's "you" row: a conversation, a skill challenge or
  // a hazard has no initiative order, and a player still rolls in one.
  const seat = fight?.seats[0];
  const owned = view?.characters.find((row) => row.character.id === seat?.characterId);
  const sheet = owned?.character.sheet;
  const actions = useMemo(() => (sheet === undefined ? [] : actionsOf({ sheet })), [sheet]);
  const speed = leadingFeet(sheet?.identity?.speed);
  const upNextId = fight?.upNext?.kind === "visible" ? fight.upNext.combatantId : undefined;
  const turns = fight?.mode === "combat" && fight.phase === "turns";
  const yourTurn = you !== undefined && turns && upNextId === you.combatantId;
  const banner = turnBanner(fight);
  const labels = useMemo(() => tableLabels(fight?.order ?? []), [fight?.order]);
  const stage = useStage();

  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [picked, setPicked] = useState<CombatantId>();
  const dice = useTableRolls({
    campaignId,
    characterId: seat?.characterId,
    rolls: view?.rolls ?? [],
  });
  const turnWrite = useMutation();
  const moveWrite = useMutation();
  const savesWrite = useMutation();

  // Every tick re-reads the table, and tells the NPC card to re-read its own.
  const [tableTicks, setTableTicks] = useState(0);
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

  // Whoever was picked, while they are still on this table; else your own row.
  const selected =
    fight?.order.find((row) => row.combatantId === picked) ?? (you === undefined ? undefined : you);
  const selectedId = selected?.combatantId;

  const tick = (ticks: TurnTicks) => {
    if (fight === null || you === undefined) return;
    void turnWrite.submit(
      (client) =>
        client.table.turn({
          params: { campaignId, runId: fight.id, combatantId: you.combatantId },
          payload: { ...ticks, requestId: newRequestId() },
        }),
      [reads.playerTable(campaignId)],
    );
  };

  const move = (to: BoardSquare) =>
    fight === null || you === undefined
      ? Promise.resolve()
      : moveWrite.submit(
          (client) =>
            client.table.move({
              params: { campaignId, runId: fight.id, combatantId: you.combatantId },
              payload: { position: to, requestId: newRequestId() },
            }),
          [reads.playerTable(campaignId)],
        );

  const setSaves = (saves: DeathSaves) => {
    if (owned === undefined) return;
    void savesWrite.submit(
      (client) => setOwnDeathSaves(client, owned.character, saves),
      deathSaveWrites(owned),
    );
  };

  /**
   * *Roll death save*: the d20 into your tray, and the dots marked by the
   * rule (`deathSaveRolled`). A natural 20 is the DM's to mark, since it
   * brings you back with a hit point and a player writes none.
   */
  const rollDeathSave = () => {
    if (you === undefined) return;
    const rolled = rollDiceExpression(`${you.displayName} · Death save`, "1d20");
    if (rolled === undefined) return;
    dice.file({ ...rolled, kind: "death-save" });
    const face = rolled.kept[0] ?? rolled.total;
    const { saves, revived } = deathSaveRolled(you.deathSaves, face);
    if (!revived) setSaves(saves);
  };

  const rollAction = (action: Parameters<typeof rollActionThrows>[0]["line"]) => {
    const name = you?.displayName ?? owned?.character.name ?? "You";
    for (const thrown of rollActionThrows({ attacker: name, line: action, mode: rollMode })) {
      dice.file(tableRollOf(thrown));
    }
  };

  const failure = turnWrite.failure ?? moveWrite.failure ?? savesWrite.failure;

  const boardProps: PlayerBoardProps | undefined =
    fight?.board === null || fight?.board === undefined || fight.mode !== "combat"
      ? undefined
      : {
          board: fight.board,
          order: fight.order,
          labels,
          upNextId,
          selectedId,
          diagonals: view?.campaign.diagonalRule ?? "five",
          feetLeft:
            you === undefined
              ? undefined
              : feetLeft({ id: you.combatantId, feetMoved: you.feetMoved }, speed, {
                  phase: fight.phase,
                  activeCombatantId: upNextId ?? null,
                }),
          movable: yourTurn && !moveWrite.busy,
          onSelect: (row) => setPicked(row.combatantId),
          onMove: move,
        };
  const canvas = stage.wide === true && boardProps !== undefined;

  const card =
    selected !== undefined && selected.kind !== "you" ? (
      <TableRowCard
        row={selected}
        label={labels.get(selected.combatantId) ?? "?"}
        up={selected.combatantId === upNextId}
        onBack={you === undefined ? undefined : () => setPicked(you.combatantId)}
      />
    ) : owned !== undefined ? (
      <YourCard
        name={you?.displayName ?? owned.character.name}
        you={you}
        label={you === undefined ? "?" : (labels.get(you.combatantId) ?? "?")}
        speed={speed}
        actions={actions}
        turns={turns}
        yourTurn={yourTurn}
        busy={turnWrite.busy || savesWrite.busy}
        onTick={tick}
        onDeathSaves={setSaves}
        onDeathSaveRoll={rollDeathSave}
        onRollAction={rollAction}
      />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>Your character</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-0 text-body-s leading-body text-muted-foreground">
            Seat one of your characters in this fight to roll into the table tray.
          </p>
        </CardContent>
      </Card>
    );

  const yourInitiative =
    fight !== null && fight.phase === "initiative" && you !== undefined ? (
      <YourInitiative
        campaignId={campaignId}
        runId={fight.id}
        you={you}
        rollMode={rollMode}
        onRolled={dice.file}
      />
    ) : null;

  const strip =
    fight === null ? null : fight.mode !== "combat" ? (
      <SceneOnTheTable mode={fight.mode} />
    ) : (
      <PlayerStrip
        fight={fight}
        labels={labels}
        selectedId={selectedId}
        floating={canvas}
        onSelect={(row) => setPicked(row.combatantId)}
      />
    );

  const panel = (
    <>
      {banner !== undefined && <TurnBannerCard banner={banner} />}
      {failure !== undefined && (
        <Card className="border-danger">
          <CardContent className="pt-card">
            <SaveFailure failure={failure} />
          </CardContent>
        </Card>
      )}
      {card}
    </>
  );

  const tableCards =
    table === undefined || table === null ? null : (
      <>
        <SessionNpcCard
          campaignId={campaignId}
          sessionId={table.sessionId}
          refreshToken={tableTicks}
        />
        <ReadAloud notes={view?.readAloud ?? []} />
      </>
    );

  const rolls = (
    <TableDice
      sheet={sheet}
      mode={rollMode}
      onMode={setRollMode}
      rolls={view?.rolls ?? []}
      dice={dice}
    />
  );

  return (
    <div
      data-slot="player-table"
      className={cn(
        canvas && "flex h-[calc(100dvh_-_var(--chrome-height)_-_2_*_var(--spacing-page))] flex-col",
      )}
    >
      {stage.probe}
      <TopBar
        framed
        title={view?.campaign.name ?? "The table"}
        subtitle={
          table === undefined
            ? undefined
            : table === null
              ? "No shared live table for one of your seats."
              : `Session ${String(table.sessionNumber)}${
                  fight === null
                    ? " · nothing on the table"
                    : fight.mode !== "combat"
                      ? ` · ${NEUTRAL_RUN_NAMES[fight.mode].toLowerCase()}`
                      : fight.phase === "initiative"
                        ? " · rolling initiative"
                        : ` · round ${String(fight.round)}`
                }`
        }
      >
        <BackLink render={<Link to="/campaigns/$campaignId" params={{ campaignId }} />}>
          Overview
        </BackLink>
      </TopBar>
      {resource.state === "loading" && <Loading label="Reading the live table…" />}
      {resource.state === "failed" && (
        <ApiFailureNotice failure={resource.failure} onRetry={reload} />
      )}
      {view !== undefined && table === null && (
        <EmptyState icon="swords" title="No shared live table">
          When the DM shares a live session and one of your characters has an active seat, the
          player table appears here.
        </EmptyState>
      )}
      {view !== undefined && table !== null && table !== undefined && stage.wide !== undefined && (
        <div className={cn("flex flex-col gap-4", canvas && "min-h-0 flex-1")}>
          {/* Said only when it has fallen behind: a table keeping up needs no word. */}
          {(connection.status === "reconnecting" || connection.status === "stopped") && (
            <p
              role="status"
              className="mb-0 rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-muted-foreground"
            >
              {connection.status === "stopped"
                ? "The live updates stopped. Reload to pick the table up again."
                : "Reconnecting to the table…"}
            </p>
          )}
          {fight === null ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Nothing on the table</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-0 text-body-s leading-body text-muted-foreground">
                    The night is open. The DM has not shared a fight with the table.
                  </p>
                </CardContent>
              </Card>
              {tableCards}
            </>
          ) : canvas && boardProps !== undefined ? (
            <RunStage
              strip={strip}
              rolling={yourInitiative}
              banner={undefined}
              panel={
                <>
                  {panel}
                  {tableCards}
                </>
              }
              rolls={rolls}
              board={(freeArea) => <PlayerBoardStage {...boardProps} freeArea={freeArea} />}
            />
          ) : (
            <RunLayout
              initiative={
                <div className="flex flex-col gap-4">
                  {strip}
                  {yourInitiative}
                </div>
              }
              strip
              map={boardProps === undefined ? null : <PlayerBattleMap {...boardProps} />}
              card={<div className="flex flex-col gap-4">{panel}</div>}
              rest={
                <>
                  {rolls}
                  {tableCards}
                </>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
