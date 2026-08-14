import { SignUpButton } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { Button, Icon } from "@taverns/ui";
import type { ReactNode } from "react";
import { publishableKey } from "../auth/config";
import { useHostedSession } from "../auth/hostedSession";

/**
 * The homepage's call to action — and the one place the drawn page had to
 * change shape rather than lose a section.
 *
 * `ui_kits/marketing/Site.jsx` draws an email box that swaps to *"check your
 * email — the link is on its way"*. Neither half is true here: there is no
 * mailing list, no magic link, and no account of ours to create. **Accounts
 * come from the hosted identity provider**, so the call to action is that
 * provider's sign-up and nothing else. See `AGENTS.md`, "Authentication: two
 * credential kinds, one seam".
 *
 * ### What it does when there is no sign-up to open
 *
 * Hosted sign-in is **opt-in**, exactly as it is on the server, and is normally
 * unconfigured in development (`auth/AuthProvider.tsx`). `SignInSurface`
 * answers that by rendering nothing at all — right for a header, wrong for the
 * one button a whole page is built around: a marketing page whose call to
 * action is missing reads as broken, and a button that opens nothing is the
 * same lie as a stubbed field.
 *
 * So the button changes destination rather than disappearing, and it points at
 * **the other credential this product genuinely has**: the machine token, which
 * `api/ServerPanel.tsx` mints and pastes, and which `auth/credential.ts`
 * resolves for every call. That is a real, working way in — and it is the *only*
 * one on a build with no publishable key, which is precisely the build where
 * this branch renders.
 *
 * It also closes a circle the gate would otherwise draw. The signed-out gate
 * shows this page whenever there is neither credential; if the button led
 * nowhere, a developer with no Clerk key and no token pasted yet could not
 * reach the panel that issues one. The gallery is exempt from the gate for that
 * reason (`SignedOutGate.tsx`), and this is what sends them there.
 */
export function StartCta({
  size = "default",
  className,
}: {
  readonly size?: "sm" | "default" | "lg";
  readonly className?: string;
}): ReactNode {
  const { configured } = useHostedSession();

  // Both conditions, for the reason `SignInSurface` asks both: `AuthProvider`
  // mounts `ClerkProvider` on the key alone, and every Clerk component throws
  // without it. Asking the same question at the point of use is what keeps this
  // component safe to render on a page that has no vendor above it.
  if (configured && publishableKey() !== undefined) {
    return (
      <SignUpButton mode="modal">
        <Button size={size} className={className}>
          Start a campaign
        </Button>
      </SignUpButton>
    );
  }

  return (
    <Button
      size={size}
      className={className}
      nativeButton={false}
      // `hash="server"` is `ServerPanel`'s own section, reached the way the
      // gallery's specimen nav reaches it — never a bare `href="#server"`,
      // which under a hash history replaces the route instead of scrolling
      // within it. Measured: the scroll lands imprecisely on a cold load,
      // because the gallery is long and grows under the restoration as its
      // specimens paint. That is the gallery's own behaviour and not something
      // this button can fix, so the sentence under it names the way there too.
      render={<Link to="/gallery" hash="server" />}
    >
      Set up a developer token
      <Icon name="arrow-right" size={16} />
    </Button>
  );
}

/**
 * The sentence under the button, which has to say something different in each
 * of the two states because the button does something different.
 *
 * Kept beside the button rather than written out at each of its call sites: the
 * two must agree, and there are two places on this page that offer to start.
 */
export function StartCtaNote(): ReactNode {
  const { configured } = useHostedSession();

  if (configured && publishableKey() !== undefined) {
    return <>Your account, your campaigns. Nothing is summarised away.</>;
  }

  // The same sentence `join/JoinScreen.tsx` gives a stranger who arrives with
  // no way to sign in, and deliberately the same wording: one instruction, in
  // one form, wherever the reader meets it.
  return (
    <>
      Hosted sign-in is not configured on this build, so the way in is a machine token — Components
      &rarr; Server.
    </>
  );
}
