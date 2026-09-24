import type { CampaignId, PartySeat } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Icon } from "@taverns/ui";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { HpBar } from "../characters/SheetParts";
import { hitPoints, hpFraction, lineageLine } from "../characters/sheet";
import { partyLevel } from "./overview";
import { OverviewCard, OverviewEmpty, sectionLink } from "./OverviewParts";

/**
 * One seat, summarised: who, what and whose, then armour class and hit points.
 *
 * Each stat is drawn only when the character has it — `ac` and `hpMax` are null
 * until somebody writes them, and a stubbed *AC —* is the absent line this
 * product refuses. The hit points are the sheet's own words and bar
 * (`characters/sheet.ts`, `SheetParts.HpBar`), so a character reads the same
 * here as on its sheet and on *My characters*.
 */
function PartyRow({ row }: { readonly row: PartySeat }) {
  const character = row.character;
  const name = character?.name ?? row.seat.displayName;
  const player = row.seat.playerDisplayName ?? character?.playerName ?? null;
  const detail = [
    character === null ? "Character deleted" : (lineageLine(character) ?? character.descriptor),
    player,
  ].filter((part): part is string => part !== null && part !== "");
  const hp = character === null ? undefined : hitPoints(character.hpCurrent, character.hpMax);
  const fraction =
    character === null ? undefined : hpFraction(character.hpCurrent, character.hpMax);

  return (
    <li className="flex min-h-row items-center gap-2.5 border-t border-hairline px-card py-2 first:border-t-0">
      <CharacterPortrait
        name={name}
        portrait={character?.portrait ?? null}
        size="row"
        fallback={<Icon name="shield" size={15} className="text-info" />}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-s leading-snug font-semibold text-heading">{name}</div>
        {detail.length > 0 && (
          <div className="truncate text-label-s leading-snug text-muted-foreground">
            {detail.join(" · ")}
          </div>
        )}
      </div>
      {character?.ac != null && (
        <span className="shrink-0 font-mono text-mono leading-none font-medium whitespace-nowrap text-muted-foreground">
          AC {character.ac}
        </span>
      )}
      {hp !== undefined && (
        <div className="flex w-20 shrink-0 flex-col items-end gap-1.5">
          <span className="font-mono text-mono leading-none font-medium whitespace-nowrap text-foreground">
            {hp}
          </span>
          {fraction !== undefined && <HpBar fraction={fraction} className="h-1 w-full" />}
        </div>
      )}
    </li>
  );
}

/**
 * Who is at the table, at a glance, with the way to the screen that manages it.
 *
 * Below the rows, how many people at the table have no character — a real read
 * (`campaign.playerCount` against the accounts holding a seat) that the drawing
 * leaves out and the Overview has always said.
 */
export function PartyCard({
  party,
  playerCount,
  campaignId,
}: {
  readonly party: ReadonlyArray<PartySeat>;
  readonly playerCount: number;
  readonly campaignId: CampaignId;
}) {
  // A seat names the account that holds it, so "how many players have no
  // character" is the players minus the accounts with a live seat.
  const held = new Set(party.map((row) => row.seat.accountId));
  const without = Math.max(0, playerCount - held.size);
  const level = partyLevel(party);

  return (
    <OverviewCard
      title="Party"
      meta={
        level === undefined ? undefined : (
          <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
            {level}
          </span>
        )
      }
      action={
        <Link
          to="/campaigns/$campaignId/party"
          params={{ campaignId }}
          className={sectionLink}
          // The visible word leads, so a voice-control user's "Manage" still
          // names it, and the rest says what is managed.
          aria-label="Manage party"
        >
          Manage
        </Link>
      }
    >
      {party.length === 0 ? (
        <OverviewEmpty>Nobody has a character yet.</OverviewEmpty>
      ) : (
        <ul>
          {party.map((row) => (
            <PartyRow key={row.seat.id} row={row} />
          ))}
        </ul>
      )}
      {without > 0 && (
        <p className="mb-0 border-t border-hairline px-card py-3 text-caption leading-snug text-faint">
          {without} {without === 1 ? "player has" : "players have"} no character
        </p>
      )}
    </OverviewCard>
  );
}
