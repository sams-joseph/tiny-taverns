import type { CampaignMembership } from "@taverns/api";
import { Link, type LinkProps } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { runApiResult } from "../api/client";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useCredential } from "../auth/credential";
import { Hob, useHobPanel } from "../hob";
import { useMode } from "../shell/location";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { ArchiveDialog } from "./ArchiveDialog";
import { ArchivedDialog } from "./ArchivedDialog";

/**
 * The way in: every table this credential reaches, and what you are at each.
 *
 * The designers drew no picker — their kit starts inside one campaign — so this
 * is the smallest shell that reaches `CampaignHome` and no more. It carries the
 * one write on the way in, because a picker that cannot create is a dead end on
 * a fresh database, and dropping to `curl` to see your own first screen is not a
 * product.
 *
 * **It reads `GET /me/campaigns` rather than `GET /campaigns`, and the
 * difference is one field.** Since the invite landed, an account can be at a
 * table it does not run, and this is the screen where that first shows: the
 * membership carries the role, which the campaign row cannot, because a role is
 * a fact about the pair. Both reads compose the same predicate (see
 * `CampaignMembership`), so the switch cannot change *which* campaigns appear —
 * only what the screen can say about them.
 *
 * ### It is two screens now, on one read
 *
 * **The role switch is a mode**, so this file answers two questions rather than
 * one: *the tables I run* at `#/campaigns`, and *the tables I sit at* at
 * `#/play`. One `useApiResource` and one endpoint serve both — `role` is on
 * every row already — and the split is a filter over the answer plus different
 * copy, different affordances and a different destination per row.
 *
 * That last one is the point of the whole step. A player's row goes to
 * `#/play/campaigns/:c`, not to the DM's campaign screen, which composes
 * `runs.list` and would answer them a 404 the first time they followed an
 * invitation. **The branch is the thing that stops a player landing on a broken
 * screen**, so it happens here — at the only place that knows the role — rather
 * than being discovered by the screen underneath.
 *
 * ### It is also where a campaign leaves the list, and comes back
 *
 * The captain asked to *delete* campaigns; what this product has is archiving,
 * which it has argued for since `0001` — *a campaign is somebody's two years of
 * Thursday nights*. `DELETE /campaigns/:c` stamps `archived_at` and nothing
 * else, and `POST /campaigns/:c/restore` clears it, so the round trip is exact.
 *
 * Both halves hang off this screen because a campaign list is where you notice
 * a table you have stopped running, and neither is on the row alone: *Archive*
 * opens `ArchiveDialog`, which names the campaign before it does anything, and
 * the shelf is `ArchivedDialog` behind one muted line at the foot. The rule
 * `CampaignDialog` set — archiving does not share a button with renaming —
 * still holds; what it has now is a deliberate home rather than none.
 *
 * **Archiving is the DM's, read off the row and not off the mode.** `onArchive`
 * is undefined unless `membership.role === "dm"`, so a player at a table sees
 * neither the control nor the shelf, and `campaignWritable` refuses the write
 * underneath either way.
 *
 * This screen used to *offer* the switch too, on the reasoning that only a
 * reader of `GET /me/campaigns` knows whether there is a player side at all.
 * The reasoning was sound and the conclusion was the bug: it made the pill
 * per-screen (so it vanished everywhere else) and conditional on already
 * holding a `player` membership (so the account that most needs it — a DM
 * handed a link to somebody else's table — never saw it). The switch is the
 * shell's now, unconditionally; what this screen owes the player side is the
 * honest empty state below. See `TopNav` in `shell/AppShell.tsx`.
 */

/**
 * Every table this account is at, as an atom. No key: the read names no
 * campaign, so there is one of it — and both modes of the list read the same
 * one, narrowed in the browser by role.
 */
const membershipsAtom = apiAtom((client) => client.me.campaigns());

function CampaignRow({
  membership,
  onArchive,
}: {
  readonly membership: CampaignMembership;
  /** Undefined at a table you only sit at — see the archiving note above. */
  readonly onArchive: (() => void) | undefined;
}) {
  const campaign = membership.campaign;
  // A mode, not a filter: the row goes to the screen for the role you are at
  // this table in, and there is exactly one such screen.
  const open: LinkProps =
    membership.role === "player"
      ? { to: "/play/campaigns/$campaignId", params: { campaignId: campaign.id } }
      : { to: "/campaigns/$campaignId", params: { campaignId: campaign.id } };
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link {...open} className="text-heading no-underline hover:text-link-hover">
              {campaign.name}
            </Link>
          </CardTitle>
          {/* No `Player` badge any more, for the reason it earned one before:
              absence is what says "yours". Under a mode every row in a list has
              the same role, so a badge on all of them would say nothing — the
              nav and the pill are what carry which side you are looking at. */}
          {campaign.visibility === "shared" && <Badge variant="info">Shared</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5 text-body-s leading-body text-muted-foreground">
          <Icon name="users" size={15} className="text-faint" />
          {campaign.playerCount} {campaign.playerCount === 1 ? "player" : "players"}
        </span>
        {campaign.partyName !== null && campaign.partyName !== "" && (
          <span className="text-body-s leading-body text-muted-foreground">
            {campaign.partyName}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Deliberate rather than prominent: the press opens a confirmation
              that names the campaign, which is the check a row cannot make.
              `ArchiveDialog` is where the reasoning lives. */}
          {onArchive !== undefined && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onArchive}>
              Archive
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-link"
            nativeButton={false}
            render={<Link {...open} />}
          >
            Open
            <Icon name="chevron-right" size={15} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Names a new campaign. Everything else about it has a column default. */
function NewCampaign({ onCreated }: { readonly onCreated: () => void }) {
  const fetchCredential = useCredential();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) => client.campaigns.create({ payload: { name: name.trim() } }),
      token,
    );
    setBusy(false);
    if (Result.isFailure(result)) {
      setError(
        result.failure.kind === "unauthorized"
          ? "That credential is not good for this."
          : "That did not save. Try it again.",
      );
      return;
    }
    setName("");
    onCreated();
  }, [fetchCredential, name, onCreated]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="New campaign name"
          placeholder="The Salt Road"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => void create()} disabled={busy || name.trim() === ""}>
          {busy ? "Working…" : "Start a campaign"}
        </Button>
      </div>
      {error !== undefined && (
        <p role="alert" className="text-body-s leading-body text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function CampaignsScreen() {
  const [resource, reload] = useApiAtom(membershipsAtom);
  /** The campaign a confirmation is open over, and the shelf's own dialog. */
  const [archiving, setArchiving] = useState<CampaignMembership | undefined>();
  const [shelfOpen, setShelfOpen] = useState(false);
  // Closed, against the hook's own `true` default, and its doc says why the
  // choice is the shell's: a 400px panel that opens itself is worse than a
  // button that opens it when you ask. This screen passes no campaign either —
  // Hob's tools all hang off one, so here it says so rather than offering a
  // composer with nowhere to send.
  const hob = useHobPanel({ initialOpen: false });

  const player = useMode() === "player";

  // No `archivedAt === null` filter here any more, and its absence is the
  // point: `GET /me/campaigns` is the live shelf by the URL it is, and
  // `repo/Memberships.ts` is the one place that clause is written. The filter
  // that used to be here was dead weight sitting on top of the server's — a
  // second answer to which campaigns are on the list, which is exactly what the
  // archived list would have had to reach around.
  const memberships =
    resource.state === "ready"
      ? resource.value.filter((row) => (player ? row.role === "player" : row.role === "dm"))
      : undefined;

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title={player ? "Tables" : "Campaigns"}
          subtitle={
            player
              ? "The tables you sit at. What you can read at each is whatever its DM has shared."
              : "The tables you run."
          }
        />
      }
    >
      {/* No page-wide `max-w`: the rail's 260px came back to this column, and a
          measure cap would have banked it as empty space on the right. The rows
          spread into two columns once the column is wide enough for a pair —
          the same rule, and the same `@3xl` turn-over, as the encounter grid. */}
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your campaigns…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}
        {memberships !== undefined && (
          <>
            {/* Creating a campaign makes you its DM — `Campaigns.create` writes
                the owner's `dm` row in the same transaction — so the one write
                on the way in belongs to the DM side and nowhere else. Offering
                it here would be offering to leave the mode. */}
            {!player && <NewCampaign onCreated={reload} />}
            {memberships.length === 0 ? (
              player ? (
                // Two states behind one card, and neither can be told apart
                // from here without a second read: nobody has invited you, or
                // the DM of a table you joined has not shared it — a player
                // member of an unshared campaign reads nothing, which is the
                // master toggle working rather than a gap. So the copy covers
                // both rather than guessing at one.
                <EmptyState icon="user" title="No table yet">
                  Follow the link somebody sends you and their table appears here. A table you have
                  already joined shows up once its DM shares it.
                </EmptyState>
              ) : (
                <EmptyState icon="book-open" title="No campaigns yet">
                  Name the one you are running and it opens above. Tables you have been invited to
                  are on the player side.
                </EmptyState>
              )
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2">
                {memberships.map((membership) => (
                  <CampaignRow
                    key={membership.campaign.id}
                    membership={membership}
                    // A fact about the row rather than about the mode: only the
                    // DM of a table may shelve it, and `campaignWritable` is
                    // what refuses anyone else. Reading the role here means a
                    // player never sees the control even if this list ever
                    // carries a mixed set again.
                    onArchive={
                      membership.role === "dm" ? () => setArchiving(membership) : undefined
                    }
                  />
                ))}
              </div>
            )}
            {/* The way back, and deliberately the quietest thing on the page:
                somebody who has archived nothing should barely notice it. It is
                the DM's shelf, so it is absent on the player side — and it
                requests nothing until it is opened. */}
            {!player && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground"
                onClick={() => setShelfOpen(true)}
              >
                <Icon name="history" size={14} />
                Archived campaigns
              </Button>
            )}
          </>
        )}
      </div>

      {archiving !== undefined && (
        <ArchiveDialog
          campaign={archiving.campaign}
          onClose={() => setArchiving(undefined)}
          onArchived={() => {
            setArchiving(undefined);
            reload();
          }}
        />
      )}
      {shelfOpen && <ArchivedDialog onClose={() => setShelfOpen(false)} onRestored={reload} />}
    </AppShell>
  );
}
