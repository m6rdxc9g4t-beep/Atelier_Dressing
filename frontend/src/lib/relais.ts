// Relais iPhone → Mac : l'iPhone (ou un navigateur) ne peut pas lancer la CLI Claude Code.
// Il dépose sa demande dans la table « ia_demandes » ; l'app Mac, ouverte et connectée au même
// compte, la prend, la passe à Claude avec ton abonnement, et écrit la réponse. L'app Mac
// signale qu'elle est là dans « ia_relais » (toutes les minutes).

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type TacheIA = "vetement" | "tenues" | "silhouette";

export interface DemandeRelais {
  tache: TacheIA;
  image?: { media_type: string; data: string };
  dressing?: string;
  contexte?: string;
  indice?: string;
}

const ATTENTE_MAX = 200_000;
const RELAIS_FRAIS = 150_000; // un Mac vu il y a moins de 2 min 30 est considéré présent

export interface EtatRelais {
  present: boolean;
  claude: boolean;
  appareil: string | null;
  vu_le: string | null;
}

let etatCache: { t: number; e: EtatRelais } | null = null;

/** Un Mac relais est-il ouvert, avec Claude prêt ? (gardé 30 s) */
export async function etatRelais(sb: SupabaseClient, forcer = false): Promise<EtatRelais> {
  if (!forcer && etatCache && Date.now() - etatCache.t < 30_000) return etatCache.e;
  const { data } = await sb.from("ia_relais").select("appareil, claude_ok, vu_le").order("vu_le", { ascending: false }).limit(1);
  const r = data?.[0] as { appareil: string; claude_ok: boolean; vu_le: string } | undefined;
  const present = !!r && Date.now() - new Date(r.vu_le).getTime() < RELAIS_FRAIS;
  const e: EtatRelais = { present, claude: present && !!r?.claude_ok, appareil: r?.appareil ?? null, vu_le: r?.vu_le ?? null };
  etatCache = { t: Date.now(), e };
  return e;
}

/** Côté iPhone : dépose la demande et attend la réponse du Mac. */
export async function demanderViaRelais(sb: SupabaseClient, d: DemandeRelais, modele: string): Promise<{ resultat: unknown; moteur: string }> {
  const { data, error } = await sb
    .from("ia_demandes")
    .insert({ tache: d.tache, entree: { image: d.image, dressing: d.dressing, contexte: d.contexte, indice: d.indice }, modele })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  let canal: RealtimeChannel | null = null;
  try {
    const fini = await new Promise<{ statut: string; resultat: unknown; erreur: string | null; moteur: string | null }>((ok, ko) => {
      const debut = Date.now();
      let actif = true;
      const verifier = async () => {
        if (!actif) return;
        const { data: r } = await sb.from("ia_demandes").select("statut, resultat, erreur, moteur").eq("id", id).maybeSingle();
        if (r && (r.statut === "fait" || r.statut === "erreur")) {
          actif = false;
          ok(r);
        } else if (Date.now() - debut > ATTENTE_MAX) {
          actif = false;
          ko(new Error("Ton Mac n'a pas répondu à temps. Vérifie qu'Atelier Dressing y est ouvert."));
        } else {
          setTimeout(verifier, 2500);
        }
      };
      canal = sb
        .channel("ia-demande-" + id)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ia_demandes", filter: `id=eq.${id}` }, () => verifier())
        .subscribe();
      setTimeout(verifier, 1500);
    });
    if (fini.statut === "erreur") throw new Error(fini.erreur ?? "Claude n'a pas pu répondre.");
    return { resultat: fini.resultat, moteur: fini.moteur ?? "Claude (via ton Mac)" };
  } finally {
    if (canal) sb.removeChannel(canal);
    sb.from("ia_demandes").delete().eq("id", id).then(() => {});
  }
}

/**
 * Côté Mac : signale sa présence et traite les demandes déposées par l'iPhone.
 * `traiter` pose la question à Claude par la CLI locale. Renvoie l'arrêt du relais.
 */
export function demarrerRelais(
  sb: SupabaseClient,
  userId: string,
  appareil: string,
  claudePret: () => Promise<boolean>,
  traiter: (d: DemandeRelais, modele: string) => Promise<{ resultat: unknown; moteur: string }>,
): () => void {
  let actif = true;
  const enCours = new Set<string>();

  const signaler = async () => {
    if (!actif) return;
    const claude_ok = await claudePret().catch(() => false);
    await sb.from("ia_relais").upsert({ user_id: userId, appareil, claude_ok, vu_le: new Date().toISOString() });
  };

  const prendre = async (id: string) => {
    if (!actif || enCours.has(id)) return;
    enCours.add(id);
    try {
      // Prise atomique : un seul Mac traite la demande
      const { data } = await sb
        .from("ia_demandes")
        .update({ statut: "en_cours" })
        .eq("id", id)
        .eq("statut", "en_attente")
        .select("id, tache, entree, modele")
        .maybeSingle();
      if (!data) return;
      const r = data as { tache: TacheIA; entree: Omit<DemandeRelais, "tache">; modele: string };
      try {
        const { resultat, moteur } = await traiter({ tache: r.tache, ...r.entree }, r.modele);
        await sb.from("ia_demandes").update({ statut: "fait", resultat, moteur: `${moteur} via ${appareil}` }).eq("id", id);
      } catch (e) {
        await sb.from("ia_demandes").update({ statut: "erreur", erreur: e instanceof Error ? e.message : String(e) }).eq("id", id);
      }
    } finally {
      enCours.delete(id);
    }
  };

  const enAttente = async () => {
    const { data } = await sb.from("ia_demandes").select("id").eq("statut", "en_attente").order("cree_le").limit(10);
    for (const r of (data ?? []) as { id: string }[]) await prendre(r.id);
  };

  const canal = sb
    .channel("ia-relais-" + userId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "ia_demandes", filter: `user_id=eq.${userId}` }, (p) => {
      const id = (p.new as { id?: string }).id;
      if (id) prendre(id);
    })
    .subscribe();

  // Ménage : demandes de plus d'un jour
  sb.from("ia_demandes").delete().lt("cree_le", new Date(Date.now() - 86_400_000).toISOString()).then(() => {});
  signaler();
  enAttente();
  const battement = setInterval(() => {
    signaler();
    enAttente(); // filet de sécurité si un événement temps réel s'est perdu
  }, 60_000);

  return () => {
    actif = false;
    clearInterval(battement);
    sb.removeChannel(canal);
    sb.from("ia_relais").update({ vu_le: new Date(0).toISOString() }).eq("user_id", userId).eq("appareil", appareil).then(() => {});
  };
}
