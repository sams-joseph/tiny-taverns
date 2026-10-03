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

/**
 * Calls the API server as whoever `page` is signed in as, with that session's
 * own token, for the setup a test is not about (a night, a fight). The server
 * port is the one the config picked (`E2E_AUTH_API_PORT`); a request that is
 * not answered with a 2xx fails the test with what the server said.
 */
export const api = async <A = unknown>(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
  data?: unknown,
): Promise<A> => {
  await clerk.loaded({ page });
  const token = await page.evaluate(async () => (await window.Clerk.session?.getToken()) ?? "");
  const response = await page.request.fetch(
    `http://127.0.0.1:${String(process.env.E2E_AUTH_API_PORT)}${path}`,
    {
      method,
      headers: { authorization: `Bearer ${token}` },
      ...(data === undefined ? {} : { data }),
    },
  );
  if (!response.ok())
    throw new Error(
      `${method} ${path} answered ${String(response.status())}: ${await response.text()}`,
    );
  return (await response.json()) as A;
};

/** The status a call as `page`'s account is answered with, for a refusal a test asserts. */
export const apiStatus = async (page: Page, path: string): Promise<number> => {
  await clerk.loaded({ page });
  const token = await page.evaluate(async () => (await window.Clerk.session?.getToken()) ?? "");
  const response = await page.request.get(
    `http://127.0.0.1:${String(process.env.E2E_AUTH_API_PORT)}${path}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  return response.status();
};
