import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Préférence de thème commune à la suite (docs/SUITE.md §1.5 d'Atelier_Projets) : la copie verbatim
 * src/styles/atelier-brand/atelier-theme.js est insérée telle quelle dans <head>, en script bloquant,
 * pour poser le thème avant le premier affichage (dev, build Vercel et app Mac).
 *
 * Juste avant, une reprise unique de l'ancien choix du Dressing (« theme » dans localStorage
 * « dressing.reglages » : dark, light ou auto) : s'il n'existe pas encore de préférence commune,
 * il le devient (auto → system), puis la clé est retirée des réglages.
 */
const REPRISE_THEME = `(function () {
  try {
    var r = JSON.parse(localStorage.getItem("dressing.reglages") || "null");
    if (!r || !("theme" in r)) return;
    var ancien = r.theme === "auto" ? "system" : r.theme;
    delete r.theme;
    localStorage.setItem("dressing.reglages", JSON.stringify(r));
    var connu = /(?:^|; )atelier_theme=/.test(document.cookie) || localStorage.getItem("atelier:theme") !== null;
    if (!connu && (ancien === "light" || ancien === "dark" || ancien === "system")) localStorage.setItem("atelier:theme", ancien);
  } catch (e) {}
})();`;

function themeAtelier(): Plugin {
  const fichier = new URL("./src/styles/atelier-brand/atelier-theme.js", import.meta.url);
  return {
    name: "atelier-theme",
    transformIndexHtml: () => [
      { tag: "script", children: REPRISE_THEME, injectTo: "head" },
      { tag: "script", children: readFileSync(fichier, "utf8"), injectTo: "head" },
    ],
  };
}

// L'app Mac (Tauri) charge le même build ; TAURI_ENV_PLATFORM est défini par la CLI Tauri.
const pourTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [
    themeAtelier(),
    react(),
    VitePWA({
      disable: pourTauri,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["icone.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Atelier Dressing",
        short_name: "Dressing",
        description: "Ton dressing en photos, ton mannequin, tes tenues.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone-512-masquable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  // Réglages recommandés par Tauri
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: pourTauri ? "safari15" : "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: "node",
  },
});
