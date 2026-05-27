import { AppNav } from "@/components/app-nav";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div className="h-dvh flex flex-col dark">
      <div className="w-full sticky top-0 bg-zinc-800">
        <div className="mx-auto flex w-full max-w-4xl flex-row gap-8 px-6 py-4 sticky top-0">
          <AppNav />
        </div>
      </div>
      <Outlet />
    </div>
  ),
});
