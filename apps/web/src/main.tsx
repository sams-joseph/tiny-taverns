import { RegistryProvider } from "@effect/atom-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import faviconUrl from "@taverns/design-system/assets/icon/favicon-32.png";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
if (favicon) {
  favicon.href = faviconUrl;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* Mounts a hosted identity provider only when one is configured; with no
        publishable key this is a pass-through and the app runs as it always
        has. See `auth/AuthProvider.tsx`. */}
    <AuthProvider>
      {/* The registry every atom's value lives in. Explicit rather than left to
          `RegistryContext`'s module-level default, so the app and a test render
          the same tree — see `test/renderRoute.tsx`, where the default is a
          silent cross-test leak rather than a convenience. */}
      <RegistryProvider>
        <App />
      </RegistryProvider>
    </AuthProvider>
  </StrictMode>,
);
