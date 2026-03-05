import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";

import { App } from "./App";
import "./styles.css";
import { ToastProvider } from "@nodex/ui";
import { initI18n } from "@nodex/i18n";

function renderFatal(message: string) {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div style="padding:16px;color:#fff;background:#0f172a;font-family:system-ui,sans-serif;min-height:100vh">
      <h3 style="margin:0 0 12px 0">Client app failed to start</h3>
      <pre style="white-space:pre-wrap;font-size:12px;line-height:1.4">${message}</pre>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const message = event.error?.message ?? event.message ?? "Unknown error";
  // Telegram WebView sometimes emits opaque cross-origin "Script error."
  // which should not hard-crash the whole app UI.
  if (message === "Script error.") {
    // eslint-disable-next-line no-console
    console.warn("Suppressed opaque Script error from webview");
    return;
  }
  // eslint-disable-next-line no-console
  console.error("Unhandled window error:", event.error ?? message);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", reason);
});

try {
  initI18n();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
      <ToastProvider />
      <App />
    </>,
  );
} catch (error) {
  renderFatal(error instanceof Error ? error.message : String(error));
}
