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
import { REGLAGES_IA_DEFAUT, type ReglagesIA } from "./ia";
import { derniersPorts, nombrePorts } from "./suggestion";
import { maintenant, type Garderobe, type Port, type Profil, type Tenue, type Vetement } from "./types";

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
    return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? "{}") };
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
  recharger: () => Promise<void>;
}

const Ctx = createContext<Donnees | null>(null);

const VIDE: Garderobe = { vetements: [], tenues: [], ports: [], profil: profilVide() };

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

/** Proportions (largeur / hauteur) d'une photo, pour la poser sur le mannequin. */
const ratios = new Map<string, number>();
export function useRatio(url: string | null): number | null {
  const [r, setR] = useState<number | null>(url ? (ratios.get(url) ?? null) : null);
  useEffect(() => {
    if (!url) return setR(null);
    const connu = ratios.get(url);
    if (connu) return setR(connu);
    const img = new Image();
    img.onload = () => {
      const v = img.naturalWidth / Math.max(1, img.naturalHeight);
      ratios.set(url, v);
      setR(v);
    };
    img.src = url;
  }, [url]);
  return r;
}
