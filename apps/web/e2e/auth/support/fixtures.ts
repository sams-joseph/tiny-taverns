import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { clerkKeys, UNCONFIGURED, USERS, type Who } from "./clerk";

export { expect };

/**
 * Signs `who` in through Clerk, in the app, and leaves the page on `/`.
 *
 * The testing token is set up before the first navigation so every Frontend
 * API request carries it (it is what lets an automated browser past the
 * instance's bot protection). Then the email-code strategy: `+clerk_test`
 * addresses accept `424242` and nothing is mailed. It signs in the same way
 * Clerk's own sign-in card does, through `window.Clerk`, and the app sees an
 * ordinary session.
 */
export const signIn = async (page: Page, who: Who): Promise<void> => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, signInParams: { strategy: "email_code", identifier: USERS[who] } });
};

/**
 * Every test in the suite skips, saying why, when the Clerk keys are not in
 * the environment: a fork's CI, or a developer without the keys file.
 */
export const test = base.extend<{ configured: void }>({
  configured: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      testInfo.skip(clerkKeys() === undefined, UNCONFIGURED);
      await use();
    },
    { auto: true },
  ],
});

/**
 * The name the API server gives the signed-in account: the session's `name`
 * claim when the instance's session token carries one (Clerk dashboard →
 * Sessions → Customize session token), and otherwise the server's default,
 * `DEFAULT_ACCOUNT_NAME` in `apps/server/src/Accounts.ts`.
 */
export const accountName = async (page: Page): Promise<string> => {
  await clerk.loaded({ page });
  const claimed = await page.evaluate(async () => {
    const token = await window.Clerk.session?.getToken();
    if (token === undefined || token === null) return undefined;
    const payload = token.split(".")[1] ?? "";
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      name?: unknown;
    };
    return typeof claims.name === "string" ? claims.name.trim() : undefined;
  });
  return claimed === undefined || claimed === "" ? "Someone" : claimed;
};
