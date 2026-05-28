import "./app.css";
import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider } from "@tanstack/react-router";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { router } from "./router.js";
import { TooltipProvider } from "./components/ui/tooltip.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </RegistryProvider>
  </React.StrictMode>,
);
