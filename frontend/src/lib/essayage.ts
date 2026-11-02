// Essayage réaliste : une vraie photo de toi qui porte tes pièces.
//
// Deux moteurs :
//  * Hugging Face (par défaut, gratuit) : Leffa pose les pièces une à une sur ta
//    photo en pied, puis TRELLIS.2 peut en tirer un modèle 3D (voir hf.ts) ;
//  * FLUX.2 (payant, mode synchronisé), décrit ci-dessous.
//
// Ta photo en pied (profil) et les photos de tes pièces partent vers la fonction
// Edge « essayage », qui demande à FLUX.2 (Black Forest Labs) d'habiller la
// personne de la photo 1 avec les vêtements des photos suivantes, en gardant
// visage, silhouette, pose et décor. Ni Ollama ni Claude ne génèrent d'images :
// cette étape demande le mode synchronisé.
//
// La consigne est en anglais : c'est la langue où ces modèles d'image sont les
// plus fidèles. Rien de ce texte n'est montré dans l'app.

import { PLAN } from "./categories";
import type { Depot } from "./depot";
import { essayerPiece, ErreurHF, modele3D, typeEssai, type SuiviHF } from "./hf";
import { bitmapDe, imagePourIA, ratioDe, reduire, reduireEnJpeg } from "./images";
import { supabase } from "./supabase";
import { nouvelId, maintenant, type Essayage, type Profil, type Vetement } from "./types";

/** Le modèle accepte la personne + 7 photos de pièces au plus. */
export const PIECES_MAX = 7;

const EN: Record<Vetement["categorie"], string> = {
  haut: "top",
  bas: "bottoms (trousers, jeans, shorts or skirt)",
  robe: "dress or jumpsuit",
  veste: "jacket or coat, worn open or closed as in its photo",
  chaussures: "pair of shoes",
  sac: "bag, carried naturally",
  chapeau: "hat",
  lunettes: "glasses",
  echarpe: "scarf",
  bijoux: "jewellery or watch",
  ceinture: "belt",
  autre: "item",
};

const LONGUEUR_EN: Record<string, string> = {
  courte: "cropped",
  hanches: "hip length",
  cuisses: "mid-thigh length",
  genoux: "knee length",
  mollets: "mid-calf length",
  chevilles: "ankle length",
};

/** Pièces dans l'ordre où on les décrit (du vêtement principal aux accessoires), sans « autre ». */
export function piecesPourEssayage(pieces: Vetement[]): Vetement[] {
  const ordre = (v: Vetement) => (v.categorie === "veste" ? 25 : PLAN[v.categorie]);
  return pieces
    .filter((v) => v.categorie !== "autre" && (v.image || v.image_originale))
    .sort((a, b) => {
      const accA = PLAN[a.categorie] >= 50 ? 1 : 0;
      const accB = PLAN[b.categorie] >= 50 ? 1 : 0;
      return accA - accB || ordre(b) - ordre(a);
    })
    .slice(0, PIECES_MAX);
}

export function decrirePiece(v: Vetement): string {
  const details = [
    v.couleurs.map((c) => `${c.nom.toLowerCase()} ${c.hex}`).join(" and "),
    v.matiere,
    v.motif && v.motif !== "uni" ? v.motif : "",
    v.longueur ? LONGUEUR_EN[v.longueur] : "",
    v.marque ? `brand ${v.marque}` : "",
  ].filter(Boolean);
  return `the ${EN[v.categorie]} "${v.nom || v.sous_type}"${details.length ? ` (${details.join(", ")})` : ""}`;
}

/** Consigne envoyée au modèle d'image. */
export function consigneEssayage(pieces: Vetement[]): string {
  const liste = pieces.map((v, i) => `image ${i + 2} is ${decrirePiece(v)}`).join("; ");
  const robe = pieces.some((v) => v.categorie === "robe");
  const haut = pieces.some((v) => v.categorie === "haut" || robe);
  const bas = pieces.some((v) => v.categorie === "bas" || robe);
  const garder = [!haut ? "top" : "", !bas ? "bottoms" : "", !pieces.some((v) => v.categorie === "chaussures") ? "shoes" : ""].filter(Boolean);
  return [
    "Photorealistic full-body photograph of the same person as in image 1, now wearing the clothing items shown in the other images.",
    `Reference items: ${liste}.`,
    "Keep the person from image 1 exactly: face, identity, hairstyle, skin tone, body shape and proportions, height, pose, camera angle, lighting and background.",
    "Reproduce every item faithfully from its own photo: same colours, fabric texture, cut, fit, length, collar, buttons, pockets, pleats, stitching, labels and logos. Each item is worn naturally on the body, with realistic folds, drape, layering and shadows.",
    "The items replace whatever the person wears on the same body areas." + (garder.length ? ` Keep the person's own ${garder.join(" and ")}.` : ""),
    "Do not add any other clothing or accessories. Show the whole body from head to feet, sharp and natural, like a real photo.",
  ].join(" ");
}

/** Dimensions de sortie : proportions de ta photo, environ 1 mégapixel, multiples de 16. */
export function dimensions(ratio: number): { largeur: number; hauteur: number } {
  const r = Math.min(1.5, Math.max(0.5, ratio || 0.66));
  const aire = 1024 * 1024;
  const h = Math.sqrt(aire / r);
  const arrondi = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  return { largeur: arrondi(h * r), hauteur: arrondi(h) };
}

function base64VersBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return new Blob([o], { type });
}

export class EssayageImpossible extends Error {}

/** Génère, enregistre et renvoie l'essayage. */
export async function essayer(depot: Depot, profil: Profil, pieces: Vetement[]): Promise<Essayage> {
  if (depot.mode !== "cloud" || !supabase) {
    throw new EssayageImpossible("L'essayage réaliste demande le compte synchronisé : connecte-toi dans les Réglages.");
  }
  if (!profil.avatar.photo_pied) {
    throw new EssayageImpossible("Ajoute d'abord une photo de toi en pied, dans l'onglet Moi.");
  }
  const choisies = piecesPourEssayage(pieces);
  if (!choisies.length) throw new EssayageImpossible("Mets au moins une pièce sur le mannequin.");

  const photo = await depot.lireImage(profil.avatar.photo_pied);
  if (!photo) throw new EssayageImpossible("Ta photo en pied est introuvable. Ajoute-la de nouveau dans l'onglet Moi.");
  const images = await Promise.all(
    choisies.map(async (v) => {
      const b = await depot.lireImage((v.image ?? v.image_originale)!);
      if (!b) throw new EssayageImpossible(`La photo de « ${v.nom} » est introuvable.`);
      return imagePourIA(b, 1024);
    }),
  );
  const { largeur, hauteur } = dimensions(await ratioDe(photo));
  const { data, error } = await supabase.functions.invoke("essayage", {
    body: {
      personne: await imagePourIA(photo, 1280),
      pieces: images,
      consigne: consigneEssayage(choisies),
      largeur,
      hauteur,
    },
  });
  if (error) {
    let message = error.message;
    const contexte = (error as { context?: Response }).context;
    if (contexte && typeof contexte.json === "function") {
      try {
        message = ((await contexte.json()) as { erreur?: string }).erreur ?? message;
      } catch {
        /* réponse non JSON */
      }
    }
    if (/failed to send|fetch/i.test(message)) message = "Pas de connexion : l'essayage réaliste a besoin d'Internet.";
    throw new EssayageImpossible(message);
  }
  const r = data as { image: string; type?: string; modele?: string };
  const id = nouvelId();
  const cle = `essai-${id}.jpg`;
  await depot.ecrireImage(cle, base64VersBlob(r.image, r.type ?? "image/jpeg"));
  return { id, pieces: choisies.map((v) => v.id), image: cle, moteur: r.modele ?? "FLUX.2", cree_le: maintenant() };
}

/** Même ensemble de pièces (ordre indifférent). */
export const memesPieces = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ------------------------------------------------------------ Hugging Face

/** Pièces que Leffa sait poser, dans l'ordre des passages : robe ou bas, puis haut, puis veste par-dessus. */
export function piecesPourHF(pieces: Vetement[]): Vetement[] {
  const rang = (v: Vetement) => (v.categorie === "robe" ? 0 : v.categorie === "bas" ? 1 : v.categorie === "haut" ? 2 : 3);
  return pieces.filter((v) => typeEssai(v.categorie) && (v.image || v.image_originale)).sort((a, b) => rang(a) - rang(b));
}

/** Pièce détourée posée sur fond blanc (Leffa est entraîné sur des photos produit). */
async function surFondBlanc(source: Blob, max = 1024): Promise<Blob> {
  const bmp = await bitmapDe(source);
  const [w, h] = reduire(bmp.width, bmp.height, max);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new EssayageImpossible("Ton appareil ne peut pas préparer les photos.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new EssayageImpossible("Photo illisible."))), "image/jpeg", 0.92));
}

const pourErreur = (e: unknown, defaut: string) =>
  e instanceof EssayageImpossible ? e : new EssayageImpossible(e instanceof ErreurHF ? e.message : e instanceof Error ? e.message : defaut);

/** Habille ta photo en pied de la tenue, pièce par pièce, avec Leffa. */
export async function essayerHF(depot: Depot, profil: Profil, pieces: Vetement[], jeton: string, suivi?: SuiviHF): Promise<Essayage> {
  if (!profil.avatar.photo_pied) throw new EssayageImpossible("Ajoute d'abord une photo de toi en pied, dans l'onglet Moi.");
  const choisies = piecesPourHF(pieces);
  if (!choisies.length) throw new EssayageImpossible("Mets au moins un haut, un bas, une veste ou une robe sur le mannequin.");
  const photo = await depot.lireImage(profil.avatar.photo_pied);
  if (!photo) throw new EssayageImpossible("Ta photo en pied est introuvable. Ajoute-la de nouveau dans l'onglet Moi.");
  try {
    let personne = await reduireEnJpeg(photo, 1280, 0.92);
    for (const [i, v] of choisies.entries()) {
      const b = await depot.lireImage((v.image ?? v.image_originale)!);
      if (!b) throw new EssayageImpossible(`La photo de « ${v.nom} » est introuvable.`);
      const libelle = choisies.length > 1 ? `Pièce ${i + 1}/${choisies.length} : ${v.nom}` : v.nom;
      suivi?.(libelle);
      personne = await essayerPiece(personne, await surFondBlanc(b), typeEssai(v.categorie)!, jeton, suivi, libelle);
    }
    const id = nouvelId();
    const cle = `essai-${id}.${personne.type === "image/jpeg" ? "jpg" : personne.type === "image/webp" ? "webp" : "png"}`;
    await depot.ecrireImage(cle, personne.type.startsWith("image/") ? personne : new Blob([personne], { type: "image/png" }));
    return {
      id,
      pieces: pieces.filter((v) => v.categorie !== "autre").map((v) => v.id),
      image: cle,
      modele_3d: null,
      moteur: "Leffa (Hugging Face)",
      cree_le: maintenant(),
    };
  } catch (e) {
    throw pourErreur(e, "Essayage impossible pour le moment.");
  }
}

/** Tire un modèle 3D de la photo d'essayage, avec TRELLIS.2, et le range avec elle. */
export async function creer3D(depot: Depot, essai: Essayage, jeton: string, suivi?: SuiviHF): Promise<Essayage> {
  const photo = await depot.lireImage(essai.image);
  if (!photo) throw new EssayageImpossible("La photo d'essayage est introuvable.");
  try {
    const glb = await modele3D(photo, jeton, suivi);
    const cle = `essai-${essai.id}-${Date.now().toString(36)}.glb`;
    await depot.ecrireImage(cle, glb);
    if (essai.modele_3d) await depot.supprimerImage(essai.modele_3d).catch(() => {});
    return { ...essai, modele_3d: cle };
  } catch (e) {
    throw pourErreur(e, "La 3D n'a pas pu être créée.");
  }
}
