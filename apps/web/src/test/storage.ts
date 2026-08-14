/**
 * A `localStorage` for jsdom, which here has none at all.
 *
 * Neither `window.localStorage` nor the bare global: Node 26 defines its own,
 * inert without `--localstorage-file`, and under jsdom that global shadows the
 * one the document would otherwise have. `auth/credential.ts` tolerates the
 * absence (the machine token simply reads empty), so anything exercising the
 * stored credential has to install one.
 *
 * It moved out of `campaign/campaign.fixtures.tsx` when `renderAt` grew a
 * credential of its own — every rendered route needs one now, not only the
 * campaign screen's, and two copies of this would be two answers to what a test
 * browser remembers.
 */
export const installMemoryStorage = (): void => {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
      key: (index: number) => [...entries.keys()][index] ?? null,
      get length() {
        return entries.size;
      },
    } satisfies Storage,
    configurable: true,
    writable: true,
  });
};

/** Installs one only if the document has not got one already. */
export const ensureStorage = (): void => {
  if (globalThis.window.localStorage === undefined) installMemoryStorage();
};
