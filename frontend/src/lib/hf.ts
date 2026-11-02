// Hugging Face : essayage virtuel et 3D gratuits, par les démos publiques (ZeroGPU).
//
//  * essayage : Leffa (franciszzj/Leffa, CVPR 2025) habille la personne d'une
//    photo avec la pièce d'une autre photo (haut, bas ou robe). Une pièce par
//    passage : la tenue se construit en plusieurs passages.
//  * 3D : TRELLIS.2 (microsoft/TRELLIS.2) transforme la photo d'essayage en
//    modèle 3D texturé (fichier GLB) que la Cabine fait tourner.
//
// L'app appelle ces démos directement (client Gradio), avec le jeton Hugging Face
// de l'utilisateur : c'est son quota GPU gratuit du jour qui est utilisé. Les
// photos passent par les serveurs de Hugging Face le temps du calcul.
//
// Paramètres vérifiés sur les API des démos (novembre 2026) : /leffa_predict_vt,
// /preprocess_image, /image_to_3d, /extract_glb.

import type { Client as ClientGradio, Status } from "@gradio/client";
import type { Categorie } from "./types";

export const ESPACE_ESSAYAGE = "franciszzj/Leffa";
export const ESPACE_3D = "microsoft/TRELLIS.2";
export const PAGE_JETONS = "https://huggingface.co/settings/tokens";

export type TypeEssai = "upper_body" | "lower_body" | "dresses";

/** Ce que Leffa sait poser : hauts et vestes, bas, robes. Le reste (chaussures, accessoires) n'est pas essayé. */
export function typeEssai(c: Categorie): TypeEssai | null {
  if (c === "haut" || c === "veste") return "upper_body";
  if (c === "bas") return "lower_body";
  if (c === "robe") return "dresses";
  return null;
}

export class ErreurHF extends Error {}

export const jetonValide = (j: string | undefined): j is `hf_${string}` => !!j && /^hf_[A-Za-z0-9]{20,}$/.test(j.trim());

/** Messages des démos traduits pour l'utilisateur. */
export function messageHF(brut: string): string {
  const m = brut || "";
  if (/quota/i.test(m)) {
    const attente = /(\d+):(\d+):(\d+)/.exec(m);
    const dans = attente ? ` Réessaie dans ${Number(attente[1])} h ${attente[2]} min.` : "";
    return `Ton quota GPU gratuit Hugging Face du jour est épuisé.${dans} Un compte Hugging Face PRO en donne huit fois plus.`;
  }
  if (/sleeping|paused|building|starting/i.test(m)) return "La démo Hugging Face démarre, réessaie dans une minute.";
  if (/401|unauthori|invalid.*token|token.*invalid/i.test(m)) return "Ton jeton Hugging Face est refusé : vérifie-le dans les Réglages.";
  if (/failed to fetch|network|load failed/i.test(m)) return "Pas de connexion avec Hugging Face.";
  return "Hugging Face n'a pas pu terminer : " + m.slice(0, 160);
}

export type SuiviHF = (texte: string) => void;

async function connecter(espace: string, jeton: string): Promise<ClientGradio> {
  if (!jetonValide(jeton)) throw new ErreurHF("Ajoute ton jeton Hugging Face (gratuit) dans les Réglages.");
  const { Client } = await import("@gradio/client");
  try {
    return await Client.connect(espace, { token: jeton.trim() as `hf_${string}`, events: ["data", "status"], record_history: false });
  } catch (e) {
    throw new ErreurHF(messageHF(e instanceof Error ? e.message : String(e)));
  }
}

/** Lance un appel et suit la file d'attente ; renvoie les données ou lève une ErreurHF lisible. */
async function appeler(client: ClientGradio, route: string, donnees: Record<string, unknown>, suivi?: SuiviHF, libelle = ""): Promise<unknown[]> {
  const tache = client.submit(route, donnees);
  try {
    for await (const m of tache) {
      if (m.type === "status") {
        const s = m as Status;
        if (s.stage === "error") throw new ErreurHF(messageHF(typeof s.message === "string" ? s.message : JSON.stringify(s.message ?? "")));
        if (s.stage === "pending" && s.position != null && s.position > 0) suivi?.(`${libelle} — ${s.position} personne${s.position > 1 ? "s" : ""} avant toi`);
        else if (s.stage === "pending") suivi?.(`${libelle} — en attente d'un GPU`);
        else if (s.stage === "generating") suivi?.(`${libelle} — calcul en cours`);
      } else if (m.type === "data") {
        return m.data as unknown[];
      }
    }
  } catch (e) {
    if (e instanceof ErreurHF) throw e;
    throw new ErreurHF(messageHF(e instanceof Error ? e.message : String(e)));
  }
  throw new ErreurHF("Hugging Face n'a rien renvoyé.");
}

interface DonneeFichier {
  url?: string;
  path?: string;
}

async function telechargerSortie(sortie: unknown, jeton: string): Promise<Blob> {
  const f = (Array.isArray(sortie) ? sortie[0] : sortie) as DonneeFichier | string | null;
  const url = typeof f === "string" ? f : f?.url;
  if (!url) throw new ErreurHF("Hugging Face n'a pas renvoyé de fichier.");
  let r = await fetch(url);
  if (r.status === 401 || r.status === 403) r = await fetch(url, { headers: { Authorization: `Bearer ${jeton.trim()}` } });
  if (!r.ok) throw new ErreurHF(`Téléchargement du résultat impossible (${r.status}).`);
  return r.blob();
}

/** Une pièce posée sur la personne. Renvoie la nouvelle photo (PNG). */
export async function essayerPiece(personne: Blob, piece: Blob, type: TypeEssai, jeton: string, suivi?: SuiviHF, libelle = "Essayage"): Promise<Blob> {
  const client = await connecter(ESPACE_ESSAYAGE, jeton);
  try {
    const { handle_file } = await import("@gradio/client");
    const sortie = await appeler(
      client,
      "/leffa_predict_vt",
      {
        src_image_path: handle_file(personne),
        ref_image_path: handle_file(piece),
        ref_acceleration: false,
        step: 30,
        scale: 2.5,
        seed: 42,
        // VITON-HD est le plus fidèle pour les hauts ; DressCode sait aussi faire les bas et les robes
        vt_model_type: type === "upper_body" ? "viton_hd" : "dress_code",
        vt_garment_type: type,
        vt_repaint: false,
      },
      suivi,
      libelle,
    );
    return await telechargerSortie(sortie[0], jeton);
  } finally {
    client.close();
  }
}

/** Photo (de préférence détourée, fond transparent) → modèle 3D GLB texturé. */
export async function modele3D(photo: Blob, jeton: string, suivi?: SuiviHF): Promise<Blob> {
  const client = await connecter(ESPACE_3D, jeton);
  try {
    const { handle_file } = await import("@gradio/client");
    suivi?.("3D — préparation de la photo");
    const pre = await appeler(client, "/preprocess_image", { input: handle_file(photo) }, suivi, "3D — préparation");
    // Même session : l'étape suivante reprend l'état gardé par la démo
    await appeler(
      client,
      "/image_to_3d",
      {
        image: pre[0],
        seed: 0,
        resolution: "1024",
        ss_guidance_strength: 7.5,
        ss_guidance_rescale: 0.7,
        ss_sampling_steps: 12,
        ss_rescale_t: 5,
        shape_slat_guidance_strength: 7.5,
        shape_slat_guidance_rescale: 0.5,
        shape_slat_sampling_steps: 12,
        shape_slat_rescale_t: 3,
        tex_slat_guidance_strength: 1,
        tex_slat_guidance_rescale: 0,
        tex_slat_sampling_steps: 12,
        tex_slat_rescale_t: 3,
      },
      suivi,
      "3D — volume et textures",
    );
    // Allégé pour le stockage (10 Mo par fichier) et l'iPhone
    const glb = await appeler(client, "/extract_glb", { decimation_target: 150000, texture_size: 2048 }, suivi, "3D — fichier");
    const b = await telechargerSortie(glb[0], jeton);
    return b.type === "model/gltf-binary" ? b : new Blob([b], { type: "model/gltf-binary" });
  } finally {
    client.close();
  }
}
