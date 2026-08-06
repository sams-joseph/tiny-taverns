/**
 * The publishable key, read at call time rather than at import.
 *
 * Public by design: Vite inlines every `VITE_`-prefixed variable into the
 * browser bundle, and this one identifies the frontend API host rather than
 * authorising anything. The *secret* key has no place in this app under any
 * name — a `VITE_`-prefixed one would be published to every visitor, and the
 * API server does not use one either.
 *
 * Its own module, away from the components, for two reasons: `react-refresh`
 * wants a file to export only components, and the tests want to reach this
 * decision without mounting the vendor's SDK.
 *
 * An empty string counts as absent. An env file carrying the line with no
 * value is someone who has not configured this, not someone who configured it
 * to the empty key — and `vite.config.ts` pins it empty for the test run,
 * which is how the suite stays independent of whatever a developer happens to
 * have in `.env.local`.
 */
export const publishableKey = (): string | undefined => {
  const configured: string | undefined = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return configured === undefined || configured === "" ? undefined : configured;
};
