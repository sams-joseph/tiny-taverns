import { render } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { HostedSessionScope } from "./AuthProvider";
import { fetchCredential } from "./credential";
import type { HostedSession } from "./hostedSession";

/**
 * The credential slot `api/atoms.ts` reads outside React, as the scopes that
 * publish into it mount, nest and unmount.
 *
 * Under `StrictMode` because `main.tsx` renders there: development unmounts
 * and remounts every scope once without rendering it again, and a slot that is
 * only forgotten on unmount stayed empty, so every request went out with no
 * bearer.
 */

const signedIn = (token: string): HostedSession => ({
  configured: false,
  signedIn: true,
  loading: false,
  fetchToken: () => Promise.resolve(token),
});

const strict = (tree: ReactNode): ReactNode => <StrictMode>{tree}</StrictMode>;

describe("fetchCredential", () => {
  it("resolves the scope's token after a StrictMode mount", async () => {
    render(strict(<HostedSessionScope session={signedIn("mounted")}>app</HostedSessionScope>));

    await expect(fetchCredential()).resolves.toBe("mounted");
  });

  it("resolves nothing once the scope has unmounted", async () => {
    const { unmount } = render(
      strict(<HostedSessionScope session={signedIn("gone")}>app</HostedSessionScope>),
    );
    unmount();

    await expect(fetchCredential()).resolves.toBeUndefined();
  });

  it("follows the scope's session when it changes", async () => {
    const { rerender } = render(
      strict(<HostedSessionScope session={signedIn("first")}>app</HostedSessionScope>),
    );
    rerender(strict(<HostedSessionScope session={signedIn("second")}>app</HostedSessionScope>));

    await expect(fetchCredential()).resolves.toBe("second");
  });
});

describe("fetchCredential with nested scopes", () => {
  const nested = (outer: HostedSession, inner?: HostedSession): ReactNode =>
    strict(
      <HostedSessionScope session={outer}>
        {inner === undefined ? "app" : <HostedSessionScope session={inner}>app</HostedSessionScope>}
      </HostedSessionScope>,
    );

  it("resolves the inner scope's token, as the context does", async () => {
    render(nested(signedIn("outer"), signedIn("inner")));

    await expect(fetchCredential()).resolves.toBe("inner");
  });

  it("keeps the inner scope's token when only the outer scope re-renders", async () => {
    // One element, so React bails out of the inner scope and renders the outer alone.
    const inner = <HostedSessionScope session={signedIn("inner")}>app</HostedSessionScope>;
    const { rerender } = render(
      strict(<HostedSessionScope session={signedIn("outer")}>{inner}</HostedSessionScope>),
    );
    rerender(
      strict(<HostedSessionScope session={signedIn("outer, again")}>{inner}</HostedSessionScope>),
    );

    await expect(fetchCredential()).resolves.toBe("inner");
  });

  it("falls back to the outer scope's token when the inner one unmounts", async () => {
    const outer = signedIn("outer");
    const { rerender } = render(nested(outer, signedIn("inner")));
    rerender(nested(outer));

    await expect(fetchCredential()).resolves.toBe("outer");
  });
});
