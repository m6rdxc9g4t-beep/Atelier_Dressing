import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Depot } from "./depot";
import { profilVide } from "./depot-local";
import { migrerModeIA, REGLAGES_IA_DEFAUT, type ReglagesIA } from "./ia";
import { reperesDepuisAlpha, type Reperes } from "./mannequin";
import { derniersPorts, nombrePorts } from "./suggestion";
import { maintenant, type Essayage, type Garderobe, type Port, type Profil, type Tenue, type Vetement } from "./types";

// ---------------------------------------------------------------- Réglages

export type Theme = "dark" | "light" | "auto";

export interface Reglages extends ReglagesIA {
  theme: Theme;
  /** Météo automatique (position de l'appareil) pour les propositions de tenue. */
  meteo: boolean;
}

const CLE_REGLAGES = "dressing.reglages";
const DEFAUT: Reglages = { ...REGLAGES_IA_DEFAUT, theme: "dark", meteo: true };

let reglagesCourants: Reglages = (() => {
  try {
    const lu = { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? "{}") } as Reglages;
    return { ...lu, modeIA: migrerModeIA(lu.modeIA) };
  } catch {
    return DEFAUT;
  }
})();
const abonnes = new Set<() => void>();

export function majReglages(partiel: Partial<Reglages>) {
  reglagesCourants = { ...reglagesCourants, ...partiel };
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglagesCourants));
  } catch {
    /* stockage plein ou privé */
  }
  if (partiel.theme) appliquerTheme(partiel.theme);
  abonnes.forEach((f) => f());
}

export function useReglages(): [Reglages, (p: Partial<Reglages>) => void] {
  const r = useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => reglagesCourants,
  );
  return [r, majReglages];
}

export function lireReglages(): Reglages {
  return reglagesCourants;
}

/** Néon = data-theme="dark" + classe dark ; clair = data-theme="light" (même logique que index.html). */
export function appliquerTheme(theme: Theme = reglagesCourants.theme) {
  const clair = theme === "light" || (theme === "auto" && window.matchMedia?.("(prefers-color-scheme: light)").matches);
  const racine = document.documentElement;
  racine.setAttribute("data-theme", clair ? "light" : "dark");
  racine.classList.toggle("dark", !clair);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", clair ? "#f6f4f4" : "#141312");
}

if (typeof window !== "undefined") {
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", () => {
    if (reglagesCourants.theme === "auto") appliquerTheme("auto");
  });
}

// ---------------------------------------------------------------- Données

interface Donnees extends Garderobe {
  depot: Depot;
  chargement: boolean;
  erreur: string | null;
  derniers: Map<string, string>;
  compteurs: Map<string, number>;
  enregistrerVetement: (v: Vetement) => Promise<void>;
  supprimerVetement: (id: string) => Promise<void>;
  enregistrerTenue: (t: Tenue) => Promise<void>;
  supprimerTenue: (id: string) => Promise<void>;
  enregistrerPort: (p: Port) => Promise<void>;
  supprimerPort: (id: string) => Promise<void>;
  enregistrerProfil: (p: Profil) => Promise<void>;
  enregistrerEssayage: (e: Essayage) => Promise<void>;
  supprimerEssayage: (id: string) => Promise<void>;
  recharger: () => Promise<void>;
}

const Ctx = createContext<Donnees | null>(null);

const VIDE: Garderobe = { vetements: [], tenues: [], ports: [], essayages: [], profil: profilVide() };

export function FournisseurDonnees({ depot, children }: { depot: Depot; children: ReactNode }) {
  const [g, setG] = useState<Garderobe>(VIDE);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const courant = useRef(g);
  courant.current = g;

  const recharger = useCallback(async () => {
    try {
      setG(await depot.charger());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setChargement(false);
    }
  }, [depot]);

  useEffect(() => {
    recharger();
    const fin = depot.ecouter?.(() => recharger());
    const auRetour = () => document.visibilityState === "visible" && depot.mode === "cloud" && recharger();
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      fin?.();
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [depot, recharger]);

  // Mise à jour optimiste : l'écran change tout de suite, on revient en arrière si l'écriture échoue.
  const optimiste = useCallback(
    async (modifier: (g: Garderobe) => Garderobe, ecrire: () => Promise<void>) => {
      const avant = courant.current;
      setG(modifier(avant));
      try {
        await ecrire();
      } catch (e) {
        setG(avant);
        throw e;
      }
    },
    [],
  );

  const remplacer = <T extends { id: string }>(liste: T[], el: T) =>
    liste.some((x) => x.id === el.id) ? liste.map((x) => (x.id === el.id ? el : x)) : [el, ...liste];

  const valeur = useMemo<Donnees>(() => {
    const enregistrerVetement = (v: Vetement) => {
      const maj = { ...v, maj_le: maintenant() };
      return optimiste((g) => ({ ...g, vetements: remplacer(g.vetements, maj) }), () => depot.ecrireVetement(maj));
    };
    const supprimerVetement = (id: string) =>
      optimiste(
        (g) => ({
          ...g,
          vetements: g.vetements.filter((v) => v.id !== id),
          tenues: g.tenues.map((t) => (t.pieces.includes(id) ? { ...t, pieces: t.pieces.filter((p) => p !== id) } : t)),
        }),
        () => depot.supprimerVetement(id),
      );
    const enregistrerTenue = (t: Tenue) => {
      const maj = { ...t, maj_le: maintenant() };
      return optimiste((g) => ({ ...g, tenues: remplacer(g.tenues, maj) }), () => depot.ecrireTenue(maj));
    };
    const supprimerTenue = (id: string) =>
      optimiste(
        (g) => ({
          ...g,
          tenues: g.tenues.filter((t) => t.id !== id),
          ports: g.ports.map((p) => (p.tenue_id === id ? { ...p, tenue_id: null } : p)),
        }),
        () => depot.supprimerTenue(id),
      );
    const enregistrerPort = (p: Port) =>
      optimiste(
        (g) => ({ ...g, ports: remplacer(g.ports, p).sort((a, b) => b.porte_le.localeCompare(a.porte_le)) }),
        () => depot.ecrirePort(p),
      );
    const supprimerPort = (id: string) =>
      optimiste((g) => ({ ...g, ports: g.ports.filter((p) => p.id !== id) }), () => depot.supprimerPort(id));
    const enregistrerProfil = (p: Profil) => {
      const maj = { ...p, maj_le: maintenant() };
      return optimiste((g) => ({ ...g, profil: maj }), () => depot.ecrireProfil(maj));
    };
    const enregistrerEssayage = (e: Essayage) =>
      optimiste((g) => ({ ...g, essayages: remplacer(g.essayages, e) }), () => depot.ecrireEssayage(e));
    const supprimerEssayage = (id: string) =>
      optimiste((g) => ({ ...g, essayages: g.essayages.filter((e) => e.id !== id) }), () => depot.supprimerEssayage(id));
    return {
      ...g,
      depot,
      chargement,
      erreur,
      derniers: derniersPorts(g.ports),
      compteurs: nombrePorts(g.ports),
      enregistrerVetement,
      supprimerVetement,
      enregistrerTenue,
      supprimerTenue,
      enregistrerPort,
      supprimerPort,
      enregistrerProfil,
      enregistrerEssayage,
      supprimerEssayage,
      recharger,
    };
  }, [g, depot, chargement, erreur, optimiste, recharger]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useDonnees(): Donnees {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDonnees hors de FournisseurDonnees");
  return c;
}

// ---------------------------------------------------------------- Photos

const urls = new Map<string, Promise<string | null>>();

/** Adresse affichable d'une photo stockée (gardée en mémoire pour la session). */
export function urlImage(depot: Depot, cle: string): Promise<string | null> {
  let p = urls.get(cle);
  if (!p) {
    p = depot
      .lireImage(cle)
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urls.set(cle, p);
    p.then((u) => {
      if (!u) urls.delete(cle);
    });
  }
  return p;
}

/** À appeler après avoir remplacé une photo sous la même clé. */
export function oublierImage(cle: string) {
  const p = urls.get(cle);
  urls.delete(cle);
  p?.then((u) => u && URL.revokeObjectURL(u));
}

export function useImage(cle: string | null | undefined): string | null {
  const { depot } = useDonnees();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let actif = true;
    if (!cle) {
      setUrl(null);
      return;
    }
    urlImage(depot, cle).then((u) => actif && setUrl(u));
    return () => {
      actif = false;
    };
  }, [cle, depot]);
  return url;
}

/** Proportions et repères (épaules, ceinture) d'une photo, pour la poser sur le mannequin. */
export interface Mesure {
  ratio: number;
  reperes: Reperes | null;
}

const mesures = new Map<string, Mesure>();

function mesurer(img: HTMLImageElement): Mesure {
  const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
  try {
    const [w, h] = img.naturalWidth >= img.naturalHeight ? [240, Math.max(1, Math.round(240 / ratio))] : [Math.max(1, Math.round(240 * ratio)), 240];
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ratio, reperes: null };
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3];
    return { ratio, reperes: reperesDepuisAlpha(alpha, w, h) };
  } catch {
    return { ratio, reperes: null };
  }
}

export function useMesure(url: string | null): Mesure | null {
  const [m, setM] = useState<Mesure | null>(url ? (mesures.get(url) ?? null) : null);
  useEffect(() => {
    if (!url) return setM(null);
    const connue = mesures.get(url);
    if (connue) return setM(connue);
    let actif = true;
    const img = new Image();
    img.onload = () => {
      const v = mesurer(img);
      mesures.set(url, v);
      if (actif) setM(v);
    };
    img.src = url;
    return () => {
      actif = false;
    };
  }, [url]);
  return m;
}
