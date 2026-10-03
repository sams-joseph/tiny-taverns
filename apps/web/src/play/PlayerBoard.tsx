import {
  type CombatantId,
  type PlayerLiveBoard,
  type PlayerLiveCombatant,
  battleMapPlane,
  cellRect,
} from "@taverns/api";
import { Card, Icon, SectionHeading, cn } from "@taverns/ui";
import { useMemo } from "react";
import { BattleMapBoard, describeBoard } from "../campaign/BattleMapBoard";
import { AreaLayer } from "../run/BoardTools";
import { FogLayer } from "../run/Fog";
import { TokenFace } from "../run/TokenFace";
import { labelsInOrder, percentOf } from "../run/tokens";

/**
 * The fight's battle map as a seated player sees it, once the DM has turned on
 * *Share map* — built from the DM's own parts, read-only (the captain's call:
 * the picture, the grid, and tokens for everyone the players can already see
 * in initiative).
 *
 * It draws `PlayerLiveBoard`, a schema of its own with no setting line and no
 * "Hob is drawing", so the board is handed those as absent rather than the
 * wide type narrowed here: the picture's alt text is the generic one, and a
 * picture not drawn yet is the grid alone.
 *
 * A token is a row of the player's order standing on a square: the server
 * sends only those (`tokenShown`), so a hidden creature, or every monster while
 * the DM hides them, is simply not here. Each wears the DM's face
 * (`run/TokenFace.tsx`) — ringed in the party's colour or everyone else's, the
 * one whose turn it is ringed peach, yours ringed as the DM's selected token
 * is — and fades when it is down. Nothing takes a click: players do not move
 * tokens.
 *
 * Fog of war covers its squares outright (`PlayerLiveBoard.fog`, drawn by the
 * DM's own `run/Fog.tsx` layer, opaque here where the DM's is dim): the picture
 * and the grid under it are gone, and so is everything standing there, since
 * the server sends no token under fog but this player's own, which is drawn
 * over it.
 *
 * An area the DM has pinned (`PlayerLiveBoard.area`, a spell's sphere, cone,
 * line or cube) is drawn under the tokens and the fog by the DM's own layer
 * (`run/BoardTools.tsx`), so the table sees where it lands and who stands in
 * it. Who it catches is not said here: the DM's banner names creatures this
 * player may not see.
 *
 * The numbers on two tokens of one name follow this player's order, since the
 * table answers no creation time; they need not match the DM's board.
 */
export function PlayerBattleMap({
  board,
  order,
  upNextId,
}: {
  readonly board: PlayerLiveBoard;
  /** The player's order, which every token is a row of. */
  readonly order: ReadonlyArray<PlayerLiveCombatant>;
  readonly upNextId: CombatantId | undefined;
}) {
  const map = { ...board, setting: null, imagePending: false };
  const plane = battleMapPlane(map, map.image);
  const labels = useMemo(
    () =>
      labelsInOrder(order.map((row) => ({ id: row.combatantId, displayName: row.displayName }))),
    [order],
  );
  const rows = new Map(order.map((row) => [row.combatantId, row]));

  return (
    <Card aria-label="Battle map" role="region" className="overflow-clip">
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Battle map
        </SectionHeading>
      </div>
      <BattleMapBoard map={map}>
        {board.area !== null && <AreaLayer board={map} area={board.area} state="pinned" />}
        <FogLayer board={map} squares={board.fog} veil="opaque" />
        {board.tokens.map((token) => {
          const row = rows.get(token.combatantId);
          if (row === undefined) return null;
          const down =
            (row.kind === "you" && row.hpCurrent === 0) ||
            (row.kind === "npc" && row.hpBand === "down");
          return (
            <span
              key={token.combatantId}
              data-slot="token"
              role="img"
              aria-label={`${row.displayName}${row.kind === "you" ? " (you)" : ""}, column ${String(token.position.column + 1)}, row ${String(token.position.row + 1)}`}
              className={cn(
                "absolute transition-[left,top] duration-(--dur-base) ease-out",
                down && "opacity-45",
              )}
              // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
              style={percentOf(cellRect(map, token.position), plane)}
            >
              <TokenFace
                party={row.kind !== "npc"}
                label={labels.get(row.combatantId) ?? "?"}
                selected={row.kind === "you"}
                active={row.combatantId === upNextId}
              />
            </span>
          );
        })}
      </BattleMapBoard>
      <p className="mb-0 border-t border-hairline px-panel py-2.5 text-caption leading-body text-muted-foreground">
        {describeBoard(map)}
      </p>
    </Card>
  );
}
