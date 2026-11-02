/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Fichiers de l'app mis en cache : ouverture instantanée et hors ligne depuis l'écran d'accueil.
// Les photos, elles, sont dans IndexedDB (mode local) ou en cache IndexedDB (mode synchronisé).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
