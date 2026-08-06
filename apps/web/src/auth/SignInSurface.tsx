import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import type { ReactNode } from "react";
import { publishableKey } from "./config";
import { useHostedSession } from "./hostedSession";

/**
 * Sign in, sign up, and the account menu — Clerk's own prefabricated
 * components, mounted as they ship.
 *
 * **These are deliberately unthemed, and that is a decision rather than an
 * omission.** Clerk's components carry Clerk's own styling, while Tiny Taverns
 * is dark-only by construction and its Tailwind theme deletes the default
 * palettes outright, so this chrome looks visibly foreign against the rest of
 * the product — on the first screen every user sees. The captain accepted that
 * cost explicitly, as a "for now", because the designers have not drawn a
 * sign-in screen and inventing one is not an engineer's call to make.
 *
 * The upgrade path is Clerk's `appearance` prop, pointed at the design tokens
 * that already exist in `packages/design-system/tokens/*.css`. That is a
 * bounded styling job against real tokens, not a rebuild — do not reach for
 * `@taverns/ui` primitives and Clerk's headless hooks instead.
 *
 * `mode="modal"` because this app has no router to redirect to.
 */
export function SignInSurface(): ReactNode {
  const { configured } = useHostedSession();

  // No publishable key: the surface is not offered at all, rather than
  // offered and broken. Returning before any Clerk component is rendered is
  // what keeps the app runnable with no vendor configured — `Show` and the
  // buttons all require `ClerkProvider` above them, which is not mounted.
  //
  // Both conditions, not just the context flag. `AuthProvider` mounts
  // `ClerkProvider` on exactly the second one, so this is the same question
  // asked at the point of use: the vendor's chrome may only mount where the
  // vendor's provider did. It is what makes this component safe to hang in the
  // shared `TopBar`, where every screen renders it and any screen's test could
  // otherwise be the one that discovers Clerk is missing above it.
  if (!configured || publishableKey() === undefined) {
    return null;
  }

  return (
    // Core 3 replaced `SignedIn`/`SignedOut`/`Protect` with this single
    // component. It renders `null` while auth is still loading, so neither
    // branch flashes on a slow connection.
    <Show
      when="signed-in"
      fallback={
        <div className="flex items-center gap-3">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </div>
      }
    >
      <UserButton />
    </Show>
  );
}
