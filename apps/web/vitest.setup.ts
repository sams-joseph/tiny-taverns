import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
// Base UI's controls construct a PointerEvent on click; jsdom ships none.
import "@taverns/ui/testing/pointer-event-polyfill";

// Every `findBy*` and `waitFor` gives up after Testing Library's 1 s default,
// however long the test itself is allowed to run. Hob's story-so-far test in the
// web suite finishes in about 60 ms idle, yet took 1.2-1.7 s on a starved CI
// runner and failed on the wait rather than on the behaviour. Same reasoning as
// `testTimeout` in `vite.config.ts`: a budget big enough that the machine stops
// being the variable. Only a wait that never succeeds pays for it, and no test
// waits for one to fail.
configure({ asyncUtilTimeout: 10_000 });

// TanStack Router's scroll restoration calls this after route transitions. jsdom
// exposes it only as a "not implemented" stub that writes to stderr, so the
// test environment supplies the no-op browsers effectively use when no scroll
// position changes.
window.scrollTo = () => undefined;

// The drag library (`@dnd-kit/dom`) extends `ResizeObserver` as it loads, and
// jsdom ships none. jsdom lays nothing out, so nothing is ever resized.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
