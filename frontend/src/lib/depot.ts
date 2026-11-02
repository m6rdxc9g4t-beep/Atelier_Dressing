// Où vivent les données : deux dépôts au même contrat.
//
//  * local : IndexedDB, sur cet appareil (navigateur, iPhone ou app Mac), sans compte ;
//  * cloud : Supabase (tables + stockage des photos), synchronisé entre le Mac et l'iPhone.
//
// L'interface ne sait pas lequel elle utilise : FournisseurDonnees (donnees.tsx)
// reçoit l'un ou l'autre.

import type { Garderobe, Port, Profil, Tenue, Vetement } from "./types";

export interface Depot {
  readonly mode: "local" | "cloud";
  charger(): Promise<Garderobe>;
  ecrireVetement(v: Vetement): Promise<void>;
  supprimerVetement(id: string): Promise<void>;
  ecrireTenue(t: Tenue): Promise<void>;
  supprimerTenue(id: string): Promise<void>;
  ecrirePort(p: Port): Promise<void>;
  supprimerPort(id: string): Promise<void>;
  ecrireProfil(p: Profil): Promise<void>;
  ecrireImage(cle: string, b: Blob): Promise<void>;
  lireImage(cle: string): Promise<Blob | null>;
  supprimerImage(cle: string): Promise<void>;
  /** Prévient quand les données changent ailleurs (autre appareil). Renvoie la désinscription. */
  ecouter?(surChangement: () => void): () => void;
}

// ------------------------------------------------------- IndexedDB minimal

export type Magasin = "vetements" | "tenues" | "ports" | "profil" | "images";

export function ouvrirBase(nom: string, magasins: Magasin[]): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const req = indexedDB.open(nom, 1);
    req.onupgradeneeded = () => {
      for (const m of magasins) if (!req.result.objectStoreNames.contains(m)) req.result.createObjectStore(m);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error ?? new Error("Stockage local indisponible"));
  });
}

function attendre<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error ?? new Error("Erreur du stockage local"));
  });
}

export async function lireTout<T>(db: IDBDatabase, m: Magasin): Promise<T[]> {
  return attendre(db.transaction(m).objectStore(m).getAll() as IDBRequest<T[]>);
}

export async function lire<T>(db: IDBDatabase, m: Magasin, cle: string): Promise<T | undefined> {
  return attendre(db.transaction(m).objectStore(m).get(cle) as IDBRequest<T | undefined>);
}

export async function ecrire(db: IDBDatabase, m: Magasin, cle: string, valeur: unknown): Promise<void> {
  const tx = db.transaction(m, "readwrite");
  tx.objectStore(m).put(valeur, cle);
  await new Promise<void>((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(tx.error ?? new Error("Écriture impossible"));
    tx.onabort = () => ko(tx.error ?? new Error("Plus de place sur l'appareil"));
  });
}

export async function effacer(db: IDBDatabase, m: Magasin, cle: string): Promise<void> {
  const tx = db.transaction(m, "readwrite");
  tx.objectStore(m).delete(cle);
  await new Promise<void>((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(tx.error ?? new Error("Suppression impossible"));
  });
}

/** Les blobs passent mal dans IndexedDB sur certains Safari : on stocke les octets et le type. */
export interface ImageStockee {
  type: string;
  octets: ArrayBuffer;
}

export async function versStockee(b: Blob): Promise<ImageStockee> {
  return { type: b.type || "image/png", octets: await b.arrayBuffer() };
}

export function depuisStockee(s: ImageStockee | Blob | undefined): Blob | null {
  if (!s) return null;
  if (s instanceof Blob) return s;
  return new Blob([s.octets], { type: s.type });
}
