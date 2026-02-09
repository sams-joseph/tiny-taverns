import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

const RootLayout = () => (
  <>
    <div className="p-2 flex gap-2">
      <Link to="/" className="[&.active]:font-bold">
        Chat
      </Link>{" "}
      <Link to="/monsters" className="[&.active]:font-bold">
        Monsters
      </Link>
      <Link to="/campaigns" className="[&.active]:font-bold">
        Campaigns
      </Link>
    </div>
    <hr />
    <Outlet />
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRoute({ component: RootLayout });
