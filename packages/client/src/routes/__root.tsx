import { DashboardShell } from "@/components/dashboard-shell";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  ),
});
