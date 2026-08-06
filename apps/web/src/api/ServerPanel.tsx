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
import { useHostedSession } from "../auth/hostedSession";
import { runApi } from "./client";

const TOKEN_KEY = "taverns.token";

/**
 * `window.localStorage`, not the bare global: Node 26 defines its own
 * `localStorage` that is `undefined` unless the process was started with
 * `--localstorage-file`, and under jsdom that global shadows the one the
 * document actually has.
 */
const storage = (): Storage | undefined => globalThis.window?.localStorage;

/** The decoded campaign rows, rendered the same way for either credential. */
function CampaignList({ campaigns }: { readonly campaigns: ReadonlyArray<Campaign> }) {
  if (campaigns.length === 0) {
    return <p className="text-body-s leading-body text-faint">No campaigns yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="flex flex-wrap items-center gap-3">
          <span className="text-body leading-body text-heading">{campaign.name}</span>
          <Badge variant="secondary">{campaign.playerCount} players</Badge>
          <Badge variant={campaign.visibility === "shared" ? "info" : "outline"}>
            {campaign.visibility}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * The machine-token path: a credential pasted by hand.
 *
 * This box predates hosted sign-in and is deliberately kept. It stopped being
 * "the DM token" the moment a person could sign in, and became the
 * *machine-token* affordance — the only interactive proof from a browser that
 * the second credential kind still authenticates. Deleting it once sign-in
 * works would remove the only place that path is exercised outside the server
 * test suite.
 */
function MachineTokenCampaigns() {
  const [campaigns, setCampaigns] = useState<ReadonlyArray<Campaign> | undefined>();
  const [token, setToken] = useState(() => storage()?.getItem(TOKEN_KEY) ?? "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle>GET /campaigns — machine token</CardTitle>
        <CardDescription>
          The non-human credential, pasted by hand. Behind the bearer seam: without a token the API
          answers 401 with no handler code.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="taverns-token">Machine token</Label>
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

        {campaigns !== undefined && <CampaignList campaigns={campaigns} />}

        {error !== undefined && (
          <p role="alert" className="text-body-s leading-body text-danger">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The hosted-sign-in path: the same endpoints, reached with a session token.
 *
 * Nothing here knows which vendor minted the credential, and the API client is
 * unchanged — `makeClient(token?)` already took an optional bearer, and a
 * session token is a bearer token like any other. That is why `client.ts`
 * stayed free of Clerk: it proves the wire contract, and its tests should not
 * need an auth provider to run.
 *
 * **The token is fetched inside each handler, never at mount.** Session tokens
 * are short-lived (Clerk's live 60 seconds, refreshed by the SDK on a ~50s
 * interval), so a token read once into state works until the first refresh and
 * then 401s — for a page left open on a table, that is most of the session.
 */
function HostedSessionCampaigns() {
  const { signedIn, fetchToken } = useHostedSession();
  const [campaigns, setCampaigns] = useState<ReadonlyArray<Campaign> | undefined>();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const token = await fetchToken();
      setCampaigns(await runApi((client) => client.campaigns.list(), token));
    } catch (cause: unknown) {
      setCampaigns(undefined);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [fetchToken]);

  const createCampaign = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      // A second, independent token fetch rather than reusing the one above:
      // the previous call may have been minutes ago.
      const token = await fetchToken();
      const created = await runApi(
        (client) => client.campaigns.create({ payload: { name } }),
        token,
      );
      setName("");
      setCampaigns((listed) => (listed === undefined ? [created] : [...listed, created]));
    } catch (cause: unknown) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, [fetchToken, name]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>GET /campaigns — signed in</CardTitle>
        <CardDescription>
          {signedIn
            ? "A fresh session token is fetched immediately before each call. An account is provisioned on the first authenticated request."
            : "Sign in from the header to reach these with a session token."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void loadCampaigns()} disabled={busy || !signedIn}>
            {busy ? "Working…" : "Load my campaigns"}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="taverns-campaign-name">New campaign</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="taverns-campaign-name"
              value={name}
              placeholder="The Reed Marches"
              onChange={(event) => setName(event.target.value)}
              className="max-w-xs"
              disabled={!signedIn}
            />
            <Button
              variant="secondary"
              onClick={() => void createCampaign()}
              disabled={busy || !signedIn || name.trim() === ""}
            >
              Create campaign
            </Button>
          </div>
        </div>

        {campaigns !== undefined && <CampaignList campaigns={campaigns} />}

        {error !== undefined && (
          <p role="alert" className="text-body-s leading-body text-danger">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A real call to the real API, through the client derived from `TavernsApi`.
 *
 * This is not a mock of the backend and not a fixture: it is the same
 * declaration the server implements, so if the wire contract drifts this panel
 * stops compiling. `/health` needs no credential; `/campaigns` needs a bearer
 * token — either kind.
 */
export function ServerPanel() {
  const { configured } = useHostedSession();
  const [health, setHealth] = useState<HealthStatus | undefined>();
  const [healthError, setHealthError] = useState<string | undefined>();

  useEffect(() => {
    runApi((client) => client.health.check())
      .then(setHealth)
      .catch((cause: unknown) => setHealthError(String(cause)));
  }, []);

  return (
    <section id="server" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
          Server
        </h2>
        <p className="max-w-measure text-body leading-body text-muted-foreground">
          Live calls through the client derived from <code>TavernsApi</code>. Start the API with{" "}
          <code>pnpm db:up &amp;&amp; pnpm -F server dev</code>, then either sign in above or paste
          a token from <code>pnpm -F server token:issue</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GET /health</CardTitle>
          <CardDescription>No credential; answers before any actor is resolved.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {health ? (
            <Badge variant="success">
              {health.status} · up {Math.round(health.uptime)}s
            </Badge>
          ) : (
            <Badge variant="outline">no answer yet</Badge>
          )}
          {healthError !== undefined && (
            <p role="alert" className="text-body-s leading-body text-danger">
              {healthError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Offered only when a hosted identity provider is configured. With no
          publishable key this card is absent rather than present and dead. */}
      {configured && <HostedSessionCampaigns />}

      <MachineTokenCampaigns />
    </section>
  );
}
