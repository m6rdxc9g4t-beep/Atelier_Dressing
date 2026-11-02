// Claude par la CLI Claude Code du Mac : ton abonnement Claude, sans clé API.
//
// Contrat de la suite Atelier (Atelier_Tab, docs/SUITE.md §5.3) : la commande est lancée par
// l'app Mac (src-tauri/src/claude.rs), isolée, sans aucun outil ; les consignes passent en
// prompt système, les données (photo, dressing) sur l'entrée standard en stream-json, et la
// réponse est contrainte par un schéma JSON. Ici : préparation de l'entrée et lecture de la sortie.

import { estTauri } from "./plateforme";

export type ModeleClaude = "sonnet" | "opus" | "haiku";
export const MODELES_CLAUDE: { v: ModeleClaude; l: string }[] = [
  { v: "sonnet", l: "Sonnet" },
  { v: "opus", l: "Opus" },
  { v: "haiku", l: "Haiku" },
];

export interface StatutClaude {
  disponible: boolean;
  connecte: boolean;
  version: string | null;
  message: string;
}

export class ErreurClaude extends Error {}

/** Un message utilisateur au format stream-json de Claude Code : texte, puis la photo éventuelle. */
export function entreeStreamJson(texte: string, image?: { media_type: string; data: string }): string {
  const content: unknown[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  content.push({ type: "text", text: texte });
  return JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
}

/** Sortie stream-json : la dernière ligne « result » porte la réponse structurée. */
export function lireReponse(sortie: string): unknown {
  let resultat: Record<string, unknown> | null = null;
  for (const ligne of sortie.trim().split("\n").reverse()) {
    try {
      const o = JSON.parse(ligne) as Record<string, unknown>;
      if (o && o.type === "result") {
        resultat = o;
        break;
      }
    } catch {
      /* ligne non JSON */
    }
  }
  if (!resultat) {
    try {
      resultat = JSON.parse(sortie) as Record<string, unknown>; // --output-format json
    } catch {
      throw new ErreurClaude(messageErreur(sortie.slice(-400) || "réponse vide"));
    }
  }
  if (resultat.is_error) throw new ErreurClaude(messageErreur(String(resultat.result ?? "erreur inconnue")));
  if (resultat.structured_output && typeof resultat.structured_output === "object") return resultat.structured_output;
  const texte = String(resultat.result ?? "");
  try {
    return JSON.parse(texte.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new ErreurClaude("Claude n'a pas répondu au format attendu. Réessaie.");
  }
}

/** Messages d'erreur de la CLI, en français. */
export function messageErreur(detail: string): string {
  const d = detail.toLowerCase();
  if (/log ?in|authenticat|not logged/.test(d)) return "Claude Code n'est connecté à aucun compte : lance « claude auth login » dans le Terminal du Mac.";
  if (/limit|quota|overloaded|rate/.test(d)) return "Limite de ton abonnement Claude atteinte (ou service saturé) : réessaie plus tard, ou utilise Ollama.";
  if (/unknown option|unrecognized/.test(d)) return "Ta CLI Claude Code est trop ancienne : lance « claude update » dans le Terminal.";
  return `Claude Code a renvoyé une erreur : ${detail.slice(0, 300)}`;
}

async function invoquer<T>(commande: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(commande, args);
}

let statutCache: { t: number; s: StatutClaude } | null = null;

/** CLI installée et connectée ? (sur l'app Mac seulement ; gardé 60 s) */
export async function statutClaude(forcer = false): Promise<StatutClaude> {
  if (!estTauri) return { disponible: false, connecte: false, version: null, message: "La CLI Claude Code tourne sur l'app Mac." };
  if (!forcer && statutCache && Date.now() - statutCache.t < 60_000) return statutCache.s;
  try {
    const s = await invoquer<StatutClaude>("claude_statut");
    statutCache = { t: Date.now(), s };
    return s;
  } catch (e) {
    return { disponible: false, connecte: false, version: null, message: String(e) };
  }
}

/** Pose la question à Claude par la CLI du Mac et renvoie la réponse structurée. */
export async function demanderClaude(
  consignes: string,
  schema: object,
  texte: string,
  modele: ModeleClaude,
  image?: { media_type: string; data: string },
): Promise<unknown> {
  if (!estTauri) throw new ErreurClaude("La CLI Claude Code tourne sur l'app Mac.");
  let sortie: string;
  try {
    sortie = await invoquer<string>("claude_demander", {
      demande: { consignes, schema: JSON.stringify(schema), entree: entreeStreamJson(texte, image), modele },
    });
  } catch (e) {
    throw new ErreurClaude(typeof e === "string" ? (/introuvable|n'est connecté|pas répondu/.test(e) ? e : messageErreur(e)) : String(e));
  }
  return lireReponse(sortie);
}
