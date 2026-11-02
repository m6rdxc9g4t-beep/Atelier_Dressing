// Référentiel : catégories, saisons, occasions, longueurs.
// Les mêmes listes existent côté SQL (contraintes check) : modifier les deux côtés.

import type { Categorie, Longueur, Occasion, Saison } from "./types";

export const CATEGORIES: Categorie[] = [
  "haut",
  "bas",
  "robe",
  "veste",
  "chaussures",
  "sac",
  "chapeau",
  "lunettes",
  "echarpe",
  "bijoux",
  "ceinture",
  "autre",
];

export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  haut: "Hauts",
  bas: "Bas",
  robe: "Robes & combis",
  veste: "Vestes & manteaux",
  chaussures: "Chaussures",
  sac: "Sacs",
  chapeau: "Chapeaux",
  lunettes: "Lunettes",
  echarpe: "Écharpes",
  bijoux: "Bijoux & montres",
  ceinture: "Ceintures",
  autre: "Autres",
};

/** Libellé au singulier, pour une pièce. */
export const LIBELLE_PIECE: Record<Categorie, string> = {
  haut: "Haut",
  bas: "Bas",
  robe: "Robe / combinaison",
  veste: "Veste / manteau",
  chaussures: "Chaussures",
  sac: "Sac",
  chapeau: "Chapeau",
  lunettes: "Lunettes",
  echarpe: "Écharpe",
  bijoux: "Bijou / montre",
  ceinture: "Ceinture",
  autre: "Autre",
};

export const ACCESSOIRES: Categorie[] = ["sac", "chapeau", "lunettes", "echarpe", "bijoux", "ceinture"];
export const estAccessoire = (c: Categorie) => ACCESSOIRES.includes(c);

/** Ordre d'empilement sur le mannequin (du dessous au dessus). */
export const PLAN: Record<Categorie, number> = {
  chaussures: 10,
  bas: 20,
  haut: 30,
  robe: 32,
  ceinture: 36,
  veste: 40,
  echarpe: 50,
  bijoux: 55,
  sac: 60,
  lunettes: 70,
  chapeau: 80,
  autre: 0,
};

/** Catégories affichées sur le mannequin (« autre » reste au dressing). */
export const CATEGORIES_CABINE: Categorie[] = CATEGORIES.filter((c) => c !== "autre");

/** Une robe remplace le haut et le bas. */
export function incompatibles(c: Categorie): Categorie[] {
  if (c === "robe") return ["haut", "bas"];
  if (c === "haut" || c === "bas") return ["robe"];
  return [];
}

export const SAISONS: Saison[] = ["printemps", "ete", "automne", "hiver"];
export const LIBELLE_SAISON: Record<Saison, string> = {
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
  hiver: "Hiver",
};

export const OCCASIONS: Occasion[] = ["quotidien", "travail", "soiree", "sport", "ceremonie", "detente"];
export const LIBELLE_OCCASION: Record<Occasion, string> = {
  quotidien: "Quotidien",
  travail: "Travail",
  soiree: "Soirée",
  sport: "Sport",
  ceremonie: "Cérémonie",
  detente: "Détente",
};

export const LONGUEURS: Longueur[] = ["courte", "hanches", "cuisses", "genoux", "mollets", "chevilles"];
export const LIBELLE_LONGUEUR: Record<Longueur, string> = {
  courte: "Courte",
  hanches: "Aux hanches",
  cuisses: "Mi-cuisse",
  genoux: "Aux genoux",
  mollets: "Mi-mollet",
  chevilles: "Aux chevilles",
};

/** Longueur par défaut, selon la catégorie (quand ni l'IA ni toi ne l'avez précisée). */
export function longueurParDefaut(c: Categorie, sousType = ""): Longueur | null {
  const s = sousType.toLowerCase();
  if (c === "bas") {
    if (/short|bermuda/.test(s)) return "cuisses";
    if (/mini/.test(s)) return "cuisses";
    if (/jupe/.test(s)) return /longue|maxi/.test(s) ? "chevilles" : /midi/.test(s) ? "mollets" : "genoux";
    return "chevilles";
  }
  if (c === "robe") return /longue|maxi|combinaison|combi/.test(s) ? "chevilles" : /mini/.test(s) ? "cuisses" : "genoux";
  if (c === "veste") return /manteau|trench|parka/.test(s) ? "genoux" : "hanches";
  if (c === "haut") return /crop/.test(s) ? "courte" : "hanches";
  return null;
}

export const CATEGORIES_AVEC_LONGUEUR: Categorie[] = ["haut", "bas", "robe", "veste"];

export const LIBELLE_CHALEUR = ["", "Très léger", "Léger", "Mi-saison", "Chaud", "Très chaud"];

/** Saison du jour (hémisphère nord). */
export function saisonDuJour(d = new Date()): Saison {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "printemps";
  if (m >= 6 && m <= 8) return "ete";
  if (m >= 9 && m <= 11) return "automne";
  return "hiver";
}
