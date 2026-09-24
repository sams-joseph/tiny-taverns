import { createPublicKey, type JsonWebKey } from "node:crypto";

/**
 * The development instance's two test users. They were made by hand in the
 * Clerk dashboard and this suite never creates, changes or deletes a user:
 * global setup only checks they are there. The `+clerk_test` subaddress is
 * what makes an address a test address, so the email-code strategy accepts the
 * fixed code `424242` and no mail is sent.
 */
export const USERS = {
  dm: "dm+clerk_test@gmail.com",
  player: "player+clerk_test@gmail.com",
} as const;

export type Who = keyof typeof USERS;

/** The keys the suite reads, from the environment only. */
export interface ClerkKeys {
  readonly publishableKey: string;
  readonly secretKey: string;
}

export const clerkKeys = (): ClerkKeys | undefined => {
  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  return publishableKey === "" || secretKey === "" ? undefined : { publishableKey, secretKey };
};

/** Why every test is skipped, when it is. */
export const UNCONFIGURED =
  "CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are unset, so the authenticated suite is skipped " +
  "(see apps/web/e2e/README.md).";

/**
 * Refuses anything but a development instance. The testing token Clerk hands
 * out is for development instances only, and a production key here would sign
 * the suite in against real people's accounts.
 */
export const assertDevelopmentKeys = (keys: ClerkKeys): void => {
  if (!keys.publishableKey.startsWith("pk_test_") || !keys.secretKey.startsWith("sk_test_"))
    throw new Error("The authenticated suite runs only against a Clerk development instance.");
};

/**
 * The instance's JWT public key as the PEM `CLERK_JWT_KEY` takes, from the
 * Frontend API's public JWKS: what the README tells a developer to copy from
 * the dashboard, fetched rather than pasted. The API server then verifies
 * sessions offline exactly as it does in development.
 */
export const jwtPublicKey = async (frontendApi: string): Promise<string> => {
  const response = await fetch(`https://${frontendApi}/.well-known/jwks.json`);
  if (!response.ok) throw new Error(`The instance's JWKS answered ${String(response.status)}.`);
  const { keys } = (await response.json()) as { keys: ReadonlyArray<JsonWebKey> };
  const [key] = keys;
  if (key === undefined || keys.length !== 1)
    throw new Error(
      `Expected one signing key in the instance's JWKS, found ${String(keys.length)}.`,
    );
  return createPublicKey({ key, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
};

/**
 * Checks, read-only, that each test user exists, so a missing one fails setup
 * with its address rather than a sign-in timing out later.
 */
export const assertUsersExist = async (secretKey: string): Promise<void> => {
  for (const email of Object.values(USERS)) {
    const url = new URL("https://api.clerk.com/v1/users");
    url.searchParams.set("email_address", email);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
    if (!response.ok)
      throw new Error(`Clerk's Backend API answered ${String(response.status)} listing users.`);
    const users = (await response.json()) as ReadonlyArray<unknown>;
    if (users.length !== 1)
      throw new Error(
        `The Clerk test user ${email} is missing from the development instance; ` +
          "this suite does not create users.",
      );
  }
};
