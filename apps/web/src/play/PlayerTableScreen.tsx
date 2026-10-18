import {
  type BoardSquare,
  type CampaignId,
  type CombatantId,
  type DeathSaves,
  NEUTRAL_RUN_NAMES,
  type PlayerLiveCombatant,
  type PlayerLiveCombatantYou,
  type RollMode,
  attackModeAt,
  deathSaveRolled,
  rollDiceExpression,
  walkingFeet,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { deathSaveWrites, setOwnDeathSaves } from "../characters/write";
import { type ActionLine, actionDetail, actionsOf } from "../run/actions";
import { attacks, rollActionThrows, rolls as rollsDice } from "../run/attack";
import { TargetBanner } from "../run/AttackResult";
import { PartyRail, type RailRow } from "../run/PartyRail";
import { actsOfTable } from "../run/effects";
import { useEscapeAway } from "../run/escape";
import { bandOfLine, deliveryFor } from "../run/options";
import { RunLayout } from "../run/RunLayout";
import { CanvasTitle } from "../run/CanvasTitle";
import { RunStage } from "../run/RunStage";
import { TurnCard, type TurnTile } from "../run/TurnCard";
import { useStage } from "../run/stage";
import { feetLeft, type TurnTicks } from "../run/turn";
import { useFullscreen } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { SaveFailure } from "../ui/form";
import { loadPlayerTableView } from "./load";
import { PlayerBattleMap, PlayerBoardStage, type PlayerBoardProps } from "./PlayerBoard";
import { TableRowCard, YourCard } from "./PlayerCard";
import { PlayerStrip } from "./PlayerStrip";
import { SceneOnTheTable } from "./SceneOnTheTable";
import { tableLabels, tableRowState } from "./tableRows";
import { usePlayerTableStream } from "./tableStream";
import {
  ReadAloud,
  SessionNpcCard,
  TableHeard,
  TurnBannerCard,
  YourInitiative,
} from "./TableCards";
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
  const speed = walkingFeet(sheet?.identity?.speed);
  const upNextId = fight?.upNext?.kind === "visible" ? fight.upNext.combatantId : undefined;
  const turns = fight?.mode === "combat" && fight.phase === "turns";
  const yourTurn = you !== undefined && turns && upNextId === you.combatantId;
  const banner = turnBanner(fight);
  const labels = useMemo(() => tableLabels(fight?.order ?? []), [fight?.order]);
  const stage = useStage();

  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [picked, setPicked] = useState<CombatantId>();
  /** Your line waiting for its target: the next creature you pick, on the board or the strip. */
  const [aiming, setAiming] = useState<ActionLine>();
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
    const rolled = rollDiceExpression(
      `${you.displayName} · Death save`,
      "1d20",
      "normal",
      Math.random,
    );
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

  // You can aim only on your turn, from your own square: the aim goes when either does.
  const canAim =
    yourTurn &&
    you !== undefined &&
    fight?.board?.tokens.some((token) => token.combatantId === you.combatantId) === true;
  useEffect(() => {
    if (!canAim) setAiming(undefined);
  }, [canAim]);
  useEscapeAway(aiming !== undefined, () => setAiming(undefined));

  /**
   * Your attack, at the creature you picked: named on the roll as your row at
   * theirs, delivered by the rule a monster's is (`deliveryFor`, at the band
   * the board puts them in, which also rolls a long shot at disadvantage), and
   * resolved by the server against the AC you are never told.
   */
  const aimAt = (row: PlayerLiveCombatant) => {
    if (aiming !== undefined) aimWith(aiming, row);
  };
  /** A line at a creature: from the turn card, target first, or once aimed. */
  const aimWith = (line: ActionLine, row: PlayerLiveCombatant) => {
    if (you === undefined || row.combatantId === you.combatantId) return;
    const board = fight?.board ?? null;
    const at = (id: CombatantId) =>
      board?.tokens.find((token) => token.combatantId === id)?.position;
    const band = bandOfLine(
      line,
      at(you.combatantId),
      at(row.combatantId),
      board === null
        ? undefined
        : { feetPerCell: board.feetPerCell, diagonals: view?.campaign.diagonalRule ?? "five" },
    );
    const throws = rollActionThrows({
      attacker: you.displayName,
      attackerId: you.combatantId,
      line,
      mode: rollMode === "normal" ? attackModeAt(band) : rollMode,
      aim: {
        targetId: row.combatantId,
        delivery: deliveryFor(undefined, line, row.combatantId, band),
      },
    });
    for (const thrown of throws) dice.file(tableRollOf(thrown));
    setAiming(undefined);
  };
  /** A creature picked on the board or the strip: your aim's target, while you aim. */
  const pick = (row: PlayerLiveCombatant) =>
    aiming === undefined ? setPicked(row.combatantId) : aimAt(row);

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
          onTarget: aiming === undefined ? undefined : aimAt,
          onMove: move,
          // The fight's attacks and areas this player may see, their own among them.
          acts: actsOfTable(fight.acts),
        };
  const canvas = stage.wide === true && boardProps !== undefined;

  const turnCardShown = canvas && yourTurn && you !== undefined;
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
        // On the canvas your turn is the turn card's (`run/TurnCard.tsx`).
        actions={turnCardShown ? [] : actions}
        turns={turns && !turnCardShown}
        yourTurn={yourTurn}
        busy={turnWrite.busy || savesWrite.busy}
        onTick={tick}
        onDeathSaves={setSaves}
        onDeathSaveRoll={rollDeathSave}
        onRollAction={rollAction}
        aiming={aiming}
        onAttack={canAim ? setAiming : undefined}
        onCancelAim={() => setAiming(undefined)}
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
        compact={canvas}
        onSelect={pick}
      />
    );

  const partyRail = fight !== null && fight.mode === "combat" && (
    <PartyRail
      rows={fight.order.flatMap((row): ReadonlyArray<RailRow> =>
        row.kind === "npc"
          ? []
          : [
              {
                id: row.combatantId,
                displayName: row.displayName,
                subtitle:
                  [row.subtitle, row.kind === "ally" ? row.playerName : null]
                    .filter((part): part is string => part !== null && part !== "")
                    .join(" · ") || undefined,
                ac: row.kind === "you" ? row.ac : null,
                health: { hp: row.hpCurrent, max: row.hpMax },
                conditions: row.conditions,
                out: tableRowState(row).out,
              },
            ],
      )}
      activeId={upNextId ?? null}
      selectedId={selectedId}
      onSelect={(id) => {
        const row = fight.order.find((candidate) => candidate.combatantId === id);
        if (row !== undefined) pick(row);
      }}
    />
  );

  /** Whoever you picked, other than you: your attack's target, target first. */
  const aimTarget = selected !== undefined && selected.kind !== "you" ? selected : undefined;
  const turnCard =
    turnCardShown && you !== undefined ? (
      <TurnCard
        name={you.displayName}
        label={labels.get(you.combatantId) ?? "?"}
        portrait={you.portrait === null ? undefined : you.portrait.thumbUrl}
        subtitle={you.subtitle ?? undefined}
        subtitleSerif={false}
        health={{ hp: you.hpCurrent, max: you.hpMax }}
        ac={you.ac}
        spent={you}
        speed={speed}
        ticksDisabled={turnWrite.busy}
        onTick={tick}
        tiles={actions.flatMap((line): ReadonlyArray<TurnTile> => {
          const common = {
            key: line.key,
            name: line.name,
            detail: actionDetail(line),
            cost: line.cost,
          };
          return canAim && attacks(line)
            ? [
                {
                  ...common,
                  kind: "attack",
                  label: `Attack with ${line.name}`,
                  pressed: aiming?.key === line.key,
                  onPress: () => {
                    if (aimTarget !== undefined) aimWith(line, aimTarget);
                    else setAiming(line);
                  },
                },
              ]
            : rollsDice(line)
              ? [
                  {
                    ...common,
                    kind: "roll",
                    label: `Roll ${line.name}`,
                    onPress: () => rollAction(line),
                  },
                ]
              : [];
        })}
        tilesDisabled={false}
        hint={
          aiming !== undefined
            ? `Pick a target for ${aiming.name}.`
            : aimTarget !== undefined
              ? `Targeting ${aimTarget.displayName}. The DM tells you whether it lands.`
              : "Pick a creature to target it, then an attack. Drag your token to move."
        }
      />
    ) : null;

  const panel = (
    <>
      {banner !== undefined && <TurnBannerCard banner={banner} />}
      {fight !== null && <TableHeard lines={fight.narration} />}
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

  // On the canvas the screen holds the whole window, as the DM's does: the
  // shell puts its nav rows away and the header floats over the board.
  const onCanvas =
    canvas && view !== undefined && table !== undefined && table !== null && fight !== null;
  useFullscreen(onCanvas);

  const headerTitle = view?.campaign.name ?? "The table";
  const headerSubtitle =
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
          }`;
  const header = (
    <TopBar
      framed
      title={headerTitle}
      {...(headerSubtitle !== undefined && { subtitle: headerSubtitle })}
    >
      <BackLink render={<Link to="/campaigns/$campaignId" params={{ campaignId }} />}>
        Overview
      </BackLink>
    </TopBar>
  );

  /** Said only when it has fallen behind: a table keeping up needs no word. */
  const notice = (connection.status === "reconnecting" || connection.status === "stopped") && (
    <p
      role="status"
      className="mb-0 rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-muted-foreground"
    >
      {connection.status === "stopped"
        ? "The live updates stopped. Reload to pick the table up again."
        : "Reconnecting to the table…"}
    </p>
  );

  return (
    <div data-slot="player-table" className={cn(onCanvas && "flex h-dvh flex-col")}>
      {stage.probe}
      {!onCanvas && header}
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
        <div className={cn("flex flex-col gap-4", onCanvas && "min-h-0 flex-1")}>
          {!onCanvas && notice}
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
          ) : onCanvas && boardProps !== undefined ? (
            <RunStage
              title={
                <CanvasTitle
                  back={{ to: "/campaigns/$campaignId", params: { campaignId } }}
                  title={headerTitle}
                  subtitle={headerSubtitle}
                />
              }
              strip={strip}
              controls={null}
              notices={notice}
              rolling={yourInitiative}
              party={partyRail || null}
              turn={turnCard}
              banner={
                aiming === undefined ? undefined : (
                  <TargetBanner action={aiming.name} onCancel={() => setAiming(undefined)} />
                )
              }
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
