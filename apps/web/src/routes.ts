import { CampaignId, EncounterRunId, SessionId } from "@taverns/api";
import { Schema } from "effect";
import { useCallback, useEffect, useState } from "react";

/**
 * Where you are, in the URL.
 *
 * The hash rather than a router: this is a static SPA with four screens, and
 * `#/…` needs no history API, no server rewrite rule and no dependency. What it
 * buys is real — a reload keeps you on the campaign you were reading, and a
 * campaign is linkable, which is how you point someone at the thing you are
 * looking at.
 *
 * **The runner names all three ids, and that is what makes a mid-fight reload
 * work.** A laptop lid closes, a browser updates, a tab is restored a day later:
 * the hash alone is enough to find the fight again, with no local state and no
 * "which one was I running?" lookup. It is also the shape the API already has —
 * campaign, session, run — so the route decodes straight into the path params
 * every live endpoint takes.
 */
export type Route =
  | { readonly screen: "campaigns" }
  | { readonly screen: "campaign"; readonly campaignId: CampaignId }
  /**
   * The bestiary names a campaign, because the API does: `creatures.list` hangs
   * off `/campaigns/:campaignId/creatures`, and that path is the only thing
   * gating the global `system` rows it returns beside the campaign's own. A
   * top-level `#/bestiary` would have no campaign to read *through*.
   */
  | { readonly screen: "bestiary"; readonly campaignId: CampaignId }
  /**
   * The Chronicle names a campaign for the same reason the bestiary does: every
   * source it reads — `sessions.list`, `recap.read`, `search.search` — hangs off
   * `/campaigns/:campaignId`, and on the search endpoint that path is a security
   * property rather than a routing one (see `Api.ts`). A top-level
   * `#/chronicle` would have no campaign whose record to read.
   */
  | { readonly screen: "chronicle"; readonly campaignId: CampaignId }
  | {
      readonly screen: "run";
      readonly campaignId: CampaignId;
      readonly sessionId: SessionId;
      readonly runId: EncounterRunId;
    }
  /**
   * Following an invitation, before there is anybody to follow it as.
   *
   * **The token lives in the fragment and nowhere else**, which is the whole
   * reason this route exists rather than a query string: a browser never sends
   * the fragment to a server, so the secret stays out of access logs and out of
   * the `Referer` of anything this page links to. The page reads it here and
   * puts it in a `POST` body.
   *
   * It names no campaign, because the holder does not know which one it is yet
   * — that is what the page is for.
   */
  | { readonly screen: "join"; readonly token: string }
  | { readonly screen: "gallery" };

/**
 * An id we did not mint is a bad link, not a crash.
 *
 * The ids are branded UUIDs, so a hand-typed or truncated one has to decode or
 * be refused — and refusing here is what lets `parseRoute` fall back a level
 * rather than throw during render.
 */
const parser = <A>(schema: Schema.Codec<A, string>) => {
  const decode = Schema.decodeSync(schema);
  return (raw: string | undefined): A | undefined => {
    if (raw === undefined || raw === "") return undefined;
    try {
      return decode(raw);
    } catch {
      return undefined;
    }
  };
};

/**
 * An invitation token, as it may appear in a hash.
 *
 * 32 bytes of `randomBytes` in base64url, whose alphabet is exactly this — so a
 * link that lost characters to a chat client's line wrapping is refused here
 * rather than sent to the server to be refused there. The length is not checked:
 * the server's answer is the authority on whether a token is real, and a rule
 * restated in two places is a rule that can disagree with itself.
 */
const parseToken = (raw: string | undefined): string | undefined =>
  raw !== undefined && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : undefined;

const parseCampaignId = parser(CampaignId);
const parseSessionId = parser(SessionId);
const parseRunId = parser(EncounterRunId);

export const parseRoute = (hash: string): Route => {
  // `section` is whatever follows the campaign's id: `bestiary`, or `sessions`
  // on the way to a fight.
  const [head, campaignRaw, section, sessionRaw, runs, runRaw] = hash
    .replace(/^#\/?/, "")
    .split("/");

  if (head === "gallery") return { screen: "gallery" };

  if (head === "join") {
    // `campaignRaw` is the second segment whatever it holds; here it is the
    // token. A malformed one falls through to the campaign list, which is the
    // same thing a half-typed run link does.
    const token = parseToken(campaignRaw);
    if (token !== undefined) return { screen: "join", token };
  }

  if (head === "campaigns") {
    const campaignId = parseCampaignId(campaignRaw);
    if (campaignId !== undefined) {
      if (section === "bestiary") return { screen: "bestiary", campaignId };
      if (section === "chronicle") return { screen: "chronicle", campaignId };
      if (section === "sessions" && runs === "runs") {
        const sessionId = parseSessionId(sessionRaw);
        const runId = parseRunId(runRaw);
        // A half-typed run link still knows which campaign it meant, so it
        // lands on the campaign rather than all the way back at the list.
        if (sessionId !== undefined && runId !== undefined) {
          return { screen: "run", campaignId, sessionId, runId };
        }
      }
      return { screen: "campaign", campaignId };
    }
  }

  return { screen: "campaigns" };
};

export const hrefFor = (route: Route): string => {
  switch (route.screen) {
    case "gallery":
      return "#/gallery";
    case "campaign":
      return `#/campaigns/${route.campaignId}`;
    case "bestiary":
      return `#/campaigns/${route.campaignId}/bestiary`;
    case "chronicle":
      return `#/campaigns/${route.campaignId}/chronicle`;
    case "join":
      return `#/join/${route.token}`;
    case "run":
      return `#/campaigns/${route.campaignId}/sessions/${route.sessionId}/runs/${route.runId}`;
    default:
      return "#/campaigns";
  }
};

const currentHash = (): string => globalThis.location?.hash ?? "";

/**
 * Routes are the hashes beginning `#/`. Anything else is an in-page anchor.
 *
 * The gallery's section links are plain `href="#foundations"` jumps, and without
 * this rule every one of them would read as "navigate to an unknown route" and
 * throw the reader back to the campaign list mid-scroll. A hash with no leading
 * slash leaves the route exactly where it was, which is what an anchor means.
 */
const isRouteHash = (hash: string): boolean => hash === "" || hash.startsWith("#/");

/** The current route, and a way to change it. Both go through the hash. */
export function useRoute(): readonly [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(currentHash()));

  useEffect(() => {
    const onHashChange = () => {
      const hash = currentHash();
      if (isRouteHash(hash)) setRoute(parseRoute(hash));
    };
    globalThis.addEventListener("hashchange", onHashChange);
    // The hash may have moved between first render and this effect.
    onHashChange();
    return () => globalThis.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    globalThis.location.hash = hrefFor(next);
  }, []);

  return [route, navigate] as const;
}
