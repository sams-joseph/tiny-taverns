import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { publishableKey } from "./config";
import { NO_HOSTED_SESSION, useHostedSession } from "./hostedSession";

/**
 * The property under test is the one that keeps this dependency opt-in: with
 * no publishable key the app renders, and every consumer sees "no hosted
 * session" rather than a crash or a hard `throw` at startup.
 *
 * The key is pinned empty for the whole test run by `vite.config.ts`, so this
 * file says the same thing on a machine with Clerk configured as on one
 * without. Mounting `ClerkProvider` in jsdom would reach for Clerk's script
 * over the network and make this file require a vendor account to run —
 * precisely the mode these tests exist to protect. The *decision* is tested
 * instead, at the one place it is made.
 */
function Probe() {
  const { configured, signedIn } = useHostedSession();
  return <span>{`configured=${String(configured)} signedIn=${String(signedIn)}`}</span>;
}

describe("AuthProvider with no publishable key", () => {
  it("renders its children rather than throwing", () => {
    render(
      <AuthProvider>
        <p>the gallery</p>
      </AuthProvider>,
    );

    expect(screen.getByText("the gallery")).toBeInTheDocument();
  });

  it("leaves consumers on the unconfigured session", () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText("configured=false signedIn=false")).toBeInTheDocument();
  });

  it("offers no token", async () => {
    await expect(NO_HOSTED_SESSION.fetchToken()).resolves.toBeUndefined();
  });
});

describe("publishableKey", () => {
  it("is undefined when the variable carries no value", () => {
    expect(publishableKey()).toBeUndefined();
  });

  it("reads VITE_CLERK_PUBLISHABLE_KEY", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    expect(publishableKey()).toBe("pk_test_example");
    vi.unstubAllEnvs();
  });

  it("treats an empty value as unset, so a blank line in an env file is not a key", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    expect(publishableKey()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
