import type { PartySeat } from "@taverns/api";
import { Badge, Button, Card, Icon } from "@taverns/ui";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";

/**
 * The party: one `--row-h` row per **seat**, hairline-separated.
 *
 * Under the continuity decision a campaign holds seats over shared,
 * account-owned characters, so what a row draws is two things at once: the
 * seat's own facts (the campaign's word for who sits here, and whether the
 * table may see them) and the live shared character behind it — the same
 * number the initiative row is showing, written by the same transaction, and
 * the same number every *other* table seating this character is showing too.
 *
 * The pencil is gone with the DM-typed character: nobody edits somebody
 * else's sheet any more, and the character's own name is a fact its owner
 * writes through `/me`. What the creator has instead are the seat's two
 * verbs — sharing it with the table, and retiring it — which are the whole of
 * `PartySeatUpdate` and `party.leave` given controls.
 *
 * A seat whose character has been deleted keeps standing with the snapshot it
 * took at join time; the row says so rather than vanishing, because the
 * roster line is campaign history.
 */
function Stat({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-label-s leading-none font-medium text-faint">{label}</span>
      <span className="font-mono text-mono leading-none font-medium text-foreground">{value}</span>
    </span>
  );
}

/**
 * `44 / 52`, or `52` when nobody has said where they are.
 *
 * `hpCurrent` is null until something writes it, and that is not the same as
 * full — so the row shows the one number it actually has rather than inventing
 * the pair.
 */
const hitPoints = (current: number | null, max: number | null): string | null =>
  max === null
    ? current === null
      ? null
      : String(current)
    : current === null
      ? String(max)
      : `${String(current)} / ${String(max)}`;

/**
 * The seat's two verbs, for the campaign's creator.
 *
 * Sharing is `PartySeatUpdate.visibility` — the campaign-scoped half of what
 * used to be the character's own toggle — and retiring is `party.leave`, which
 * stamps `left_at` and never deletes: the owner keeps the character, and a
 * rejoin is a fresh seat. Both name `reads.party`, which is the one read this
 * list is drawn from.
 */
function SeatActions({ seat }: { readonly seat: PartySeat }) {
  const { busy, submit } = useMutation();
  const shared = seat.seat.visibility === "shared";
  const name = seat.character?.name ?? seat.seat.displayName;
  const params = {
    campaignId: seat.seat.campaignId,
    campaignCharacterId: seat.seat.id,
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-my-1 shrink-0"
        disabled={busy}
        aria-label={shared ? `Hide ${name} from the table` : `Share ${name} with the table`}
        onClick={() =>
          void submit(
            (client) =>
              client.party.update({
                params,
                payload: { visibility: shared ? "dm" : "shared" },
              }),
            [reads.party(seat.seat.campaignId)],
          )
        }
      >
        <Icon name={shared ? "lock" : "users"} size={13} />
        {shared ? "Hide" : "Share"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="-my-1 -mr-1 size-7 shrink-0"
        disabled={busy}
        aria-label={`Retire ${name}'s seat`}
        onClick={() =>
          void submit(
            (client) => client.party.leave({ params }),
            [reads.party(seat.seat.campaignId)],
          )
        }
      >
        <Icon name="user-round-x" size={14} />
      </Button>
    </>
  );
}

export function PartyList({
  party,
  canManage = false,
}: {
  readonly party: ReadonlyArray<PartySeat>;
  /** The creator's verbs — drawn only where the write would be accepted. */
  readonly canManage?: boolean;
}) {
  return (
    <Card>
      {party.map((row, index) => {
        const character = row.character;
        const detail = [
          character?.descriptor ?? null,
          row.seat.playerDisplayName ?? character?.playerName ?? null,
        ].filter((part): part is string => part !== null && part !== "");
        const hp = character === null ? null : hitPoints(character.hpCurrent, character.hpMax);
        return (
          <div
            key={row.seat.id}
            className={
              index === 0
                ? "flex min-h-row flex-wrap items-center gap-2.5 px-card py-2"
                : "flex min-h-row flex-wrap items-center gap-2.5 border-t border-hairline px-card py-2"
            }
          >
            <Icon name="shield" size={15} className="text-faint" />
            <span className="text-body-s leading-body text-foreground">
              {character?.name ?? row.seat.displayName}
            </span>
            {detail.length > 0 && (
              <span className="text-body-s leading-body text-muted-foreground">
                {detail.join(" · ")}
              </span>
            )}
            {character === null && (
              // The snapshot outliving its character: the honest sentence,
              // not a vanished row.
              <span className="text-body-s leading-body text-faint">Character deleted</span>
            )}
            <span className="ml-auto flex items-center gap-4">
              {character?.sheetUrl != null && (
                <a
                  href={character.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-label-s leading-none font-medium text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
                >
                  Sheet
                </a>
              )}
              {character !== null && character.ac !== null && (
                <Stat label="AC" value={character.ac} />
              )}
              {hp !== null && <Stat label="HP" value={hp} />}
              {character !== null && character.tempHp > 0 && (
                <Stat label="TEMP" value={character.tempHp} />
              )}
              {(character?.conditions ?? []).map((condition) => (
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
              {row.seat.visibility === "shared" && <Badge variant="info">Shared</Badge>}
              {canManage && <SeatActions seat={row} />}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
