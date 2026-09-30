import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import "./test/pointer-event-polyfill";

// Every `findBy*` and `waitFor` gives up after Testing Library's 1 s default,
// however long the test itself is allowed to run. Hob's story-so-far test in the
// web suite finishes in about 60 ms idle, yet took 1.2-1.7 s on a starved CI
// runner and failed on the wait rather than on the behaviour. Same reasoning as
// the web suite's `testTimeout`: a budget big enough that the machine stops being
// the variable. Only a wait that never succeeds pays for it, and no test waits for
// one to fail. Vitest's default 5 s test timeout still ends such a wait first in
// this package.
configure({ asyncUtilTimeout: 10_000 });
