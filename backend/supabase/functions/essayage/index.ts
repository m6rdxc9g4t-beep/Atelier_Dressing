// atelier_Dressing — essayage réaliste (FLUX.2, Black Forest Labs)
//
// Reçoit ta photo en pied, les photos de tes pièces (détourées, sur fond blanc)
// et la consigne préparée par l'app (frontend/src/lib/essayage.ts). Demande à
// FLUX.2 d'habiller la personne de la photo 1 avec les pièces des photos
// suivantes, attend le résultat et le renvoie en base64 : l'app l'enregistre
// dans le bucket « dressing ».
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   BFL_API_KEY  clé API Black Forest Labs (obligatoire), https://dashboard.bfl.ai
//   BFL_MODEL    modèle (facultatif) : flux-2-pro par défaut ; flux-2-flex,
//                flux-2-max, flux-2-klein-9b ou flux-2-klein-4b (4 photos au plus)
//
// L'appel exige un utilisateur connecté (JWT vérifié par Supabase).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Image64 {
  media_type: string;
  data: string;
}

interface Demande {
  personne?: Image64;
  pieces?: Image64[];
  consigne?: string;
  largeur?: number;
  hauteur?: number;
}

const TAILLE_MAX = 7_000_000; // ~5 Mo par photo une fois décodée
const ATTENTE_MAX = 120_000;

const valide = (i: Image64 | undefined): i is Image64 =>
  !!i?.data && /^image\/(jpeg|png|webp)$/.test(i.media_type) && i.data.length <= TAILLE_MAX;

const multiple16 = (n: unknown, defaut: number) => {
  const v = Math.round(Number(n) / 16) * 16;
  return Number.isFinite(v) && v >= 256 && v <= 2048 ? v : defaut;
};

function erreur(message: string, status: number) {
  return Response.json({ erreur: message }, { status, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);

  try {
    const cle = Deno.env.get("BFL_API_KEY");
    if (!cle) {
      return erreur("L'essayage réaliste n'est pas configuré : ajoute le secret BFL_API_KEY (Black Forest Labs) dans Supabase.", 503);
    }
    if (!req.headers.get("Authorization")) return erreur("Connexion requise", 401);

    const d = (await req.json()) as Demande;
    if (!valide(d.personne)) return erreur("Ta photo en pied manque ou est trop lourde.", 400);
    const modele = Deno.env.get("BFL_MODEL") || "flux-2-pro";
    const maxPieces = modele.includes("klein") ? 3 : 7;
    const pieces = (d.pieces ?? []).filter(valide).slice(0, maxPieces);
    if (!pieces.length) return erreur("Envoie au moins une photo de pièce.", 400);
    const consigne = (d.consigne ?? "").trim().slice(0, 4000);
    if (!consigne) return erreur("Consigne manquante.", 400);

    const corps: Record<string, unknown> = {
      prompt: consigne,
      input_image: d.personne.data,
      width: multiple16(d.largeur, 832),
      height: multiple16(d.hauteur, 1248),
      output_format: "jpeg",
      safety_tolerance: 2,
    };
    pieces.forEach((p, i) => (corps[`input_image_${i + 2}`] = p.data));

    const envoi = await fetch(`https://api.bfl.ai/v1/${modele}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-key": cle },
      body: JSON.stringify(corps),
    });
    const tache = await envoi.json();
    if (!envoi.ok) {
      console.error(tache);
      if (envoi.status === 402) throw new Error("Plus de crédits sur le compte Black Forest Labs.");
      if (envoi.status === 401 || envoi.status === 403) throw new Error("Clé Black Forest Labs refusée : vérifie le secret BFL_API_KEY.");
      throw new Error(typeof tache?.detail === "string" ? tache.detail : `Erreur du service d'image (${envoi.status})`);
    }

    // On attend le résultat (souvent 10 à 40 secondes)
    const debut = Date.now();
    let sample: string | null = null;
    while (Date.now() - debut < ATTENTE_MAX) {
      await new Promise((r) => setTimeout(r, 1500));
      const etat = await (await fetch(tache.polling_url, { headers: { accept: "application/json", "x-key": cle } })).json();
      if (etat.status === "Ready") {
        sample = etat.result?.sample ?? null;
        break;
      }
      if (/moderated/i.test(etat.status ?? "")) throw new Error("Le service d'image a refusé cette photo (modération). Essaie une autre photo en pied.");
      if (etat.status === "Error" || etat.status === "Failed" || etat.status === "Task not found") {
        throw new Error("Le service d'image n'a pas pu générer l'essayage. Réessaie.");
      }
    }
    if (!sample) throw new Error("L'essayage prend trop de temps. Réessaie dans un instant.");

    // L'adresse du résultat expire vite : on renvoie l'image elle-même
    const image = await fetch(sample);
    if (!image.ok) throw new Error("Impossible de récupérer l'image générée.");
    const octets = new Uint8Array(await image.arrayBuffer());
    let bin = "";
    for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
    return Response.json(
      { image: btoa(bin), type: image.headers.get("content-type") || "image/jpeg", modele: `FLUX.2 (${modele})` },
      { headers: CORS },
    );
  } catch (err) {
    console.error(err);
    return erreur((err as Error).message, 500);
  }
});
