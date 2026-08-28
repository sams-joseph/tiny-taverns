import { RegistryProvider } from "@effect/atom-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import touchIconUrl from "@taverns/design-system/assets/icon/apple-touch-icon-180.png";
import faviconUrl from "@taverns/design-system/assets/icon/favicon-32.png";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

// Both icons are imported rather than written into `index.html`, so the bundler
// fingerprints them and the design system stays the one place the artwork lives.
// They are declared together: an `apple-touch-icon` that outlived a favicon edit
// is the kind of thing nobody notices until it is on somebody's home screen.
const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
if (favicon) {
  favicon.href = faviconUrl;
}

// iOS ignores alpha on a home-screen icon and composites onto its own background,
// so this file is the captain's illustration already flattened onto `--slate-950`.
// See `packages/design-system/assets/README.md`.
const touchIcon = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
if (touchIcon) {
  touchIcon.href = touchIconUrl;
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
