import type { InviteRedeemed } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
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
          You are at {redeemed.campaignName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {redeemed.shared ? (
          <>
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              Whatever the DM has shared is yours to read. Everything else stays theirs.
            </p>
            <Button
              nativeButton={false}
              // The player's screen, never the DM's. Redeeming an invitation
              // mints a `player` membership and nothing else, and the DM's
              // campaign screen composes `runs.list` — behind the `DmActor`
              // gate — so this link used to hand a brand new player a 404 on
              // the very first thing they pressed.
              render={
                <Link
                  to="/play/campaigns/$campaignId"
                  params={{ campaignId: redeemed.campaignId }}
                />
              }
            >
              Open {redeemed.campaignName}
              <Icon name="chevron-right" size={15} />
            </Button>
          </>
        ) : (
          <>
            {/* Not a failure, and it must not read as one: the DM simply has
                not opened the table yet. Saying so here is the difference
                between "they have not shared it" and "this is broken", and it
                is the only place anybody is looking at the moment it matters. */}
            <p className="max-w-measure text-body-s leading-body text-muted-foreground">
              The DM has not shared this table yet, so there is nothing to read in it. Your seat is
              kept — it fills in the moment they share it.
            </p>
            <Button variant="secondary" nativeButton={false} render={<Link to="/play" />}>
              Your tables
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
  apiAtom((client) => client.invitePreview.read({ payload: { token } })),
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
    const result = await submit((client) => client.join.redeem({ payload: { token } }));
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
              <CardTitle>{preview.campaignName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="max-w-measure text-body-s leading-body text-muted-foreground">
                <span className="text-heading">{preview.dmName}</span> has invited you to play at
                this table. Taking the seat gives you whatever they choose to share — the party, the
                read-aloud text, the record of what happened — and nothing else.
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
