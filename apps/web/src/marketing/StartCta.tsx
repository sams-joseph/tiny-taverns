import { SignUpButton } from "@clerk/react";
import { Button } from "@taverns/ui";
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
 * provider's sign-up and nothing else.
 *
 * ### Where there is no sign-up to open
 *
 * The running app always has one: Clerk is a prerequisite, and with no
 * publishable key `AuthProvider` shows its setup notice instead of this page.
 * A render with no vendor provider above it (a screen test) draws no button at
 * all rather than one that opens nothing — every Clerk component throws
 * without `ClerkProvider`.
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
  if (!configured || publishableKey() === undefined) return null;

  return (
    <SignUpButton mode="modal">
      <Button size={size} className={className}>
        Start a campaign
      </Button>
    </SignUpButton>
  );
}

/**
 * The sentence under the button, beside it so the two appear and disappear
 * together.
 */
export function StartCtaNote(): ReactNode {
  const { configured } = useHostedSession();

  if (!configured || publishableKey() === undefined) return null;

  return <>Your account, your campaigns. Nothing is summarised away.</>;
}
