import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { Health } from "../src/Health.js";
import { healthHandler } from "../src/router.js";

describe("Health service", () => {
  it("reports an ok status with non-negative uptime", async () => {
    const status = await Effect.runPromise(
      Health.pipe(
        Effect.flatMap((health) => health.check),
        Effect.provide(Health.layer),
      ),
    );

    expect(status.status).toBe("ok");
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /health handler", () => {
  it("produces a 200 JSON response", async () => {
    const response = await Effect.runPromise(healthHandler.pipe(Effect.provide(Health.layer)));

    expect(response.status).toBe(200);
  });
});
