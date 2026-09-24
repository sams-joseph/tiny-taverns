import type { LinkProps } from "@tanstack/react-router";

/**
 * The props a route tab and a nav item share: the active state is the
 * caller's answer (a section, a shelf), not `Link`'s own.
 *
 * **`Link` marks itself active on a prefix by default, and a nav's question is
 * not that one.** `exact` narrows its notion of active to "this is the page",
 * which is always a case the caller also calls active, so the two agree instead
 * of fighting. That matters because `Link` spreads its own `aria-current="page"`
 * **after** everything else and there is no way to turn that off;
 * `activeProps={{}}` only stops it appending a stray `active` class.
 * `data-active` is the attribute Base UI's own tab sets, and the one
 * `tabsTriggerVariants` keys its underline on.
 */
export const navLinkProps = (active: boolean) =>
  ({
    activeOptions: { exact: true },
    activeProps: {},
    "aria-current": active ? ("page" as const) : undefined,
    "data-active": active ? "" : undefined,
  }) satisfies Partial<LinkProps> & Record<string, unknown>;
