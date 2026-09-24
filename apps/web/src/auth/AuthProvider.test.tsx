import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { publishableKey } from "./config";
import { NO_HOSTED_SESSION } from "./hostedSession";

/**
 * Clerk is a prerequisite: with no publishable key the app is a notice saying
 * what to configure, not the app with a sign-in that cannot open and not a
 * token form.
 *
 * The key is pinned empty for the whole test run by `vite.config.ts`, so this
 * file says the same thing on a machine with Clerk configured as on one
 * without. Mounting `ClerkProvider` in jsdom would reach for Clerk's script
 * over the network, so the configured branch is the authenticated Playwright
 * suite's (`e2e/auth/`).
 */
describe("AuthProvider with no publishable key", () => {
  it("renders the setup notice in place of the app", () => {
    render(
      <AuthProvider>
        <p>the app</p>
      </AuthProvider>,
    );

    expect(screen.queryByText("the app")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in is not configured");
    expect(screen.getByText("VITE_CLERK_PUBLISHABLE_KEY")).toBeInTheDocument();
  });

  it("offers no token in its place", () => {
    render(
      <AuthProvider>
        <p>the app</p>
      </AuthProvider>,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/token/i)).toBeNull();
  });

  it("leaves an unprovided session with no token", async () => {
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
