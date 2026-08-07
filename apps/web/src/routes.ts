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
  | {
      readonly screen: "run";
      readonly campaignId: CampaignId;
      readonly sessionId: SessionId;
      readonly runId: EncounterRunId;
    }
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

const parseCampaignId = parser(CampaignId);
const parseSessionId = parser(SessionId);
const parseRunId = parser(EncounterRunId);

export const parseRoute = (hash: string): Route => {
  const [head, campaignRaw, sessions, sessionRaw, runs, runRaw] = hash
    .replace(/^#\/?/, "")
    .split("/");

  if (head === "gallery") return { screen: "gallery" };

  if (head === "campaigns") {
    const campaignId = parseCampaignId(campaignRaw);
    if (campaignId !== undefined) {
      if (sessions === "sessions" && runs === "runs") {
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
