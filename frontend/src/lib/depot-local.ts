// Dépôt « Sur cet appareil » : tout dans IndexedDB, photos comprises.
// Fonctionne hors ligne et sans compte, avec Ollama pour l'IA.

import {
  depuisStockee,
  ecrire,
  effacer,
  lire,
  lireTout,
  ouvrirBase,
  versStockee,
  type Depot,
  type ImageStockee,
} from "./depot";
import { AVATAR_DEFAUT, maintenant, type Essayage, type Garderobe, type Port, type Profil, type Tenue, type Vetement } from "./types";

const PROFIL = "moi";

export function profilVide(): Profil {
  return { prenom: "", avatar: { ...AVATAR_DEFAUT }, maj_le: maintenant() };
}

export class DepotLocal implements Depot {
  readonly mode = "local" as const;
  private base: Promise<IDBDatabase>;

  constructor(nom = "atelier-dressing") {
    this.base = ouvrirBase(nom, ["vetements", "tenues", "ports", "profil", "images", "essayages"]);
    // Demande au navigateur de ne pas effacer les données en cas de manque de place
    if (typeof navigator !== "undefined") navigator.storage?.persist?.().catch(() => {});
  }

  async charger(): Promise<Garderobe> {
    const db = await this.base;
    const [vetements, tenues, ports, essayages, profil] = await Promise.all([
      lireTout<Vetement>(db, "vetements"),
      lireTout<Tenue>(db, "tenues"),
      lireTout<Port>(db, "ports"),
      lireTout<Essayage>(db, "essayages"),
      lire<Profil>(db, "profil", PROFIL),
    ]);
    const vide = profilVide();
    return {
      vetements: vetements.sort((a, b) => b.cree_le.localeCompare(a.cree_le)),
      tenues: tenues.sort((a, b) => b.cree_le.localeCompare(a.cree_le)),
      ports: ports.sort((a, b) => b.porte_le.localeCompare(a.porte_le)),
      essayages: essayages.sort((a, b) => b.cree_le.localeCompare(a.cree_le)),
      profil: profil ? { ...vide, ...profil, avatar: { ...vide.avatar, ...profil.avatar } } : vide,
    };
  }

  async ecrireVetement(v: Vetement) {
    await ecrire(await this.base, "vetements", v.id, v);
  }

  async supprimerVetement(id: string) {
    const db = await this.base;
    const v = await lire<Vetement>(db, "vetements", id);
    await effacer(db, "vetements", id);
    if (v?.image) await effacer(db, "images", v.image);
    if (v?.image_originale) await effacer(db, "images", v.image_originale);
    if (v?.image_dos) await effacer(db, "images", v.image_dos);
    // Comme le déclencheur SQL : la pièce disparaît des tenues
    for (const t of await lireTout<Tenue>(db, "tenues")) {
      if (t.pieces.includes(id)) await ecrire(db, "tenues", t.id, { ...t, pieces: t.pieces.filter((p) => p !== id) });
    }
  }

  async ecrireTenue(t: Tenue) {
    await ecrire(await this.base, "tenues", t.id, t);
  }

  async supprimerTenue(id: string) {
    const db = await this.base;
    await effacer(db, "tenues", id);
    for (const p of await lireTout<Port>(db, "ports")) {
      if (p.tenue_id === id) await ecrire(db, "ports", p.id, { ...p, tenue_id: null });
    }
  }

  async ecrirePort(p: Port) {
    await ecrire(await this.base, "ports", p.id, p);
  }

  async supprimerPort(id: string) {
    await effacer(await this.base, "ports", id);
  }

  async ecrireProfil(p: Profil) {
    await ecrire(await this.base, "profil", PROFIL, p);
  }

  async ecrireEssayage(e: Essayage) {
    await ecrire(await this.base, "essayages", e.id, e);
  }

  async supprimerEssayage(id: string) {
    const db = await this.base;
    const e = await lire<Essayage>(db, "essayages", id);
    await effacer(db, "essayages", id);
    if (e?.image) await effacer(db, "images", e.image);
  }

  async ecrireImage(cle: string, b: Blob) {
    await ecrire(await this.base, "images", cle, await versStockee(b));
  }

  async lireImage(cle: string) {
    return depuisStockee(await lire<ImageStockee | Blob>(await this.base, "images", cle));
  }

  async supprimerImage(cle: string) {
    await effacer(await this.base, "images", cle);
  }
}
