import { layer, type Vitest } from "@effect/vitest";
import type { Duration, Layer } from "effect";

/**
 * A describe block over one shared layer, for `@effect/vitest`: the file's
 * database (`migratedDatabase`), the services over it, `testServer` for an HTTP
 * file, and the fixtures its tests share, as a `Layer.effect` of a service
 * the tests `yield*`.
 *
 * The layer is built once, in the block's `beforeAll`, so the migrations are
 * charged to the suite's 60 s `hookTimeout` rather than to whichever test runs
 * first, and its scope is closed in the `afterAll`: that disposes the pool and
 * interrupts every fiber the layer forked. Each test is an `it.effect`, whose
 * body is an Effect run with the layer's services and a `Scope`. Always named:
 * a nested `it.layer` looks the outer layer up when its own `beforeAll` runs,
 * and only the named form has built the outer one by then. Unnamed, the nested
 * block would build a second copy, and the second `migratedDatabase` drops the
 * first one's database.
 *
 * On the live clock (`excludeTestServices`). `layer` otherwise builds the
 * whole layer on Effect's `TestClock`, which starts at 1970 and never moves on
 * its own: the image worker's housekeeping loop and the event stream's
 * heartbeat would stop, and every timestamp read through `Clock` would be the
 * epoch. A test that wants virtual time provides `TestClock.layer()` to its own
 * effect, so only what that test builds runs on it (`npc-images.test.ts`).
 *
 * `timeout` keeps a file's own budget for building its layer where that differs
 * from the suite's `hookTimeout`, such as importing the system corpus
 * (`core-characters.test.ts`).
 */
export const describeLayer = <R, E>(
  name: string,
  shared: Layer.Layer<R, E>,
  tests: (it: Vitest.MethodsNonLive<R>) => void,
  options?: { readonly timeout?: Duration.Input },
): void => layer(shared, { excludeTestServices: true, ...options })(name, tests);
