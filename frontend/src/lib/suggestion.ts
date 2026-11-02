// Composer une tenue sans IA : météo, occasion, saison, harmonie des couleurs et
// rotation (on ressort ce qu'on n'a pas porté depuis longtemps).
// Sert de repli quand ni Ollama ni Claude ne répondent, et de base aux
// propositions de l'IA (elle reçoit le même filtrage).

import { harmonie } from "./couleurs";
import { saisonDuJour } from "./categories";
import type { Categorie, Occasion, Port, Saison, Vetement } from "./types";

export interface Contexte {
  temperature: number | null; // °C
  pluie?: boolean;
  occasion: Occasion | null;
  saison?: Saison;
  /** Pièces à garder absolument (choisies en cabine). */
  imposees?: string[];
  /** Graine du tirage (même graine = même tenue). */
  graine?: number;
}

export interface Proposition {
  pieces: string[];
  raisons: string[];
  score: number;
}

/** Chaleur visée (1 à 5) selon la température ressentie. */
export function chaleurVisee(t: number | null): number {
  if (t == null) return 3;
  if (t >= 25) return 1;
  if (t >= 19) return 2;
  if (t >= 13) return 3;
  if (t >= 6) return 4;
  return 5;
}

/** Faut-il une veste ou un manteau ? */
export function besoinVeste(t: number | null, pluie = false): boolean {
  return pluie || (t != null && t < 17);
}

/** Dernière date de port de chaque pièce. */
export function derniersPorts(ports: Port[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of ports) {
    for (const id of p.pieces) {
      const d = m.get(id);
      if (!d || p.porte_le > d) m.set(id, p.porte_le);
    }
  }
  return m;
}

export function nombrePorts(ports: Port[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of ports) for (const id of p.pieces) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

const joursDepuis = (date: string | undefined, aujourdhui: Date): number =>
  date ? Math.max(0, Math.round((aujourdhui.getTime() - new Date(date + "T12:00:00").getTime()) / 86_400_000)) : 365;

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Note d'une pièce pour le contexte (0 = à exclure). */
export function notePiece(v: Vetement, ctx: Contexte, dernier: string | undefined, aujourdhui = new Date()): number {
  if (v.archive) return 0;
  const saison = ctx.saison ?? saisonDuJour(aujourdhui);
  let note = 1;
  if (v.saisons.length && !v.saisons.includes(saison)) note *= 0.35;
  if (ctx.occasion && v.occasions.length && !v.occasions.includes(ctx.occasion)) note *= 0.25;
  const vise = chaleurVisee(ctx.temperature);
  // La veste se juge à part ; pour le reste, on vise la bonne chaleur.
  if (v.categorie !== "veste") note *= 1 - Math.min(0.8, Math.abs((v.chaleur || 3) - vise) * 0.22);
  else note *= 1 - Math.min(0.7, Math.max(0, vise - 1 - (v.chaleur || 3)) * 0.25);
  // Rotation : bonus jusqu'à +50 % pour une pièce pas portée depuis 30 jours
  note *= 1 + Math.min(30, joursDepuis(dernier, aujourdhui)) / 60;
  if (v.favori) note *= 1.15;
  return note;
}

function tirer<T>(elements: { el: T; note: number }[], alea: () => number): T | null {
  const valides = elements.filter((e) => e.note > 0);
  if (!valides.length) return null;
  // On tire parmi les 4 meilleures, pondéré par la note (évite toujours la même)
  const meilleures = [...valides].sort((a, b) => b.note - a.note).slice(0, 4);
  const total = meilleures.reduce((s, e) => s + e.note, 0);
  let r = alea() * total;
  for (const e of meilleures) {
    r -= e.note;
    if (r <= 0) return e.el;
  }
  return meilleures[0].el;
}

/** Propose une tenue complète à partir du dressing. */
export function proposerTenue(vetements: Vetement[], ports: Port[], ctx: Contexte, aujourdhui = new Date()): Proposition | null {
  const derniers = derniersPorts(ports);
  const alea = hasard(ctx.graine ?? Date.now());
  const parCategorie = (c: Categorie) =>
    vetements
      .filter((v) => v.categorie === c)
      .map((v) => ({ el: v, note: notePiece(v, ctx, derniers.get(v.id), aujourdhui) }));
  const imposees = vetements.filter((v) => ctx.imposees?.includes(v.id));
  const imposee = (c: Categorie) => imposees.find((v) => v.categorie === c) ?? null;

  let meilleure: Proposition | null = null;
  // Plusieurs tirages, on garde la tenue la plus harmonieuse
  for (let essai = 0; essai < 12; essai++) {
    const choix: Vetement[] = [];
    const raisons: string[] = [];
    const robes = parCategorie("robe");
    const robeImposee = imposee("robe");
    const avecRobe =
      !!robeImposee ||
      (!imposee("haut") && !imposee("bas") && robes.some((r) => r.note > 0.4) && alea() < (ctx.occasion === "soiree" || ctx.occasion === "ceremonie" ? 0.6 : 0.3));
    if (avecRobe) {
      const r = robeImposee ?? tirer(robes, alea);
      if (r) choix.push(r);
    }
    if (!choix.some((v) => v.categorie === "robe")) {
      const h = imposee("haut") ?? tirer(parCategorie("haut"), alea);
      const b = imposee("bas") ?? tirer(parCategorie("bas"), alea);
      if (h) choix.push(h);
      if (b) choix.push(b);
    }
    if (!choix.length) return null;
    const chaussures = imposee("chaussures") ?? tirer(parCategorie("chaussures"), alea);
    if (chaussures) choix.push(chaussures);
    if (besoinVeste(ctx.temperature, ctx.pluie) || imposee("veste")) {
      const veste = imposee("veste") ?? tirer(parCategorie("veste"), alea);
      if (veste) {
        choix.push(veste);
        raisons.push(ctx.pluie ? "Une veste contre la pluie." : `Une veste : il fait ${ctx.temperature} °C.`);
      }
    }
    if (ctx.temperature != null && ctx.temperature < 8) {
      const echarpe = imposee("echarpe") ?? tirer(parCategorie("echarpe"), alea);
      if (echarpe) choix.push(echarpe);
    }
    // Un accessoire, pour la touche finale
    for (const c of ["sac", "ceinture", "bijoux", "lunettes", "chapeau"] as Categorie[]) {
      const im = imposee(c);
      if (im) choix.push(im);
    }
    if (!choix.some((v) => v.categorie === "sac")) {
      const sac = tirer(parCategorie("sac"), alea);
      if (sac && alea() < 0.6) choix.push(sac);
    }
    if (ctx.temperature != null && ctx.temperature >= 22 && !choix.some((v) => v.categorie === "lunettes")) {
      const l = tirer(parCategorie("lunettes"), alea);
      if (l) choix.push(l);
    }

    const h = harmonie(choix.filter((v) => v.couleurs.length).map((v) => v.couleurs));
    const moyenne = choix.reduce((s, v) => s + notePiece(v, ctx, derniers.get(v.id), aujourdhui), 0) / choix.length;
    const score = moyenne * (0.4 + 0.6 * h);
    if (!meilleure || score > meilleure.score) {
      const r = [...raisons];
      if (h >= 0.95) r.push("Des couleurs qui s'accordent.");
      const oubliee = choix
        .map((v) => ({ v, j: joursDepuis(derniers.get(v.id), aujourdhui) }))
        .filter((x) => x.j >= 21 && x.j < 365)
        .sort((a, b) => b.j - a.j)[0];
      if (oubliee) r.push(`${oubliee.v.nom || "Une pièce"} n'est pas sortie depuis ${oubliee.j} jours.`);
      meilleure = { pieces: choix.map((v) => v.id), raisons: r, score };
    }
  }
  return meilleure;
}

/** Retire de la liste les pièces incompatibles (robe + haut, deux paires de chaussures…). */
export function nettoyerTenue(ids: string[], vetements: Vetement[]): string[] {
  const vues = new Set<Categorie>();
  const garde: string[] = [];
  const parId = new Map(vetements.map((v) => [v.id, v]));
  const pieces = ids.map((id) => parId.get(id)).filter((v): v is Vetement => !!v);
  const aRobe = pieces.some((v) => v.categorie === "robe");
  for (const v of pieces) {
    if (aRobe && (v.categorie === "haut" || v.categorie === "bas")) continue;
    if (vues.has(v.categorie) && v.categorie !== "bijoux") continue;
    vues.add(v.categorie);
    garde.push(v.id);
  }
  return garde;
}
