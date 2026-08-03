import "@testing-library/jest-dom/vitest";
// Base UI's controls construct a PointerEvent on click; jsdom ships none.
import "@taverns/ui/testing/pointer-event-polyfill";
