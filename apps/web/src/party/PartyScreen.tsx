import type { CampaignMember, PartySeat } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Badge, Button, Card, EmptyState, Icon, SectionHeading, cn } from "@taverns/ui";
import { DateTime } from "effect";
import { useMemo, useState } from "react";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { InviteDialog } from "../campaign/InviteDialog";
import { savesOf } from "../characters/sheet";
import {
  bestInParty,
  partySummary,
  passivesOf,
  SAVE_ABILITIES,
  seatCard,
  summaryLine,
} from "./cards";
import { rosterAtom, type PartyRoster } from "./load";
import { notPlayingYet, rosterOf, type NotPlaying } from "./roster";
import { SeatCard } from "./SeatCard";

/**
 * The party, as the campaign redesign draws the tab (`Campaign Overview.dc.html`):
 * a card per character, the passives and saves a DM rolls behind the screen, and
 * — only when there is anyone — the people who are not playing yet.
 *
 * **The page is centred at the Overview's width** (`CampaignChrome`'s
 * `centred`), header included, and scrolls with the window. The header's line
 * is `summaryLine`: how many characters, their level, the party's hit points,
 * and who is hurting by the bar's own bands.
 *
 * **Creator-only through its read, not through the tab.** The cards come from
 * the frame's `party.list`, which a player can read too; `extra` is the roster
 * (`members.list` and `invites.list`), behind the `DmActor` gate, so a player
 * at this URL gets the ordinary `NotFound` and the frame says *Not here*. The
 * members also name a card's player when neither the seat nor the character
 * does.
 *
 * **In-play verbs on the card, management on the seat's page.** A card's − and
 * + move hit points; the card itself opens the seat (`SeatScreen.tsx`), where
 * sharing, temporary hit points, conditions and retiring live.
 *
 * What the drawing has that this leaves out, each a decision rather than an
 * omission: *Party stash*, which has no model; a dash for an unanswered tile,
 * which is a stub (the tile is not drawn); and an *Unconscious* badge at zero,
 * a condition nobody wrote (the bar is empty and the header says who is down).
 */
export function PartyScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const [inviting, setInviting] = useState(false);

  return (
    <CampaignChrome<PartyRoster>
      campaignId={campaignId}
      title="Party"
      centred
      extra={rosterAtom(campaignId)}
      subtitle={({ view }) => summaryLine(partySummary(view.party))}
      actions={() => (
        // Outline, not peach: the campaign row's press is this screen's one
        // primary. The party's long rest stands before it.
        <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
          <Icon name="user-plus" size={14} />
          Invite player
        </Button>
      )}
    >
      {(slots) => <Party slots={slots} inviting={inviting} onInvite={setInviting} />}
    </CampaignChrome>
  );
}

function Party({
  slots,
  inviting,
  onInvite,
}: {
  readonly slots: CampaignChromeSlots<PartyRoster>;
  readonly inviting: boolean;
  readonly onInvite: (inviting: boolean) => void;
}) {
  const { view, extra } = slots;

  /**
   * The clock, read once per mount rather than per render: the one thing here
   * that ages is how long an invitation has waited, and a value that changed
   * on every render would make the memo below useless.
   */
  const [now] = useState(() => DateTime.nowUnsafe());
  const waiting = useMemo(
    () => notPlayingYet(rosterOf(extra.members, view.party, extra.invites), now),
    [extra.members, extra.invites, view.party, now],
  );

  return (
    <div className="flex flex-col gap-8">
      {view.party.length === 0 ? (
        <EmptyState icon="users" title="Nobody has a character here yet">
          {view.campaign.visibility === "shared" ? (
            <>
              Send somebody a link with <span className="text-heading">Invite player</span> above.
              It works for one person, once; when they seat a character it appears here.
            </>
          ) : (
            <>
              Send somebody a link with <span className="text-heading">Invite player</span> above.
              This campaign is <span className="text-heading">Private</span>, so share it from the
              campaign screen too or whoever joins sees nothing in it.
            </>
          )}
        </EmptyState>
      ) : (
        <>
          <PartyGrid party={view.party} members={extra.members} />
          <PassivesAndSaves party={view.party} />
          {/* *Between them* stands here, under the passives. */}
        </>
      )}

      {waiting.length > 0 && <NotPlayingYet people={waiting} />}

      {inviting && (
        // The invitation surface, reused whole. It stays open across several
        // writes — minting one, then withdrawing another — and both reach the
        // list above without a callback: it reads the same invitations atom
        // the dialog does, and a revoke names `reads.members` because revoking
        // a spent invitation takes the membership it granted.
        <InviteDialog campaign={view.campaign} onClose={() => onInvite(false)} />
      )}
    </div>
  );
}

/**
 * The cards. The columns are the drawing's own `auto-fill` over a
 * `--party-card-min` floor, so they follow the room the page has, a docked Hob
 * panel included, and never a viewport breakpoint. Each card spans several of
 * this grid's rows as a subgrid (`SeatCard`), which is what keeps a row of
 * cards' hit points level.
 */
function PartyGrid({
  party,
  members,
}: {
  readonly party: ReadonlyArray<PartySeat>;
  readonly members: ReadonlyArray<CampaignMember>;
}) {
  return (
    <section
      aria-label="Characters"
      data-slot="party-grid"
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--spacing-party-card)),1fr))] gap-4"
    >
      {party.map((row) => (
        <SeatCard
          key={row.seat.id}
          row={row}
          card={seatCard(
            row,
            members.find((member) => member.accountId === row.seat.accountId),
          )}
        />
      ))}
    </section>
  );
}

/** The table's columns, in the drawn order; `passivesOf` answers the first three. */
const PASSIVES = [
  { key: "perception", label: "Perception" },
  { key: "insight", label: "Insight" },
  { key: "investigation", label: "Investigation" },
] as const;

const signed = (value: number): string => (value > 0 ? `+${String(value)}` : String(value));

/**
 * *Passives and saves*: for the checks a DM rolls behind the screen, the three
 * passives and six saves of every character, the party's best in each column
 * picked out (every one of a tie).
 *
 * **No inner scroller.** The drawing scrolls its table sideways below 760px;
 * pages here scroll with the window alone. So the section is a container, and
 * below `@3xl` (768px, the scale's step beside the drawing's 760, since a
 * container query cannot read a custom property) each character becomes a
 * block of its own — the name,
 * then its nine figures in a wrapping grid, each labelled — rather than a row
 * of a table too wide for it. Wide, it is the drawn table. It is one set of
 * elements laid out two ways, with explicit table roles so either layout reads
 * as the same table.
 *
 * A figure the sheet does not answer is an empty cell, never a dash; a
 * character whose sheet answers none of the nine has no row, and a party none
 * of whose sheets answers anything has no section.
 */
function PassivesAndSaves({ party }: { readonly party: ReadonlyArray<PartySeat> }) {
  const rows = party.flatMap((row) => {
    if (row.character === null) return [];
    const passives = passivesOf(row.character.sheet);
    const saves = savesOf(row.character.sheet) ?? {};
    const values = [
      ...PASSIVES.map((column) => passives[column.key]),
      ...SAVE_ABILITIES.map((ability) => saves[ability]),
    ];
    return values.every((value) => value === undefined)
      ? []
      : [{ id: row.seat.id, name: row.character.name, values }];
  });
  if (rows.length === 0) return null;

  const columns = [
    ...PASSIVES.map((column) => column.label),
    ...SAVE_ABILITIES.map((ability) => ability),
  ];
  const best = columns.map((_, index) => bestInParty(rows.map((row) => row.values[index])));

  // Narrow: six columns, the name across them, a passive over two and a save
  // over one. Wide: the drawing's name, three passives and six saves.
  const grid =
    "grid grid-cols-6 gap-x-2 @3xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_repeat(6,minmax(0,0.7fr))]";
  const span = (index: number) =>
    cn(
      index < PASSIVES.length ? "col-span-2" : "col-span-1",
      "@3xl:col-span-1",
      // The drawing's gap between the passives and the saves.
      index === PASSIVES.length && "@3xl:pl-3",
    );

  return (
    <Card data-slot="party-passives" className="@container overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-card py-4">
        <SectionHeading size="title" id="party-passives-heading">
          Passives and saves
        </SectionHeading>
        <p className="mb-0 text-body-s leading-body text-muted-foreground">
          For checks you roll behind the screen. Best in the party is highlighted.
        </p>
      </div>
      <div role="table" aria-labelledby="party-passives-heading">
        <div role="rowgroup" className="hidden @3xl:block">
          <div
            role="row"
            className={cn(
              grid,
              "bg-surface-sunken px-card py-2.5 text-caption text-muted-foreground",
            )}
          >
            <span role="columnheader">Character</span>
            {columns.map((label, index) => (
              <span key={label} role="columnheader" className={cn(span(index), "text-center")}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {rows.map((row, rowIndex) => (
            <div
              key={row.id}
              role="row"
              className={cn(
                grid,
                "gap-y-3 border-t border-hairline px-card py-3 @3xl:min-h-row @3xl:items-center @3xl:py-0",
                rowIndex === 0 && "border-t-0 @3xl:border-t",
              )}
            >
              <span
                role="rowheader"
                className="col-span-6 text-body-s leading-snug font-semibold text-heading @3xl:col-span-1"
              >
                {row.name}
              </span>
              {row.values.map((value, index) => (
                <span
                  key={columns[index]}
                  role="cell"
                  className={cn(
                    span(index),
                    "flex flex-col items-center gap-1 @3xl:block @3xl:text-center",
                  )}
                >
                  {/* The cell's own label, for the narrow layout, where there
                      is no header row above it; a blank cell names nothing. */}
                  {value !== undefined && (
                    <span className="text-micro leading-none text-muted-foreground @3xl:sr-only">
                      {columns[index]}
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-mono text-mono leading-none",
                      value === undefined
                        ? ""
                        : best[index]?.has(rowIndex) === true
                          ? "text-accent-ink"
                          : index >= PASSIVES.length && value <= 0
                            ? "text-faint"
                            : "text-heading",
                    )}
                  >
                    {value === undefined
                      ? ""
                      : index < PASSIVES.length
                        ? String(value)
                        : signed(value)}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * The people at the table, or invited to it, who have no character in the
 * party — `notPlayingYet`, with *Needs you*'s nudges folded into each line.
 * Drawn only when there is somebody to list. The invitation lifecycle itself
 * stays in `InviteDialog`, which *Invite player* opens.
 */
function NotPlayingYet({ people }: { readonly people: ReadonlyArray<NotPlaying> }) {
  return (
    <section aria-label="Not playing yet" className="flex flex-col gap-3">
      <SectionHeading
        size="subtitle"
        action={
          <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
            {people.length}
          </span>
        }
      >
        Not playing yet
      </SectionHeading>
      <Card>
        <ul className="m-0 list-none p-0">
          {people.map((person, index) => (
            <li
              key={person.key}
              className={cn(
                "flex min-h-row flex-wrap items-center gap-3 px-card py-2.5",
                index > 0 && "border-t border-hairline",
              )}
            >
              <Icon
                name={person.kind === "invited" ? "mail" : "user-round-x"}
                size={15}
                className={
                  person.kind === "invited" ? "shrink-0 text-faint" : "shrink-0 text-danger-ink"
                }
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body-s leading-body font-semibold text-heading">
                  {person.name}
                </span>
                <span className="text-caption leading-body text-muted-foreground">
                  {person.detail}
                </span>
              </div>
              {person.kind === "invited" ? (
                <Badge variant="info">Invited</Badge>
              ) : (
                <Badge variant="destructive">No character</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
