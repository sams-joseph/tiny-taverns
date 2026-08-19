import type { Campaign, CampaignInvite, InviteStatus } from "@taverns/api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { useApiResource } from "../api/resource";
import { dayOf } from "../chronicle/format";
import { useRouter, type RegisteredRouter } from "@tanstack/react-router";
import { Field, SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/**
 * Inviting somebody to the table, and taking it back.
 *
 * **The link is shown exactly once**, because the server keeps only a digest of
 * the token — so this dialog has one state a form usually does not: a freshly
 * minted invitation whose link is on screen and will never be on screen again.
 * It says so in as many words, and the link stays up until the DM closes the
 * dialog or mints another.
 *
 * ### What it renders about a credential, and why each part is there
 *
 * The list is the revoke list, and it is legible because each line carries the
 * three things a DM needs to decide: the label they typed, the state
 * (`live` / `redeemed` / `revoked` / `expired`, decided by the server so it does
 * not depend on the browser's clock), and — once somebody has taken it — **who
 * did**. That last one is the whole answer to "what happens if a link is
 * forwarded to somebody I did not mean": they get in, the DM sees the name, and
 * one press takes it back.
 *
 * ### Revoking is one act with one meaning
 *
 * *Withdraw* withdraws the invitation, and if it has already been accepted it
 * revokes the membership it granted. A button that withdrew a spent invitation
 * and left the person at the table would do nothing at all, which is worse than
 * no button — so the row says which of the two is about to happen rather than
 * leaving it to be discovered.
 */

/**
 * The one place a status becomes words, and the badge that carries it.
 *
 * The status itself is the server's — `repo/Invites.ts` derives it, so
 * "expired" is decided by the database's clock rather than by whatever the
 * browser thinks the time is. Nothing here recomputes it from the timestamps.
 */
const STATUS: Record<
  InviteStatus,
  { readonly label: string; readonly variant: "info" | "secondary" | "outline" }
> = {
  live: { label: "Waiting", variant: "info" },
  redeemed: { label: "Taken", variant: "secondary" },
  revoked: { label: "Withdrawn", variant: "outline" },
  expired: { label: "Ran out", variant: "outline" },
};

/**
 * The line under each invitation, in the server's own order of precedence.
 *
 * **Withdrawn is asked first, exactly as `statusOf` asks it first.** A line that
 * checked "was it taken" before "was it withdrawn" reads *"Taken by Ilse.
 * Removing it takes their seat back"* on a row whose seat is already gone —
 * which is the one sentence here that could make a DM think a revoke had not
 * worked. Measured in a browser against a real revoked-after-accepted row,
 * which is the only state that shows it.
 */
const sentenceFor = (invite: CampaignInvite): string => {
  if (invite.status === "revoked") {
    return invite.redeemedByName === null
      ? "Withdrawn. The link it carried is inert."
      : `Withdrawn. ${invite.redeemedByName} no longer reaches this table.`;
  }
  if (invite.status === "redeemed") {
    return `Taken by ${invite.redeemedByName ?? "somebody"}. Removing it takes their seat back.`;
  }
  if (invite.status === "expired") return `Ran out on ${dayOf(invite.expiresAt)}. Make another.`;
  return `Good until ${dayOf(invite.expiresAt)}, and only once.`;
};

/**
 * The whole link, composed here because only the browser knows where it is.
 *
 * The router builds everything after the origin — the path, and the token in
 * the fragment — so the one place an invitation link is written down cannot
 * spell the route slightly differently from the route that reads it. **The
 * token is in the fragment and that is the point**: a browser never sends a
 * fragment to a server, so this link can be pasted, opened and followed
 * without the secret reaching an access log. See `routes.tsx`.
 *
 * ### It has to survive being hosted under a subpath
 *
 * A DM copies this link out of the product and into a chat, so it is the one
 * URL here that is read somewhere the app is not already running — nothing
 * else re-resolves it, and a wrong one 404s at a stranger's first screen. So
 * it is **resolved against the page's own URL** rather than glued to
 * `location.origin`: served from `example.com/taverns/` the link keeps the
 * `/taverns/` prefix, and served from a root it is unchanged. `new URL`
 * resolves whichever shape `createHref` hands back — an absolute path today,
 * a bare `#…` fragment if it ever changes — against the same base a browser
 * would use for the equivalent `<a href>`, which is exactly the question being
 * asked. `campaign/invites.test.tsx` pins both hosting shapes.
 */
const linkFor = (router: RegisteredRouter, token: string): string => {
  const { publicHref } = router.buildLocation({ to: "/join/$token", params: { token } });
  // `history.createHref`, **not** `buildLocation(…).href`. The latter is the
  // route as the router thinks of it — `/join/<token>` — and pasting that after
  // an origin would put the secret in the *path*, where every log and every
  // `Referer` would carry it. `createHref` is what turns a route into the URL
  // this app is actually reachable at, which on a hash history means the page's
  // own path and the route behind a `#`. It is the same call `Link` makes, so
  // this link and every rendered one cannot disagree.
  const href = router.history.createHref(publicHref);
  return new URL(href, globalThis.location.href).toString();
};

function InviteRow({
  invite,
  onRevoked,
}: {
  readonly invite: CampaignInvite;
  readonly onRevoked: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const status = STATUS[invite.status];
  const gone = invite.status === "revoked" || invite.status === "expired";

  const withdraw = async () => {
    const revoked = await submit((client) =>
      client.invites.revoke({
        params: { campaignId: invite.campaignId, inviteId: invite.id },
        payload: {},
      }),
    );
    if (Result.isSuccess(revoked)) onRevoked();
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
          {invite.label === "" ? "Unnamed invitation" : invite.label}
        </span>
        <Badge variant={status.variant}>{status.label}</Badge>
        {!gone && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void withdraw()}>
            <Icon name="x" size={14} />
            {invite.status === "redeemed" ? "Remove" : "Withdraw"}
          </Button>
        )}
      </div>
      <span className="text-caption leading-body text-muted-foreground">{sentenceFor(invite)}</span>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

export function InviteDialog({
  campaign,
  onClose,
  onChanged,
}: {
  readonly campaign: Campaign;
  readonly onClose: () => void;
  /** Re-reads the campaign view: a revoke can change who is at the table. */
  readonly onChanged: () => void;
}) {
  const campaignId = campaign.id;
  const load = useCallback(
    (client: TavernsClient) => client.invites.list({ params: { campaignId } }),
    [campaignId],
  );
  const [resource, reload] = useApiResource(load);
  const router = useRouter();
  const { busy, failure, submit } = useMutation();
  const [label, setLabel] = useState("");
  /** The one appearance of a plaintext token, kept until the dialog moves on. */
  const [link, setLink] = useState<string | undefined>();

  const mint = async () => {
    const issued = await submit((client) =>
      client.invites.create({ params: { campaignId }, payload: { label: label.trim() } }),
    );
    if (Result.isSuccess(issued)) {
      setLink(linkFor(router, issued.success.token));
      setLabel("");
      reload();
    }
  };

  const revoked = () => {
    reload();
    onChanged();
  };

  const invites = resource.state === "ready" ? resource.value : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Invite a player">
        <DialogHeader>
          <DialogTitle>Invite a player</DialogTitle>
          <DialogDescription>
            A link is an invitation to join, not a way in — whoever follows it signs in first, and
            what they get is a seat at this table.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <div className="flex flex-col gap-3">
            <Field
              label="Who is it for?"
              htmlFor="invite-label"
              hint="Optional, and only you ever see it. It is what makes this list readable in a month."
            >
              <Input
                id="invite-label"
                placeholder="Ilse"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <Button size="sm" className="self-start" disabled={busy} onClick={() => void mint()}>
              <Icon name="plus" size={14} />
              {busy ? "Making one…" : "Make a link"}
            </Button>
            {failure !== undefined && <SaveFailure failure={failure} />}
          </div>

          {/* Shown once, and said out loud. The server stores a digest, so
              there is no read that could show it again — a DM who closes this
              without copying it makes another, which costs nothing. */}
          {link !== undefined && (
            <div className="flex flex-col gap-1.5 rounded-control border border-accent bg-surface-sunken px-3 py-2.5">
              <span className="text-caption leading-body font-semibold text-heading">
                Copy this now — it is shown once
              </span>
              <code className="font-mono text-mono break-all text-slate-300">{link}</code>
              <span className="text-caption leading-body text-muted-foreground">
                Send it however you already talk to each other. It works for one person, once.
              </span>
            </div>
          )}

          <div className="flex flex-col">
            <span className="pb-1 text-label leading-snug font-semibold text-heading">
              Invitations
            </span>
            {resource.state === "loading" && <Loading label="Reading your invitations…" />}
            {resource.state === "failed" && (
              <FailureNotice failure={resource.failure} onRetry={reload} />
            )}
            {invites !== undefined &&
              (invites.length === 0 ? (
                <span className="py-3 text-body-s leading-body text-muted-foreground">
                  None yet. A link made above lands here, so you can see who took it and take it
                  back.
                </span>
              ) : (
                invites.map((invite) => (
                  <InviteRow key={invite.id} invite={invite} onRevoked={revoked} />
                ))
              ))}
          </div>

          {campaign.visibility !== "shared" && (
            // The master toggle, named where it matters: a player who joins an
            // unshared campaign can read nothing in it, so an invitation sent
            // before it is shared lands somebody on a blank page. The control
            // for it is one button away, in this screen's own top bar.
            <p className="text-caption leading-body text-muted-foreground">
              This campaign is <span className="text-heading">Private</span>, so anyone who joins
              sees nothing in it until you share it.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
