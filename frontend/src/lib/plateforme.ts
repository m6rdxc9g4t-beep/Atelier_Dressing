/** L'app tourne-t-elle dans l'application Mac (Tauri) ? */
export const estTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** PWA installée sur l'écran d'accueil (iPhone) ou fenêtre d'app. */
export const estInstallee =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const estIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Adresse publique de l'app web (pour les liens de confirmation d'e-mail). */
export const URL_APP = import.meta.env.VITE_APP_URL ?? (estTauri ? "" : window.location.origin);
