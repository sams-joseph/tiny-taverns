import type { CampaignId, CharacterId, Roll, RollKind } from "@taverns/api";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import type { LocalRoll } from "../characters/rolls";
import type { DmThrow } from "../run/dice";

/** A roll as a player files it: what was rolled, and what it was for. */
export interface TableRoll extends LocalRoll {
  readonly kind?: RollKind;
}

export interface PendingRoll extends TableRoll {
  readonly localId: string;
  readonly state: "sending" | "sent" | "failed";
  readonly message: string;
}

const newRollRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `roll-${String(Date.now())}-${String(Math.random())}`;

/** One of the throws a line rolls (`rollActionThrows`), as a player's roll: no combatant named. */
export const tableRollOf = (thrown: DmThrow): TableRoll => ({
  label: thrown.label,
  notation: thrown.notation,
  dice: thrown.dice,
  kept: thrown.kept,
  modifier: thrown.modifier,
  total: thrown.total,
  mode: thrown.mode,
  ...(thrown.critical === "hit"
    ? { natural: 20 }
    : thrown.critical === "miss"
      ? { natural: 1 }
      : {}),
  ...(thrown.kind === undefined ? {} : { kind: thrown.kind }),
});

/**
 * Your rolls at the table: rolled here, sent under your seated character
 * (`rolls.create`), and kept in your tray while they travel. The server
 * stores the faces it is sent and the DM's runner prints them; a roll the
 * table refuses stays in the tray, said so.
 */
export function useTableRolls({
  campaignId,
  characterId,
  rolls,
}: {
  readonly campaignId: CampaignId;
  /** Your seated character, or nothing to roll under. */
  readonly characterId: CharacterId | undefined;
  readonly rolls: ReadonlyArray<Roll>;
}) {
  const { failure, submit } = useMutation();
  const [pending, setPending] = useState<ReadonlyArray<PendingRoll>>([]);
  const visible = pending.filter((item) => !rolls.some((roll) => roll.requestId === item.localId));

  const file = (roll: TableRoll | undefined) => {
    if (roll === undefined || characterId === undefined) return;
    const requestId = newRollRequestId();
    setPending((current) =>
      [
        {
          ...roll,
          localId: requestId,
          state: "sending" as const,
          message: "Sending to the table…",
        },
        ...current,
      ].slice(0, 6),
    );
    const critical = roll.natural === 20 ? "hit" : roll.natural === 1 ? "miss" : undefined;
    void submit(
      (client) =>
        client.rolls.create({
          params: { campaignId },
          payload: {
            characterId,
            label: roll.label,
            notation: roll.notation,
            dice: roll.dice,
            kept: roll.kept,
            modifier: roll.modifier,
            total: roll.total,
            mode: roll.mode,
            requestId,
            ...(critical === undefined ? {} : { critical }),
            ...(roll.kind === undefined ? {} : { kind: roll.kind }),
          },
        }),
      [reads.playerTable(campaignId)],
    ).then((result) => {
      setPending((current) =>
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

  return { pending: visible, failure, file };
}

export type TableRolls = ReturnType<typeof useTableRolls>;
