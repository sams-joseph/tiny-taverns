import type { InviteRedeemed } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { readMachineToken } from "../auth/credential";
import { useHostedSession } from "../auth/hostedSession";
import { publishableKey } from "../auth/config";
import { SignInSurface } from "../auth/SignInSurface";
import { dayOf } from "../chronicle/format";
import { AppShell, TopBar } from "../shell/AppShell";
import { FailureNotice, Loading } from "../ui/states";
import { SaveFailure } from "../ui/form";

/**
 * Following an invitation — **the first screen a stranger sees of this
 * product.**
 *
 * The plan names the friction this exists to soften: between a friend at the
 * table and the read-aloud text there is now an account-creation step, and the
 * one concrete thing engineering can do about it is *make the invitation page
 * work before sign-in*. So this page reads the campaign's name and the DM's
 * from a token that grants nothing, says what signing in gets you, and only
 * then shows the vendor's card.
 *
 * Three things about it are decisions rather than layout.
 *
 * **The token never leaves the fragment except in a `POST` body.** `routes.ts`
 * says why: a browser does not send a fragment to a server, so the secret stays
 * out of access logs and out of the `Referer` of anything this page links to.
 * Nothing here puts it in a query string, and nothing renders it.
 *
 * **Every refusal reads the same, because the server answers the same.** An
 * expired, withdrawn, already-accepted or invented token is one `NotFound` — a
 * page that distinguished them would be disclosing which kind of dead a dead
 * token is. One sentence covers all four, and it says what to do.
 *
 * **The ordinary outcome of joining is a campaign with nothing in it.** A
 * campaign starts `dm`, and `campaignReadable` still requires `shared` for a
 * player — so the moment to explain that is the moment of joining, which is why
 * `InviteRedeemed` carries `shared` and why the success panel below branches on
 * it rather than sending everyone to a page that may be empty.
 */

/** What a person is told once they are in. */
function Joined({ redeemed }: { readonly redeemed: InviteRedeemed }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon name="circle-check" size={18} className="text-accent" />
          You are in {redeemed.groupName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {redeemed.campaignId !== null && redeemed.shared ? (
          <>
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              The invitation also seats you at {redeemed.campaignName ?? "a table"}. Whatever its
              creator has shared is yours to read; everything else stays theirs.
            </p>
            <Button
              nativeButton={false}
              // The same URL its creator uses — what it renders is decided by
              // the relation, so a brand new player lands on the projection
              // that works rather than on a 404.
              render={
                <Link to="/campaigns/$campaignId" params={{ campaignId: redeemed.campaignId }} />
              }
            >
              Open {redeemed.campaignName ?? "the table"}
              <Icon name="chevron-right" size={15} />
            </Button>
          </>
        ) : redeemed.campaignId !== null ? (
          <>
            {/* Not a failure, and it must not read as one: the creator simply
                has not opened the table yet. Saying so here is the difference
                between "they have not shared it" and "this is broken". */}
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              Your seat at {redeemed.campaignName ?? "the table"} is kept, and it fills in the
              moment its creator shares the campaign. The group is yours to see now.
            </p>
            <Button variant="secondary" nativeButton={false} render={<Link to="/groups" />}>
              Your groups
              <Icon name="chevron-right" size={15} />
            </Button>
          </>
        ) : (
          <>
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              You are a member now: the group’s campaigns and shared history are yours to see, and a
              campaign’s own content follows when its creator seats you at it.
            </p>
            <Button variant="secondary" nativeButton={false} render={<Link to="/groups" />}>
              Your groups
              <Icon name="chevron-right" size={15} />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The invitation behind a link, keyed on the token.
 *
 * The one read in the product made with no credential at all — `invitePreview`
 * is unauthenticated by design, because it answers before its reader has an
 * account. The token is the key as well as the payload, which is right: two
 * links are two invitations.
 */
const previewAtom = Atom.family((token: string) =>
  // **It names no reads, and that is a real answer rather than an omission.**
  // Nothing in the product writes an invitation this reader can reach — the DM
  // who minted it is a different account in a different browser — so there is
  // no resource here for a write to invalidate.
  apiAtom((client) => client.invitePreview.read({ payload: { token } }), []),
);

export function JoinScreen() {
  const { token } = useParams({ from: "/join/$token" });
  const [resource, reload] = useApiAtom(previewAtom(token));
  const { signedIn } = useHostedSession();
  const { busy, failure, submit } = useMutation();
  const [redeemed, setRedeemed] = useState<InviteRedeemed | undefined>();

  // Both credential kinds, the same pair `auth/credential.ts` resolves per call
  // — a hosted session when there is one, otherwise the machine token the
  // Server panel wrote. A developer with no Clerk key can still follow a link.
  const credentialled = signedIn || readMachineToken() !== "";
  const hostedAvailable = publishableKey() !== undefined;

  const join = async () => {
    // The tables this account sits at, which is the whole of what joining
    // changes for the person doing it. The DM's invitation list moves too, and
    // is deliberately not named: it is a different account in a different
    // browser, and nothing here can reach it.
    const result = await submit(
      (client) => client.join.redeem({ payload: { token } }),
      [reads.myCampaigns],
    );
    if (Result.isSuccess(result)) setRedeemed(result.success);
  };

  const preview = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      topBar={<TopBar title="An invitation" subtitle="Somebody has asked you to their table." />}
    >
      <div className="flex max-w-3xl flex-col gap-6">
        {resource.state === "loading" && <Loading label="Reading the invitation…" />}

        {/* One sentence for every dead token, because the server gives one
            answer for all of them. `FailureNotice`'s `missing` copy is about a
            row; this is about a link, and the difference is worth the words. */}
        {resource.state === "failed" && resource.failure.kind === "missing" && (
          <Card tone="sunken" className="items-center gap-3 px-card py-11 text-center">
            <Icon name="eye-off" size={28} className="text-faint" />
            <p
              role="alert"
              className="font-display text-subtitle leading-snug font-semibold text-heading"
            >
              This invitation is no longer good
            </p>
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              It has been used, withdrawn, or has run out of time. Ask whoever sent it for a fresh
              one — they take a moment to make.
            </p>
          </Card>
        )}
        {resource.state === "failed" && resource.failure.kind !== "missing" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}

        {preview !== undefined && redeemed === undefined && (
          <Card>
            <CardHeader>
              <CardTitle>{preview.campaignName ?? preview.groupName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="max-w-measure text-body-s leading-body text-muted-foreground">
                <span className="text-heading">{preview.ownerName}</span> has invited you to join{" "}
                {preview.campaignName === null
                  ? `${preview.groupName} — the group their campaigns and shared history live in.`
                  : `${preview.groupName}, with a seat at ${preview.campaignName}. Taking it gives you whatever its creator chooses to share — and nothing else.`}
              </p>
              <p className="flex items-center gap-1.5 text-caption leading-body text-faint">
                <Icon name="clock" size={14} />
                This invitation is good until {dayOf(preview.expiresAt)}, and only once.
              </p>

              {credentialled ? (
                <Button disabled={busy} onClick={() => void join()}>
                  {busy ? "Taking your seat…" : "Take your seat"}
                </Button>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="max-w-measure text-body-s leading-body text-muted-foreground">
                    {hostedAvailable
                      ? "Sign in, or make an account — it takes a moment, and it is what the seat is kept under."
                      : "Hosted sign-in is not configured here, so take a machine token from Components → Server first."}
                  </p>
                  {/* Clerk's own chrome, unthemed on purpose — `SignInSurface`
                      says why at length, and this page is exactly the audience
                      that decision is now load-bearing for. It renders nothing
                      at all when no publishable key is configured, which is what
                      keeps this page working for a developer who has none. */}
                  <SignInSurface />
                </div>
              )}

              {failure !== undefined && <SaveFailure failure={failure} />}
            </CardContent>
          </Card>
        )}

        {redeemed !== undefined && <Joined redeemed={redeemed} />}
      </div>
    </AppShell>
  );
}
