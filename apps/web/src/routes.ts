import { CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { useCallback, useEffect, useState } from "react";

/**
 * Where you are, in the URL.
 *
 * The hash rather than a router: this is a static SPA with three screens, and
 * `#/…` needs no history API, no server rewrite rule and no dependency. What it
 * buys is real — a reload keeps you on the campaign you were reading, and a
 * campaign is linkable, which is how you point someone at the thing you are
 * looking at.
 */
export type Route =
  | { readonly screen: "campaigns" }
  | { readonly screen: "campaign"; readonly campaignId: CampaignId }
  | { readonly screen: "gallery" };

const decodeCampaignId = Schema.decodeSync(CampaignId);

/** An id we did not mint is a bad link, not a crash: fall back to the list. */
const parseCampaignId = (raw: string | undefined): CampaignId | undefined => {
  if (raw === undefined || raw === "") return undefined;
  try {
    return decodeCampaignId(raw);
  } catch {
    return undefined;
  }
};

export const parseRoute = (hash: string): Route => {
  const [head, id] = hash.replace(/^#\/?/, "").split("/");

  if (head === "gallery") return { screen: "gallery" };
  if (head === "campaigns") {
    const campaignId = parseCampaignId(id);
    if (campaignId !== undefined) return { screen: "campaign", campaignId };
  }
  return { screen: "campaigns" };
};

export const hrefFor = (route: Route): string => {
  switch (route.screen) {
    case "gallery":
      return "#/gallery";
    case "campaign":
      return `#/campaigns/${route.campaignId}`;
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
