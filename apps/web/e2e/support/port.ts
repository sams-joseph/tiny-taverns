import { createServer } from "node:net";

/**
 * A port nobody holds right now, so a suite never lands on somebody's 5173 or
 * 3000. A Playwright config is evaluated again in every worker; each config
 * stores the answer in an environment variable the runner sets before it forks
 * them, so they all agree on one server.
 */
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
