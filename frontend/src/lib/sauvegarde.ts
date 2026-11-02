// Sauvegarde complète (données + photos) dans un seul fichier JSON, et
// restauration. Sert aussi à passer du mode « Sur cet appareil » à un compte
// synchronisé : on exporte ici, on importe là-bas.

import type { Depot } from "./depot";
import { blobVersBase64 } from "./images";
import type { Garderobe } from "./types";

interface Fichier {
  app: "atelier_dressing";
  version: 1;
  exporte_le: string;
  donnees: Garderobe;
  images: Record<string, { type: string; data: string }>;
}

export async function exporter(depot: Depot, g: Garderobe, progression?: (fait: number, total: number) => void): Promise<Blob> {
  const cles = [
    ...g.vetements.flatMap((v) => [v.image, v.image_originale, v.image_dos]),
    ...g.essayages.flatMap((e) => [e.image, e.modele_3d]),
    g.profil.avatar.visage,
    g.profil.avatar.photo_pied,
  ].filter((c): c is string => !!c);
  const images: Fichier["images"] = {};
  let fait = 0;
  for (const cle of cles) {
    const b = await depot.lireImage(cle);
    if (b) images[cle] = { type: b.type, data: await blobVersBase64(b) };
    progression?.(++fait, cles.length);
  }
  const f: Fichier = { app: "atelier_dressing", version: 1, exporte_le: new Date().toISOString(), donnees: g, images };
  return new Blob([JSON.stringify(f)], { type: "application/json" });
}

function base64VersBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new Blob([octets], { type });
}

/** Ajoute (ou remplace, à identifiant égal) le contenu d'une sauvegarde. Renvoie le nombre de pièces. */
export async function importer(depot: Depot, fichier: Blob, progression?: (fait: number, total: number) => void): Promise<number> {
  let f: Fichier;
  try {
    f = JSON.parse(await fichier.text()) as Fichier;
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde d'atelier_Dressing.");
  }
  if (f.app !== "atelier_dressing" || !f.donnees) throw new Error("Ce fichier n'est pas une sauvegarde d'atelier_Dressing.");
  const { vetements, tenues, ports, profil } = f.donnees;
  const essayages = f.donnees.essayages ?? [];
  const total = Object.keys(f.images).length + vetements.length + tenues.length + ports.length + 1;
  let fait = 0;
  const avancer = () => progression?.(++fait, total);
  for (const [cle, img] of Object.entries(f.images)) {
    await depot.ecrireImage(cle, base64VersBlob(img.data, img.type));
    avancer();
  }
  for (const v of vetements) {
    await depot.ecrireVetement(v);
    avancer();
  }
  for (const t of tenues) {
    await depot.ecrireTenue(t);
    avancer();
  }
  for (const p of ports) {
    await depot.ecrirePort(p);
    avancer();
  }
  for (const e of essayages) await depot.ecrireEssayage(e);
  if (profil) await depot.ecrireProfil(profil);
  avancer();
  return vetements.length;
}
