import { apiUrl } from "../api/client";

/**
 * What a card's portrait band draws for a character or an NPC: **the banner
 * when there is one**, the wide picture Hob drew for exactly this place, both
 * of its sizes in `srcset` and its crop centred as the server cut it; else the
 * square portrait's card size anchored at the top, as bands drew before
 * banners existed (a subject drawn before them, or whose banner was capped or
 * refused). `undefined` with neither.
 */
export function bandSource(
  portrait: { readonly cardUrl: string } | null,
  banner: { readonly cardUrl: string; readonly fullUrl: string } | null,
): { readonly src: string; readonly srcSet?: string; readonly className: string } | undefined {
  if (banner !== null) {
    return {
      src: apiUrl(banner.cardUrl),
      srcSet: `${apiUrl(banner.cardUrl)} 768w, ${apiUrl(banner.fullUrl)} 1536w`,
      className: "object-center",
    };
  }
  return portrait === null ? undefined : { src: apiUrl(portrait.cardUrl), className: "object-top" };
}
