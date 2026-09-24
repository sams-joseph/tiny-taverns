import { FailureNotice } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * What the app is when no publishable key is configured.
 *
 * Clerk is a prerequisite for running Tiny Taverns: the browser signs in
 * through it and has no other way in. Rather than a sign-in that cannot open or
 * a token form, the whole app is this one notice saying what to set. It renders
 * outside the router and the atom registry (`AuthProvider` returns it in place
 * of both), so it can link nowhere and load nothing.
 */
export function ClerkRequired(): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-measure">
        <FailureNotice icon="lock" title="Sign-in is not configured">
          Tiny Taverns signs everyone in through Clerk. Set{" "}
          <code className="font-mono text-mono text-slate-300">VITE_CLERK_PUBLISHABLE_KEY</code> in{" "}
          <code className="font-mono text-mono text-slate-300">apps/web/.env.local</code> and{" "}
          <code className="font-mono text-mono text-slate-300">CLERK_JWT_KEY</code> in{" "}
          <code className="font-mono text-mono text-slate-300">apps/server/.env.local</code>, then
          restart both. The README has the steps.
        </FailureNotice>
      </div>
    </main>
  );
}
