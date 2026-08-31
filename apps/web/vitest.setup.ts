import "@testing-library/jest-dom/vitest";
// Base UI's controls construct a PointerEvent on click; jsdom ships none.
import "@taverns/ui/testing/pointer-event-polyfill";

// TanStack Router's scroll restoration calls this after route transitions. jsdom
// exposes it only as a "not implemented" stub that writes to stderr, so the
// test environment supplies the no-op browsers effectively use when no scroll
// position changes.
window.scrollTo = () => undefined;
