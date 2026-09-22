import { Outlet, useMatches } from "@tanstack/react-router";
import { Hob, useHobPanel, type HobPanelState } from "../hob";
import { AppShell } from "./AppShell";
import { ShowHob } from "./slots";

/**
 * The persistent layout: the one place `AppShell` is mounted.
 *
 * **Every screen under it renders inside one shell that never remounts.** The
 * header, both nav rows, the bar's slot and the Hob panel survive navigation;
 * only the outlet changes. Before this, each screen composed its own shell, so
 * every navigation tore all of it down and an open Hob panel closed itself.
 *
 * The Hob panel's open state lives here, once, so it stays open across
 * navigation and across campaigns; `Hob` reads the scope from the route, so
 * only the thread swaps.
 *
 * `fill` is route data rather than a prop, because the screen that wants it is
 * below the layout and a prop cannot travel up: see `StaticDataRouteOption` in
 * `routes.tsx`.
 */
export function ShellLayout() {
  return <Frame hob={useHobPanel({ initialOpen: false })} />;
}

/**
 * The same shell without the Hob panel, for the two routes outside the
 * persistent layout: the invitation page, which has nobody to ask on behalf of
 * yet, and the gallery, whose Hob specimens own ⌘K themselves (two listeners
 * toggling on one keystroke cancel out).
 */
export function StandaloneLayout() {
  return <Frame hob={undefined} />;
}

function Frame({ hob }: { readonly hob: HobPanelState | undefined }) {
  const fill = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fill === true),
  });

  return (
    <ShowHob.Provider value={hob?.show}>
      <AppShell
        fill={fill}
        onAskHob={hob?.toggle}
        panel={hob === undefined ? undefined : <Hob hob={hob} />}
      >
        <Outlet />
      </AppShell>
    </ShowHob.Provider>
  );
}
