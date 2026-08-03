import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import faviconUrl from "@taverns/design-system/assets/icon/favicon-32.png";
import { App } from "./App";
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
    <App />
  </StrictMode>,
);
