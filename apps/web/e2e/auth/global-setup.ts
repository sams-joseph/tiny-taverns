import { clerkSetup } from "@clerk/testing/playwright";
import { fileURLToPath } from "node:url";
import {
  assertDevelopmentKeys,
  assertUsersExist,
  clerkKeys,
  jwtPublicKey,
  UNCONFIGURED,
} from "./support/clerk";
import { startStack } from "./support/stack";

/**
 * Fetches a Clerk testing token, checks the test users exist, and starts the
 * stack. Global setup rather than `webServer`, because the API server's
 * database and verification key have to exist before it boots and Playwright
 * starts `webServer` entries before global setup runs.
 *
 * `clerkSetup` puts `CLERK_FAPI` and `CLERK_TESTING_TOKEN` in this process's
 * environment, which the workers inherit; `setupClerkTestingToken` reads them.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | void> {
  const keys = clerkKeys();
  if (keys === undefined) {
    console.log(UNCONFIGURED);
    return;
  }
  assertDevelopmentKeys(keys);

  // `dotenv: false`: the keys come from the environment the suite was started
  // in, never from whatever `.env.local` happens to sit in the working directory.
  await clerkSetup({
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
    dotenv: false,
  });
  await assertUsersExist(keys.secretKey);

  const frontendApi = process.env.CLERK_FAPI;
  if (frontendApi === undefined) throw new Error("clerkSetup did not name the Frontend API.");

  return startStack({
    apiPort: Number(process.env.E2E_AUTH_API_PORT),
    webPort: Number(process.env.E2E_AUTH_WEB_PORT),
    jwtKey: await jwtPublicKey(frontendApi),
    publishableKey: keys.publishableKey,
    logDir: fileURLToPath(new URL("../../test-results-auth/stack", import.meta.url)),
  });
}
