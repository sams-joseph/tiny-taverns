import "./app.css";
import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider } from "@tanstack/react-router";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip.js";
import { router } from "./router.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </RegistryProvider>
  </React.StrictMode>,
);
