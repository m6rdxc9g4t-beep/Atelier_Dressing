// Moteur IA hybride d'atelier_Dressing, comme le reste de la suite Atelier
// (Atelier_Tab, docs/SUITE.md §5.2) : « Moteur : Auto · Ollama · Claude ».
//
//  * Ollama : sur le Mac (http://localhost:11434), hors ligne, gratuit ;
//  * Claude : la CLI Claude Code du Mac, avec ton abonnement Claude (pas de clé API).
//    Sur l'app Mac, elle est lancée directement (lib/claude.ts) ; sur l'iPhone ou dans un
//    navigateur, la demande passe par ton Mac, ouvert et connecté au même compte (lib/relais.ts) ;
//  * Auto : Claude s'il est disponible, sinon Ollama.
//
// Trois tâches : reconnaître un vêtement en photo, composer des tenues avec le
// dressing, et estimer ta silhouette sur une photo en pied pour le mannequin.

import { CATEGORIES, LONGUEURS, OCCASIONS, SAISONS } from "./categories";
import { demanderClaude, ErreurClaude, statutClaude, type ModeleClaude } from "./claude";
import { hexValide, nomCouleur, normaliserHex } from "./couleurs";
import { estTauri } from "./plateforme";
import { demanderViaRelais, etatRelais, type DemandeRelais } from "./relais";
import { supabase } from "./supabase";
import type { Ajustement, Avatar, Categorie, Couleur, Longueur, Occasion, Saison, Vetement } from "./types";

export type ModeIA = "auto" | "ollama" | "claude";

export interface ReglagesIA {
  modeIA: ModeIA;
  ollamaUrl: string;
  ollamaModele: string;
  ollamaModeleVision: string;
  modeleClaude: ModeleClaude;
}

export const REGLAGES_IA_DEFAUT: ReglagesIA = {
  modeIA: "auto",
  ollamaUrl: "http://localhost:11434",
  ollamaModele: "llama3.2",
  ollamaModeleVision: "llama3.2-vision",
  modeleClaude: "sonnet",
};

/** Anciens réglages (« local » / « cloud ») → moteurs de la suite. */
export function migrerModeIA(m: unknown): ModeIA {
  if (m === "local") return "ollama";
  if (m === "cloud") return "claude";
  return m === "ollama" || m === "claude" ? m : "auto";
}

export type Moteur = "ollama" | "claude" | "claude-relais";

/** Erreur à montrer telle quelle, avec la bascule proposée. */
export class IAIndisponible extends Error {
  readonly proposer: ModeIA | null;
  constructor(message: string, proposer: ModeIA | null) {
    super(message);
    this.proposer = proposer;
  }
}

export interface Image64 {
  media_type: string;
  data: string; // base64 sans préfixe
}

/** Ollama répond-il ? (délai maximal : 3 secondes) */
export async function ollamaDisponible(url: string, delai = 3000): Promise<boolean> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/api/tags", { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

// ---------------------------------------------------------------- Schémas

export const SCHEMA_VETEMENT = {
  type: "object",
  additionalProperties: false,
  required: ["nom", "categorie", "sous_type", "couleurs", "matiere", "motif", "saisons", "occasions", "style", "longueur", "chaleur", "marque", "reperes"],
  properties: {
    nom: { type: "string" },
    categorie: { type: "string", enum: CATEGORIES },
    sous_type: { type: "string" },
    couleurs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "hex"],
        properties: { nom: { type: "string" }, hex: { type: "string" } },
      },
    },
    matiere: { type: "string" },
    motif: { type: "string" },
    saisons: { type: "array", items: { type: "string", enum: SAISONS } },
    occasions: { type: "array", items: { type: "string", enum: OCCASIONS } },
    style: { type: "string" },
    longueur: { type: "string", enum: [...LONGUEURS, ""] },
    chaleur: { type: "integer" },
    marque: { type: "string" },
    reperes: {
      type: "object",
      additionalProperties: false,
      required: ["epaules_y", "epaule_gauche_x", "epaule_droite_x", "ceinture_y", "ceinture_gauche_x", "ceinture_droite_x", "ourlet_y"],
      properties: {
        epaules_y: { type: "number" },
        epaule_gauche_x: { type: "number" },
        epaule_droite_x: { type: "number" },
        ceinture_y: { type: "number" },
        ceinture_gauche_x: { type: "number" },
        ceinture_droite_x: { type: "number" },
        ourlet_y: { type: "number" },
      },
    },
  },
};

export const SCHEMA_TENUES = {
  type: "object",
  additionalProperties: false,
  required: ["tenues"],
  properties: {
    tenues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "pieces", "explication"],
        properties: {
          nom: { type: "string" },
          pieces: { type: "array", items: { type: "string" } },
          explication: { type: "string" },
        },
      },
    },
  },
};

export const SCHEMA_SILHOUETTE = {
  type: "object",
  additionalProperties: false,
  required: ["morphologie", "epaules", "poitrine", "tour_taille", "hanches", "jambes", "carnation", "cheveux_couleur", "cheveux_longueur"],
  properties: {
    morphologie: { type: "string", enum: ["feminine", "masculine", "neutre"] },
    epaules: { type: "number" },
    poitrine: { type: "number" },
    tour_taille: { type: "number" },
    hanches: { type: "number" },
    jambes: { type: "number" },
    carnation: { type: "string" },
    cheveux_couleur: { type: "string" },
    cheveux_longueur: { type: "string", enum: ["rase", "court", "mi_long", "long"] },
  },
};

export const CONSIGNES_VETEMENT = `Tu es l'assistant de l'application de garde-robe atelier_Dressing. On te montre la photo d'un vêtement ou d'un accessoire (souvent posé à plat ou sur un cintre). Réponds uniquement en JSON, en français.
- nom : court et parlant, comme sur une étiquette de dressing (« Chemise en lin blanche », « Jean droit brut », « Baskets cuir blanches »).
- categorie : haut (t-shirt, chemise, pull, sweat, top, débardeur), bas (pantalon, jean, short, jupe), robe (robe, combinaison), veste (veste, blazer, manteau, doudoune, trench), chaussures, sac, chapeau (casquette, bonnet), lunettes, echarpe (écharpe, foulard), bijoux (collier, montre, bracelet, boucles), ceinture, autre.
- sous_type : le type précis en minuscules (« chemise », « jupe midi », « baskets »).
- couleurs : 1 à 3 couleurs, de la plus présente à la moins présente, avec un nom simple (Noir, Blanc, Écru, Gris, Beige, Camel, Marron, Kaki, Vert, Bleu marine, Bleu, Denim, Rouge, Bordeaux, Rose, Orange, Jaune, Moutarde, Violet, Lilas, Doré, Argenté…) et son code hexadécimal #rrggbb fidèle à la photo.
- matiere : coton, lin, laine, cachemire, denim, cuir, synthétique, soie, maille… (chaîne vide si incertain).
- motif : uni, rayures, carreaux, fleurs, pois, imprimé, logo…
- saisons : les saisons où on la porte. occasions : quotidien, travail, soiree, sport, ceremonie, detente.
- style : en deux ou trois mots (« casual chic », « sportswear », « classique »).
- longueur (hauts, bas, robes, vestes seulement, sinon chaîne vide) : courte, hanches, cuisses, genoux, mollets, chevilles.
- chaleur : 1 très léger (débardeur en lin), 2 léger (t-shirt), 3 mi-saison (chemise, sweat fin), 4 chaud (pull en laine), 5 très chaud (doudoune).
- marque : seulement si elle est lisible sur la photo, sinon chaîne vide.
- reperes : où se trouvent, SUR CETTE PHOTO, les points qui servent à l'ajuster sur un corps. Coordonnées en fractions de la photo entière : x de 0 (bord gauche) à 1 (bord droit), y de 0 (haut) à 1 (bas). Utilise -1 pour ce qui n'existe pas.
  • hauts, vestes, robes : epaules_y = hauteur des coutures d'épaule (là où la manche rejoint le corps du vêtement) ; epaule_gauche_x et epaule_droite_x = position de ces deux coutures. Ceinture à -1.
  • bas : ceinture_y = haut de la ceinture ; ceinture_gauche_x et ceinture_droite_x = ses deux bords. Épaules à -1.
  • ourlet_y = bas du vêtement (le bas du corps du vêtement, pas des manches).
  • accessoires et chaussures : tout à -1.`;

export const CONSIGNES_TENUES = `Tu es le styliste personnel de l'application atelier_Dressing. On te donne le dressing (une pièce par ligne : identifiant, catégorie, nom, couleurs, chaleur de 1 à 5, saisons, occasions, jours depuis le dernier port) et le contexte (météo, occasion, envie). Propose jusqu'à 3 tenues complètes et différentes, en JSON, en français.
Règles :
- Utilise UNIQUEMENT les identifiants fournis, recopiés à l'identique.
- Une tenue = un haut + un bas, OU une robe ; plus des chaussures si possible ; une veste s'il fait moins de 17 °C ou s'il pleut ; un ou deux accessoires au plus.
- Respecte la météo (chaleur des pièces) et l'occasion. Accorde les couleurs : des neutres et une couleur forte au plus, ou un camaïeu.
- Fais ressortir des pièces peu portées quand c'est possible.
- nom : un titre court et joyeux (« Lin et sneakers », « Chic décontracté »). explication : une ou deux phrases qui disent pourquoi ça marche aujourd'hui.`;

export const CONSIGNES_SILHOUETTE = `Tu aides à créer un mannequin numérique qui ressemble à la personne de la photo (en pied, de face). Réponds uniquement en JSON.
- morphologie : feminine, masculine ou neutre (silhouette générale, pas de jugement).
- epaules, poitrine, tour_taille, hanches : proportions relatives entre 0.85 et 1.2 (1 = moyenne pour cette morphologie).
- jambes : longueur relative des jambes entre 0.92 et 1.08.
- carnation : couleur de peau en #rrggbb. cheveux_couleur : en #rrggbb. cheveux_longueur : rase, court, mi_long ou long.
Reste bienveillant et neutre : ce sont des réglages de mannequin, pas une évaluation.`;

// ---------------------------------------------------------------- Normalisation

export interface AnalyseVetement {
  nom: string;
  categorie: Categorie;
  sous_type: string;
  couleurs: Couleur[];
  matiere: string;
  motif: string;
  saisons: Saison[];
  occasions: Occasion[];
  style: string;
  longueur: Longueur | null;
  chaleur: number;
  marque: string;
  /** Repères pour ajuster la pièce sur le corps (null si absents ou peu plausibles). */
  ajustement: Ajustement | null;
}

const texte = (v: unknown, max = 80): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const dans = <T extends string>(v: unknown, liste: readonly T[]): T | null =>
  typeof v === "string" && (liste as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as T) : null;
const majuscule = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Nettoie la réponse de l'IA : l'app reçoit toujours le même format, quel que soit le moteur. */
export function normaliserAnalyse(brut: unknown): AnalyseVetement {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const categorie = dans(o.categorie, CATEGORIES) ?? "autre";
  const couleurs: Couleur[] = (Array.isArray(o.couleurs) ? o.couleurs : [])
    .map((c) => {
      const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const hex = typeof x.hex === "string" && hexValide(x.hex) ? normaliserHex(x.hex) : null;
      const nom = majuscule(texte(x.nom, 30));
      if (!hex && !nom) return null;
      return { nom: nom || nomCouleur(hex!), hex: hex ?? "#888888" };
    })
    .filter((c): c is Couleur => !!c)
    .slice(0, 3);
  const liste = <T extends string>(v: unknown, l: readonly T[]) =>
    [...new Set((Array.isArray(v) ? v : []).map((x) => dans(x, l)).filter((x): x is T => !!x))];
  const chaleur = Math.round(Number(o.chaleur));
  return {
    nom: majuscule(texte(o.nom, 60)),
    categorie,
    sous_type: texte(o.sous_type, 40).toLowerCase(),
    couleurs,
    matiere: texte(o.matiere, 40).toLowerCase(),
    motif: texte(o.motif, 30).toLowerCase() || "uni",
    saisons: liste(o.saisons, SAISONS),
    occasions: liste(o.occasions, OCCASIONS),
    style: texte(o.style, 40).toLowerCase(),
    longueur: dans(o.longueur, LONGUEURS),
    chaleur: Number.isFinite(chaleur) ? Math.min(5, Math.max(1, chaleur)) : 2,
    marque: texte(o.marque, 40),
    ajustement: normaliserAjustement(o.reperes, categorie),
  };
}

/** Repères de l'IA → ajustement, seulement s'ils sont plausibles (sinon la photo est mesurée). */
export function normaliserAjustement(brut: unknown, categorie: Categorie): Ajustement | null {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  };
  const segment = (y: string, g: string, d: string, yMax: number) => {
    const [vy, vg, vd] = [n(y), n(g), n(d)];
    if (vy == null || vg == null || vd == null) return undefined;
    const [gauche, droite] = vg < vd ? [vg, vd] : [vd, vg];
    // Largeur raisonnable, segment à peu près centré, à la bonne hauteur
    if (droite - gauche < 0.15 || Math.abs((gauche + droite) / 2 - 0.5) > 0.2 || vy > yMax) return undefined;
    return { y: vy, gauche, droite };
  };
  const aj: Ajustement = {};
  if (categorie === "haut" || categorie === "veste" || categorie === "robe") aj.epaules = segment("epaules_y", "epaule_gauche_x", "epaule_droite_x", 0.45);
  if (categorie === "bas") aj.ceinture = segment("ceinture_y", "ceinture_gauche_x", "ceinture_droite_x", 0.25);
  const ourlet = n("ourlet_y");
  if (ourlet != null && ourlet > 0.4) aj.ourlet = ourlet;
  if (!aj.epaules) delete aj.epaules;
  if (!aj.ceinture) delete aj.ceinture;
  return aj.epaules || aj.ceinture ? aj : null;
}

export interface TenueIA {
  nom: string;
  pieces: string[];
  explication: string;
}

export function normaliserTenues(brut: unknown, idsConnus: Set<string>): TenueIA[] {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  return (Array.isArray(o.tenues) ? o.tenues : [])
    .map((t) => {
      const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      const pieces = (Array.isArray(x.pieces) ? x.pieces : []).filter((id): id is string => typeof id === "string" && idsConnus.has(id));
      return { nom: majuscule(texte(x.nom, 60)) || "Tenue du jour", pieces: [...new Set(pieces)], explication: texte(x.explication, 300) };
    })
    .filter((t) => t.pieces.length >= 2)
    .slice(0, 3);
}

export function normaliserSilhouette(brut: unknown): Partial<Avatar> {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const proportion = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 100) / 100 : 1;
  };
  const r: Partial<Avatar> = {
    epaules: proportion(o.epaules, 0.85, 1.2),
    poitrine: proportion(o.poitrine, 0.85, 1.2),
    tour_taille: proportion(o.tour_taille, 0.85, 1.25),
    hanches: proportion(o.hanches, 0.85, 1.25),
    jambes: proportion(o.jambes, 0.92, 1.08),
  };
  const m = dans(o.morphologie, ["feminine", "masculine", "neutre"] as const);
  if (m) r.morphologie = m;
  if (typeof o.carnation === "string" && hexValide(o.carnation)) r.carnation = normaliserHex(o.carnation);
  if (typeof o.cheveux_couleur === "string" && hexValide(o.cheveux_couleur)) r.cheveux_couleur = normaliserHex(o.cheveux_couleur);
  const l = dans(o.cheveux_longueur, ["rase", "court", "mi_long", "long"] as const);
  if (l) r.cheveux_longueur = l;
  return r;
}

/** Résumé du dressing envoyé à l'IA (une ligne par pièce, sans photo). */
export function resumeDressing(vetements: Vetement[], derniers: Map<string, string>, aujourdhui = new Date()): string {
  return vetements
    .filter((v) => !v.archive && v.categorie !== "autre")
    .map((v) => {
      const d = derniers.get(v.id);
      const jours = d ? Math.round((aujourdhui.getTime() - new Date(d + "T12:00:00").getTime()) / 86_400_000) : "jamais";
      return [
        v.id,
        v.categorie,
        v.nom || v.sous_type,
        v.couleurs.map((c) => c.nom).join("/") || "?",
        `chaleur ${v.chaleur}`,
        v.saisons.join("/") || "toutes saisons",
        v.occasions.join("/") || "toutes occasions",
        `porté il y a ${jours}${typeof jours === "number" ? " j" : ""}`,
      ].join(" | ");
    })
    .join("\n");
}

// ---------------------------------------------------------------- Moteurs

type Tache = DemandeRelais["tache"];
type Demande = DemandeRelais;

const SCHEMAS: Record<Tache, object> = { vetement: SCHEMA_VETEMENT, tenues: SCHEMA_TENUES, silhouette: SCHEMA_SILHOUETTE };
const CONSIGNES: Record<Tache, string> = { vetement: CONSIGNES_VETEMENT, tenues: CONSIGNES_TENUES, silhouette: CONSIGNES_SILHOUETTE };

function messageUtilisateur(d: Demande): string {
  if (d.tache === "tenues") return `Contexte : ${d.contexte}\n\nDressing :\n${d.dressing}`;
  if (d.tache === "silhouette") return "Voici la photo en pied.";
  return `Voici la photo du vêtement.${d.indice ? ` Couleurs mesurées sur la photo : ${d.indice}.` : ""}`;
}

async function viaOllama(d: Demande, r: ReglagesIA): Promise<unknown> {
  const modele = d.image ? r.ollamaModeleVision : r.ollamaModele;
  let reponse: Response;
  try {
    reponse = await fetch(r.ollamaUrl.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modele,
        stream: false,
        format: SCHEMAS[d.tache],
        options: { temperature: d.tache === "tenues" ? 0.7 : 0 },
        messages: [
          { role: "system", content: CONSIGNES[d.tache] },
          d.image
            ? { role: "user", content: messageUtilisateur(d), images: [d.image.data] }
            : { role: "user", content: messageUtilisateur(d) },
        ],
      }),
    });
  } catch {
    throw new IAIndisponible("Ollama ne répond pas. Lance l'app Ollama sur ce Mac, ou choisis Claude.", "claude");
  }
  if (!reponse.ok) {
    const corps = await reponse.text();
    if (/not found/i.test(corps)) {
      throw new IAIndisponible(`Le modèle « ${modele} » n'est pas installé. Dans le Terminal : ollama pull ${modele}`, "claude");
    }
    throw new Error(`Ollama a répondu ${reponse.status}`);
  }
  const json = (await reponse.json()) as { message?: { content?: string } };
  return JSON.parse(json.message?.content ?? "{}");
}

/** Claude par la CLI du Mac (sert aussi au relais, quand la demande vient de l'iPhone). */
export async function viaClaudeLocal(d: Demande, modele: ModeleClaude): Promise<unknown> {
  try {
    return await demanderClaude(CONSIGNES[d.tache], SCHEMAS[d.tache], messageUtilisateur(d), modele, d.image);
  } catch (e) {
    if (e instanceof ErreurClaude) throw new IAIndisponible(e.message, "ollama");
    throw e;
  }
}

async function viaRelais(d: Demande, modele: ModeleClaude): Promise<unknown> {
  if (!supabase) throw new IAIndisponible("Claude depuis l'iPhone passe par ton Mac : connecte-toi à ton compte.", null);
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new IAIndisponible("Claude depuis l'iPhone passe par ton Mac : connecte-toi à ton compte.", null);
  const e = await etatRelais(supabase);
  if (!e.present) {
    throw new IAIndisponible("Pour utiliser ton forfait Claude ici, ouvre Atelier Dressing sur ton Mac (connecté au même compte), puis réessaie.", null);
  }
  if (!e.claude) throw new IAIndisponible(`Claude Code n'est pas prêt sur ${e.appareil ?? "ton Mac"} : lance « claude auth login » dans son Terminal.`, null);
  try {
    return (await demanderViaRelais(supabase, d, modele)).resultat;
  } catch (err) {
    throw new IAIndisponible(err instanceof Error ? err.message : String(err), null);
  }
}

/** Claude est-il utilisable d'ici ? (CLI du Mac, ou Mac relais présent) */
export async function claudeDisponible(): Promise<boolean> {
  if (estTauri) return (await statutClaude()).disponible;
  if (!supabase) return false;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return false;
  return (await etatRelais(supabase).catch(() => null))?.claude ?? false;
}

async function choisirMoteur(r: ReglagesIA): Promise<Moteur> {
  const claude: Moteur = estTauri ? "claude" : "claude-relais";
  if (r.modeIA === "ollama") return "ollama";
  if (r.modeIA === "claude") return claude;
  return (await claudeDisponible()) ? claude : "ollama";
}

async function executer(d: Demande, r: ReglagesIA): Promise<{ brut: unknown; moteur: Moteur }> {
  const moteur = await choisirMoteur(r);
  if (moteur === "ollama") {
    if (!(await ollamaDisponible(r.ollamaUrl))) {
      throw new IAIndisponible(
        r.modeIA === "auto"
          ? "Ni Claude ni Ollama ne sont disponibles. Ouvre Atelier Dressing sur ton Mac (Claude), ou lance Ollama."
          : "Ollama ne répond pas sur " + r.ollamaUrl + ". Lance l'app Ollama, ou choisis Claude.",
        r.modeIA === "auto" ? null : "claude",
      );
    }
    return { brut: await viaOllama(d, r), moteur };
  }
  if (moteur === "claude") return { brut: await viaClaudeLocal(d, r.modeleClaude), moteur };
  return { brut: await viaRelais(d, r.modeleClaude), moteur };
}

export async function analyserVetement(image: Image64, r: ReglagesIA, indice?: string) {
  const { brut, moteur } = await executer({ tache: "vetement", image, indice }, r);
  return { analyse: normaliserAnalyse(brut), moteur };
}

export async function proposerTenuesIA(dressing: string, contexte: string, ids: Set<string>, r: ReglagesIA) {
  const { brut, moteur } = await executer({ tache: "tenues", dressing, contexte }, r);
  return { tenues: normaliserTenues(brut, ids), moteur };
}

export async function analyserSilhouette(image: Image64, r: ReglagesIA) {
  const { brut, moteur } = await executer({ tache: "silhouette", image }, r);
  return { avatar: normaliserSilhouette(brut), moteur };
}

export const NOM_MOTEUR: Record<Moteur, string> = {
  ollama: "Ollama (local)",
  claude: "Claude (ton forfait)",
  "claude-relais": "Claude (ton forfait, via ton Mac)",
};
