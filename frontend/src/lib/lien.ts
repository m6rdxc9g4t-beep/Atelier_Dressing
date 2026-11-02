// Photos d'une pièce depuis le lien de la boutique : la fonction Edge « importer-lien »
// lit la page du produit (le navigateur ne le peut pas) et renvoie ses photos.

import { detourer } from "./detourage";
import { pixelsVersBlob, reduireEnJpeg, versPixels } from "./images";
import { supabase } from "./supabase";

export class LienImpossible extends Error {}

async function appeler<T>(corps: Record<string, string>): Promise<T> {
  if (!supabase) throw new LienImpossible("L'import par lien demande le compte synchronisé : connecte-toi dans les Réglages.");
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new LienImpossible("L'import par lien demande le compte synchronisé : connecte-toi dans les Réglages.");
  const { data, error } = await supabase.functions.invoke("importer-lien", { body: corps });
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
    if (/failed to send|fetch/i.test(message)) message = "Pas de connexion : l'import par lien a besoin d'Internet.";
    throw new LienImpossible(message);
  }
  return data as T;
}

export function chercherPhotos(url: string): Promise<{ titre: string; images: string[] }> {
  return appeler({ url: url.trim() });
}

export async function telechargerPhoto(url: string): Promise<Blob> {
  const r = await appeler<{ media_type: string; data: string }>({ image: url });
  const bin = atob(r.data);
  const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return new Blob([o], { type: r.media_type });
}

/** Photo de dos prête pour la 3D : détourée si le fond s'y prête, sinon la photo allégée. */
export async function preparerDos(source: Blob): Promise<Blob> {
  const r = detourer(await versPixels(source, 900));
  return r.fiable ? pixelsVersBlob(r.pixels) : reduireEnJpeg(source, 1200);
}
