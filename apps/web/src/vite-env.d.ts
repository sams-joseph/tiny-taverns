/// <reference types="vite/client" />

/**
 * The build-time configuration this app reads.
 *
 * Vite inlines every `VITE_`-prefixed variable into the browser bundle, so
 * everything declared here is public by construction. Nothing secret may be
 * added: a `VITE_`-prefixed secret is published to every visitor. In
 * particular Clerk's secret key has no place in this app under any name — the
 * API server does not use one either, and neither should this.
 */
interface ImportMetaEnv {
  /** Where the API lives. Defaults to the dev server in `api/client.ts`. */
  readonly VITE_API_URL?: string;
  /**
   * Clerk's publishable key (`pk_test_…` / `pk_live_…`). Public by design: it
   * identifies the frontend API host and authorises nothing.
   *
   * **Optional on purpose.** Unset means no hosted sign-in, which is a
   * supported mode rather than a broken one — see `auth/AuthProvider.tsx`.
   */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
