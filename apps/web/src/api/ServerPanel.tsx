import type { Campaign, HealthStatus } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@taverns/ui";
import { useCallback, useEffect, useState } from "react";
import { runApi } from "./client";

const TOKEN_KEY = "taverns.token";

/**
 * `window.localStorage`, not the bare global: Node 26 defines its own
 * `localStorage` that is `undefined` unless the process was started with
 * `--localstorage-file`, and under jsdom that global shadows the one the
 * document actually has.
 */
const storage = (): Storage | undefined => globalThis.window?.localStorage;

/**
 * A real call to the real API, through the client derived from `TavernsApi`.
 *
 * This is not a mock of the backend and not a fixture: it is the same
 * declaration the server implements, so if the wire contract drifts this panel
 * stops compiling. `/health` needs no credential; `/campaigns` needs the DM
 * bearer token that `pnpm -F server token:issue` prints.
 */
export function ServerPanel() {
  const [health, setHealth] = useState<HealthStatus | undefined>();
  const [campaigns, setCampaigns] = useState<ReadonlyArray<Campaign> | undefined>();
  const [token, setToken] = useState(() => storage()?.getItem(TOKEN_KEY) ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    runApi((client) => client.health.check())
      .then(setHealth)
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  const loadCampaigns = useCallback(() => {
    setBusy(true);
    setError(undefined);
    storage()?.setItem(TOKEN_KEY, token);
    runApi((client) => client.campaigns.list(), token)
      .then((listed) => {
        setCampaigns(listed);
        setBusy(false);
      })
      .catch((cause: unknown) => {
        setCampaigns(undefined);
        setError(String(cause));
        setBusy(false);
      });
  }, [token]);

  return (
    <section id="server" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
          Server
        </h2>
        <p className="max-w-measure text-body leading-body text-muted-foreground">
          Live calls through the client derived from <code>TavernsApi</code>. Start the API with{" "}
          <code>pnpm db:up &amp;&amp; pnpm -F server dev</code>, then paste a token from{" "}
          <code>pnpm -F server token:issue</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GET /health</CardTitle>
          <CardDescription>No credential; answers before any actor is resolved.</CardDescription>
        </CardHeader>
        <CardContent>
          {health ? (
            <Badge variant="success">
              {health.status} · up {Math.round(health.uptime)}s
            </Badge>
          ) : (
            <Badge variant="outline">no answer yet</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GET /campaigns</CardTitle>
          <CardDescription>
            Behind the bearer seam. Without a token the API answers 401 with no handler code.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="taverns-token">DM token</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="taverns-token"
                type="password"
                value={token}
                placeholder="paste the token from token:issue"
                onChange={(event) => setToken(event.target.value)}
                className="max-w-xs"
              />
              <Button onClick={loadCampaigns} disabled={busy}>
                {busy ? "Loading…" : "Load campaigns"}
              </Button>
            </div>
          </div>

          {campaigns !== undefined && (
            <ul className="flex flex-col gap-2">
              {campaigns.length === 0 ? (
                <li className="text-body-s leading-body text-faint">No campaigns yet.</li>
              ) : (
                campaigns.map((campaign) => (
                  <li key={campaign.id} className="flex flex-wrap items-center gap-3">
                    <span className="text-body leading-body text-heading">{campaign.name}</span>
                    <Badge variant="secondary">{campaign.playerCount} players</Badge>
                    <Badge variant={campaign.visibility === "shared" ? "info" : "outline"}>
                      {campaign.visibility}
                    </Badge>
                  </li>
                ))
              )}
            </ul>
          )}

          {error !== undefined && (
            <p role="alert" className="text-body-s leading-body text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
