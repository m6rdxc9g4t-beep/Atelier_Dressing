import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/atelier-brand/atelier-brand.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/dressing.css";
import App from "./App";
import { estTauri } from "./lib/plateforme";

// Service worker (hors app Mac) : mise en cache pour l'iPhone
if (!estTauri && "serviceWorker" in navigator && import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
