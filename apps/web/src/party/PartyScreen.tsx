import type { CampaignMember, Character } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Button, Card, CardContent, Icon } from "@taverns/ui";
import { DateTime } from "effect";
import { useCallback, useMemo, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { CharacterDialog } from "../campaign/CharacterDialog";
import { InviteDialog } from "../campaign/InviteDialog";
import { PartyList } from "../campaign/PartyList";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { AssignDialog } from "./AssignDialog";
import { loadParty } from "./load";
import { needsOf, rosterOf, summaryOf } from "./roster";
import { RosterCard } from "./RosterCard";

/**
 * The party — `ui_kits/dm-screen/Party.jsx` against the real API, and the first
 * screen that makes the invitations already shipped findable.
 *
 * Before this, an invitation lived only in a dialog hung off the campaign
 * screen's top bar, and the answer to *"who is actually at my table"* was
 * nowhere at all: `GET /campaigns/:c/members` had no reader. This is that
 * reader, joined to invitations and characters, which is the only way the three
 * derived statuses in `roster.ts` can be computed.
 *
 * ### What the drawing has that this does not
 *
 * Three things come out, and each is a settled decision rather than an omission:
 *
 * - **Seats.** There is no seat table and there will not be one — a membership
 *   cannot exist before an account, so the drawn *open* seat is not
 *   representable, and *"Add seat"* and the *"4 of 6 seats"* subtitle go with
 *   it. `roster.ts` carries the derivation table.
 * - **A reusable join link** with *"used 2 of 6"* and a *"Link accepts new
 *   players"* switch. **An invitation is single-use by decision** — one
 *   invitation, one membership, naming who took it — which is what makes each
 *   line of the roster a person. The link surface is `InviteDialog`, reused
 *   rather than redrawn, because it already renders exactly this lifecycle and
 *   already got the withdrawn-before-taken precedence right.
 * - **"I approve characters before they play."** The delivery's own open
 *   questions admit there is nothing behind it: no queue, no column, no
 *   endpoint. A switch that does nothing is worse than an absent one.
 *
 * ### And what it keeps
 *
 * *Needs you* is kept whole, because it is the best thing on the drawn screen
 * and every line of it derives from rows that exist. See `needsOf`.
 */

export function PartyScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  // Memoised on the id alone: its identity is what tells `useApiResource` to
  // load again, so an unmemoised closure here would load forever.
  const load = useCallback((client: TavernsClient) => loadParty(campaignId)(client), [campaignId]);
  const [resource, reload] = useApiResource(load);
  // Closed by default — the shell's call to make, and `useHobPanel` says why.
  const hob = useHobPanel({ initialOpen: false });
  const [inviting, setInviting] = useState(false);
  const [assigning, setAssigning] = useState<CampaignMember | undefined>();
  /** The character being written or edited — the old Party tab's one dialog. */
  const [editing, setEditing] = useState<{ readonly character: Character | undefined }>();

  const view = resource.state === "ready" ? resource.value : undefined;

  /**
   * The clock, read once per mount rather than per render.
   *
   * Only one thing on this screen ages — how long an invitation has been waiting
   * — and a value that changed on every render would make `needsOf`'s memo
   * useless while telling the DM nothing they did not already know.
   */
  const [now] = useState(() => DateTime.nowUnsafe());

  const rows = useMemo(
    () => (view === undefined ? [] : rosterOf(view.members, view.characters, view.invites)),
    [view],
  );
  const needs = useMemo(
    () => (view === undefined ? [] : needsOf(rows, view.characters, now)),
    [rows, view, now],
  );

  // The DM is always a row, so "nobody here" is about everyone else: no player
  // has joined and nothing is outstanding. It is what every DM sees first.
  const nobody = rows.every((row) => row.kind === "dm");

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} campaignId={campaignId} />}
      campaignName={view?.campaign.name}
      topBar={
        <TopBar title="Party" subtitle={summaryOf(rows)}>
          {view !== undefined && (
            <>
              {/* **The characters moved here with the sixth delivery's nav, and
                  that is why this button exists.** The campaign screen's third
                  tab was the party's characters and the only place one could be
                  written; the delivery's campaign row has a single *Party*
                  destination, so collapsing the tab without bringing its
                  authoring along would have deleted the only way to add a
                  character. One screen answers "who is at this table" now, in
                  both senses — the people and what they are running. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing({ character: undefined })}
              >
                <Icon name="plus" size={14} />
                Add character
              </Button>
              <Button size="sm" onClick={() => setInviting(true)}>
                <Icon name="user-plus" size={14} />
                Invite a player
              </Button>
            </>
          )}
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading the roster…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined && (
        // `@4xl` (896px) is the *column's* width — `main` is the container — and
        // it is the same threshold the campaign view and the Chronicle dock
        // their `--aside-w` aside at.
        <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
          <div className="min-w-0 flex-1">
            {/* Two lists on one screen since the delivery folded the campaign
                screen's Party tab in here, so each says which it is. They are
                different questions — the accounts at the table, and what those
                accounts are running. */}
            <section aria-label="Who is at the table">
              {nobody ? (
                <EmptyState icon="users" title="Nobody else at the table yet">
                  {view.campaign.visibility === "shared" ? (
                    <>
                      Send somebody a link with{" "}
                      <span className="text-heading">Invite a player</span> above. It works for one
                      person, once, and whoever takes it appears here with their name.
                    </>
                  ) : (
                    <>
                      Send somebody a link with{" "}
                      <span className="text-heading">Invite a player</span> above. This campaign is{" "}
                      <span className="text-heading">Private</span>, so share it from the campaign
                      screen too or whoever joins sees nothing in it.
                    </>
                  )}
                </EmptyState>
              ) : (
                <RosterCard
                  rows={rows}
                  onAssign={(row) => {
                    if (row.kind === "playing" || row.kind === "no-character") {
                      setAssigning(row.member);
                    }
                  }}
                />
              )}
            </section>

            {/* The characters themselves, under the people running them.
                `PartyList` is the campaign screen's old Party tab, moved rather
                than rewritten: it is the one row that draws a character's
                derived descriptor, its AC and its live hit points, and the
                roster above is about accounts. Drawn only when there are any —
                an empty table's answer is the roster's own empty state, and a
                second "nobody yet" under it would say it twice. */}
            {view.characters.length > 0 && (
              <section aria-label="Characters" className="mt-8">
                <h2 className="mb-3 font-display text-body leading-tight font-semibold tracking-display text-heading">
                  Characters
                </h2>
                <PartyList
                  party={view.characters}
                  onEdit={(character) => setEditing({ character })}
                />
              </section>
            )}
          </div>

          <aside className="@4xl:w-aside @4xl:shrink-0">
            <Card tone="sunken">
              <CardContent className="flex flex-col gap-4 pt-card">
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="font-display text-title leading-snug font-semibold text-heading">
                    Needs you
                  </span>
                  <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
                    {needs.length}
                  </span>
                </div>
                {needs.length === 0 ? (
                  <p className="text-body-s leading-body text-faint">
                    {nobody ? (
                      // "Everyone who has joined has a character" is true of an
                      // empty table and reads as nonsense on one, so the sentence
                      // says what the aside will do instead of what it found.
                      <>
                        Nothing yet. Once somebody joins, whatever wants doing about them shows up
                        here.
                      </>
                    ) : (
                      <>
                        Nothing about the party needs you. Everyone who has joined has a character,
                        and no invitation is sitting unanswered.
                      </>
                    )}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {needs.map((nudge) => (
                      <li key={nudge.key} className="flex gap-2">
                        <Icon
                          name={nudge.icon}
                          size={13}
                          className={`mt-0.5 shrink-0 ${nudge.tone}`}
                        />
                        <span className="text-body-s leading-body text-foreground">
                          {nudge.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      {editing !== undefined && view !== undefined && (
        // Keyed on the row, so opening it on a second character builds a fresh
        // form rather than showing the first one's fields.
        <CharacterDialog
          key={editing.character?.id ?? "new-character"}
          campaignId={campaignId}
          character={editing.character}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            // A character is half of what the roster derives from — writing one
            // can flip a member from `no-character` to `playing` and drop a line
            // out of *Needs you*. One re-read, the rule every structural write
            // in this app follows.
            reload();
          }}
        />
      )}

      {inviting && view !== undefined && (
        // The invitation surface, reused whole. `onChanged` rather than
        // `onSaved`: it stays open across several writes — minting one, then
        // withdrawing another — and a revoke changes this screen's roster
        // underneath it, because revoking a spent invitation takes the
        // membership it granted in the same transaction.
        <InviteDialog
          campaign={view.campaign}
          onClose={() => setInviting(false)}
          onChanged={reload}
        />
      )}
      {assigning !== undefined && view !== undefined && (
        <AssignDialog
          key={assigning.accountId}
          campaignId={campaignId}
          member={assigning}
          characters={view.characters}
          onClose={() => setAssigning(undefined)}
          onSaved={reload}
        />
      )}
    </AppShell>
  );
}
