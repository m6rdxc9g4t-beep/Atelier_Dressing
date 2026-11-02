import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Mode « Synchronisé » : un projet Supabase (Postgres + stockage des photos +
// fonction IA Claude). La clé publiable est faite pour être embarquée dans
// l'app : les règles RLS protègent les données de chaque compte.
// Sans configuration, l'app fonctionne en mode « Sur cet appareil ».
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const cloudConfigure = !!(SUPABASE_URL && SUPABASE_KEY);

export const supabase: SupabaseClient | null = cloudConfigure
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const BUCKET = "dressing";

export function messageErreur(e: unknown): string {
  const msg =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(msg)) return "Confirme ton adresse avec le lien reçu par e-mail, puis reconnecte-toi.";
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (/password should be at least/i.test(msg)) return "Le mot de passe doit faire au moins 6 caractères.";
  if (/token has expired or is invalid|otp.*(expired|invalid)/i.test(msg))
    return "Ce code n'est pas bon ou a expiré. Vérifie le dernier e-mail reçu, ou demande un nouveau code.";
  if (/for security purposes|rate limit/i.test(msg))
    return "Trop de demandes d'affilée. Patiente une minute avant de redemander un code.";
  if (/same.*password|different from the old/i.test(msg)) return "Choisis un mot de passe différent de l'ancien.";
  if (/failed to fetch|network/i.test(msg)) return "Pas de connexion. Vérifie le réseau et réessaie.";
  if (/quota|exceeded/i.test(msg)) return "Plus de place pour les photos. Supprime des pièces archivées ou libère de l'espace.";
  return msg;
}
